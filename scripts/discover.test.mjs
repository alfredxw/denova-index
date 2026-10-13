import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCatalog } from './catalog.mjs'
import { discoverEntries } from './discover.mjs'

const repository = name => ({ full_name: name, default_branch: 'develop', private: false, archived: false, fork: false })
const manifest = id => ({
  format: 'denova.resource-pack', schema_version: 1,
  package: { id, name: `Package ${id}`, description: 'Writing and game resources.', author: 'Author', locale: 'en-US', version: '1.0.0' },
  resources: [{ id: 'skill', kind: 'skill', path: 'skill' }],
})

function github(t, repositories, manifests) {
  const requests = [], warnings = []
  t.mock.method(console, 'warn', message => warnings.push(message))
  t.mock.method(globalThis, 'fetch', async (address, options) => {
    const url = new URL(address)
    requests.push(address)
    assert.equal(options.redirect, 'error')
    if (url.pathname === '/search/repositories') {
      assert.equal(url.searchParams.get('q'), 'topic:denova-package is:public archived:false fork:false')
      assert(['stars', 'forks', 'help-wanted-issues', 'updated'].includes(url.searchParams.get('sort')), 'Unsupported GitHub repository search sort')
      const start = (Number(url.searchParams.get('page')) - 1) * 100
      return Response.json({ total_count: repositories.length, incomplete_results: false, items: repositories.slice(start, start + 100) })
    }
    if (url.hostname === 'api.github.com') {
      assert.match(url.pathname, /^\/repos\/[^/]+\/[^/]+\/commits$/)
      assert.equal(url.searchParams.get('sha'), 'develop')
      assert.equal(url.searchParams.get('path'), '')
      return Response.json([{ sha: 'resolved-commit', commit: { committer: { date: '2026-10-13T01:00:00Z' } } }])
    }
    assert.equal(url.hostname, 'raw.githubusercontent.com')
    assert.equal(options.headers.Authorization, undefined)
    assert.match(url.pathname, /^\/[^/]+\/[^/]+\/resolved-commit\/denova-pack.json$/)
    const value = manifests[url.pathname.split('/').slice(1, 3).join('/')]
    if (value instanceof Error) throw value
    if (value instanceof Response) return value.clone()
    return value ? Response.json(value) : new Response('', { status: 404 })
  })
  return { requests, warnings }
}

test('topic search paginates and publishes only valid root manifests, respecting curation and exclusions', async t => {
  const excluded = Array.from({ length: 98 }, (_, i) => `excluded/repo-${i}`)
  const repositories = [...excluded.map(repository), repository('author/valid'), repository('author/missing'), repository('author/manual'), { ...repository('author/fork'), fork: true }]
  const registered = [{ id: 'manual', source: { kind: 'github', url: 'https://github.com/AUTHOR/manual', ref: 'v1' } }]
  const { requests, warnings } = github(t, repositories, { 'author/valid': manifest('valid') })
  const discovered = await discoverEntries(registered, excluded.map(name => name.toUpperCase()))
  const catalog = JSON.parse(buildCatalog(discovered))
  assert.deepEqual(catalog, {
    schema_version: 1,
    entries: [{ id: 'valid', name: { 'en-US': 'Package valid' }, description: { 'en-US': 'Writing and game resources.' }, author: 'Author', format: 'denova.resource-pack', kinds: ['skill'], tags: [], source: { kind: 'github', url: 'https://github.com/author/valid', ref: 'develop' }, updated_at: '2026-10-13', discovery: 'github_topic' }],
  })
  assert.equal(requests.length, 6)
  assert(requests[0].includes('/search/repositories?') && requests[1].includes('page=2'))
  assert(warnings.some(message => message.includes('author/missing') && message.includes('404')))
  assert(warnings.some(message => message.includes('excluded/repo-0')))
})

test('registered identities win and all conflicting automatic identities are omitted, independent of order', async t => {
  const repositories = ['a/first', 'b/second', 'c/impersonator', 'd/good'].map(repository)
  const registered = [{ id: 'curated', source: { kind: 'github', url: 'https://github.com/curator/packs', path: 'package', ref: 'main' } }]
  const { warnings } = github(t, repositories, { 'a/first': manifest('duplicate'), 'b/second': manifest('duplicate'), 'c/impersonator': manifest('curated'), 'd/good': manifest('good') })
  assert.deepEqual((await discoverEntries(registered, [])).map(entry => entry.id), ['good'])
  repositories.reverse()
  assert.deepEqual((await discoverEntries(registered, [])).map(entry => entry.id), ['good'])
  assert(warnings.some(message => message.includes('conflicting package ID duplicate') && message.includes('a/first') && message.includes('b/second')))
  assert(warnings.some(message => message.includes('package ID curated belongs to a registered source')))
  repositories.splice(0)
  assert.deepEqual(await discoverEntries(registered, []), [])
})

test('invalid submissions cannot claim recommendations or discovery metadata and do not block valid packages', async t => {
  const invalid = [
    { ...manifest('missing-id'), package: { ...manifest('missing-id').package, id: undefined } },
    { ...manifest('bad-featured'), package: { ...manifest('bad-featured').package, featured: true } },
    { ...manifest('bad-origin'), package: { ...manifest('bad-origin').package, discovery: 'github_topic' } },
    { ...manifest('bad-kind'), resources: [{ kind: 'unknown' }] },
    { ...manifest('boolean-cover'), package: { ...manifest('boolean-cover').package, cover: false } },
    { ...manifest('numeric-cover'), package: { ...manifest('numeric-cover').package, cover: 0 } },
    new Response('not JSON'),
  ]
  const repositories = [...invalid.map((_, i) => repository(`author/invalid-${i}`)), repository('author/good')]
  const manifests = Object.fromEntries(invalid.map((value, i) => [`author/invalid-${i}`, value]))
  const { warnings } = github(t, repositories, { ...manifests, 'author/good': manifest('good') })
  assert.deepEqual((await discoverEntries([], [])).map(entry => entry.id), ['good'])
  assert.equal(warnings.length, invalid.length)
})

test('incomplete, oversized, failed or inconsistent searches abort catalog generation', async t => {
  for (const response of [
    Response.json({ total_count: 0, incomplete_results: true, items: [] }),
    Response.json({ total_count: 1001, incomplete_results: false, items: [] }),
    Response.json({ total_count: 1, incomplete_results: false, items: [] }),
    Response.json({ total_count: 2, incomplete_results: false, items: [repository('author/a'), repository('author/a')] }),
    new Response('', { status: 403 }),
  ]) {
    t.mock.method(globalThis, 'fetch', async () => response.clone())
    await assert.rejects(discoverEntries([], []), /GitHub topic search|Metadata request failed/)
    t.mock.restoreAll()
  }
  let page = 0
  t.mock.method(globalThis, 'fetch', async () => ++page === 1
    ? Response.json({ total_count: 101, incomplete_results: false, items: Array.from({ length: 100 }, (_, i) => repository(`author/r${i}`)) })
    : new Response('', { status: 503 }))
  await assert.rejects(discoverEntries([], []), /Metadata request failed/)
  assert.equal(page, 2)
})

test('transport and rate-limit failures preserve publication instead of dropping unavailable packages', async t => {
  for (const failure of [new Response('', { status: 403 }), new Response('', { status: 422 }), new Response('', { status: 429 }), new Response('', { status: 503 }), new TypeError('fetch failed')]) {
    github(t, [repository('author/unavailable')], { 'author/unavailable': failure })
    await assert.rejects(discoverEntries([], []), /Metadata request failed/)
    t.mock.restoreAll()
  }
})

test('an empty repository is skipped without blocking valid submissions', async t => {
  const { warnings } = github(t, [repository('author/empty'), repository('author/good')], { 'author/good': manifest('good') })
  const fetchMetadata = globalThis.fetch
  t.mock.method(globalThis, 'fetch', async (url, options) => new URL(url).pathname === '/repos/author/empty/commits'
    ? Response.json({ message: 'Git Repository is empty.' }, { status: 409 })
    : fetchMetadata(url, options))
  assert.deepEqual((await discoverEntries([], [])).map(entry => entry.id), ['good'])
  assert(warnings.some(message => message.includes('author/empty') && message.includes('409')))
})

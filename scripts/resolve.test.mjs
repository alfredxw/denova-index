import test from 'node:test'
import assert from 'node:assert/strict'
import { validateRegistration, assembleEntry, resolveEntry } from './resolve.mjs'
const registration = { source: { kind: 'github', url: 'https://github.com/author/kit', ref: 'main', path: 'package' }, featured: true }
const manifest = {
  format: 'denova.resource-pack', schema_version: 1,
  package: {
    id: 'kit', name: '写作资源包', description: '叙事与文风素材。', locale: 'zh-CN', author: 'Writer', tags: ['writing'],
    usage: '导入后在创作方案中选用。',
    translations: { 'en-US': { name: 'Writing kit', description: 'Writing resources', usage: 'Select the imported resources in Creative Setups.' } },
  },
  resources: [{ kind: 'preset.narrative' }, { kind: 'style.reference' }],
}
const registered = () => validateRegistration(registration, 'kit.yaml')

test('registration contains only the source and curation, with identity from the filename', () => {
  assert.deepEqual(registered(), { ...registration, id: 'kit' })
  for (const extra of [{ id: 'kit' }, { name: manifest.package.name }, { metadata: 'https://example.com/metadata.json' }]) {
    assert.throws(() => validateRegistration({ ...registration, ...extra }, 'kit.yaml'), /package manifest/)
  }
  for (const source of [{ ...registration.source, path: '../outside' }, { ...registration.source, url: 'http://github.com/a/b' }, { ...registration.source, commit: 'not-allowed' }]) {
    assert.throws(() => validateRegistration({ ...registration, source }, 'kit.yaml'))
  }
})
test('one package manifest supplies all presentation and resource information', async () => {
  const input = registered()
  const files = { 'denova-pack.json': structuredClone(manifest) }
  const requests = []
  const read = async name => { requests.push(name); return files[name] }
  const before = await assembleEntry(input, read, '2026-09-24')
  files['denova-pack.json'].package.description = '新增开场白。'
  files['denova-pack.json'].package.translations['en-US'].description = 'Expanded writing kit'
  files['denova-pack.json'].resources.push({ kind: 'game.openings' })
  const after = await assembleEntry(input, read, '2026-09-25')
  assert.deepEqual(requests, ['denova-pack.json', 'denova-pack.json'])
  assert.deepEqual(input, registered())
  assert.deepEqual(after.name, { 'zh-CN': '写作资源包', 'en-US': 'Writing kit' })
  assert.deepEqual(after.description, { 'zh-CN': '新增开场白。', 'en-US': 'Expanded writing kit' })
  assert.equal(after.usage['zh-CN'], manifest.package.usage)
  assert.deepEqual(before.kinds, ['preset.narrative', 'style.reference'])
  assert.deepEqual(after.kinds, ['preset.narrative', 'style.reference', 'game.openings'])
  assert.equal(after.updated_at, '2026-09-25')
  assert.equal(after.author, 'Writer')
  assert.equal(after.featured, true)
})
test('manifest identity, translations and derived fields cannot conflict', async () => {
  for (const patch of [{ id: 'other' }, { locale: '' }, { name: undefined }, { description: undefined }, { tags: false }, { translations: '' }, { translations: { 'zh-CN': { name: 'Duplicate' } } }, { kinds: ['skill'] }, { source: registration.source }]) {
    await assert.rejects(assembleEntry(registered(), async () => ({ ...manifest, package: { ...manifest.package, ...patch } }), '2026-09-25'))
  }
  const single = structuredClone(manifest)
  delete single.package.translations
  delete single.package.tags
  single.resources = [{ kind: 'extension.game' }]
  const entry = await assembleEntry(registered(), async () => single, '2026-09-25')
  assert.deepEqual(entry.name, { 'zh-CN': '写作资源包' })
  assert.deepEqual(entry.tags, [])
  assert.deepEqual(entry.kinds, ['extension.game'])
})
test('remote registration reads only the manifest at the resolved commit', async t => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async url => {
    requests.push(url)
    const body = url.startsWith('https://api.github.com/')
      ? [{ sha: 'resolved-commit', commit: { committer: { date: '2026-09-25T01:00:00Z' } } }]
      : manifest
    return new Response(JSON.stringify(body))
  })
  const entry = await resolveEntry(registered())
  assert.equal(entry.updated_at, '2026-09-25')
  assert.deepEqual(requests.slice(1), ['https://raw.githubusercontent.com/author/kit/resolved-commit/package/denova-pack.json'])
  assert.deepEqual(entry.source, registration.source)
})
test('ZIP registration reads the same manifest without a separate metadata format or archive download', async t => {
  const input = validateRegistration({ source: { kind: 'https_zip', url: 'https://example.com/kit.zip' }, manifest: 'https://example.com/denova-pack.json' }, 'kit.yaml')
  const requests = []
  t.mock.method(globalThis, 'fetch', async url => {
    requests.push(url)
    return new Response(JSON.stringify({ ...manifest, package: { ...manifest.package, updated_at: '2026-09-25' } }))
  })
  const entry = await resolveEntry(input)
  assert.deepEqual(requests, ['https://example.com/denova-pack.json'])
  assert.equal(entry.updated_at, '2026-09-25')
  assert.equal(entry.manifest, undefined)
  assert.equal(entry.format, 'denova.resource-pack')
})
test('unavailable manifest fails publication rather than producing an empty package', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }))
  await assert.rejects(resolveEntry(registered()), /Manifest request failed/)
})

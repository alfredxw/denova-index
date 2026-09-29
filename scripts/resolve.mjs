import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { validateEntry } from './catalog.mjs'

// Authors maintain one package manifest; the index keeps only source and curation.
export function validateRegistration(entry, filename) {
  const id = filename.replace(/\.yaml$/, '')
  assert(/^[a-z0-9][a-z0-9_-]{0,127}$/.test(id) && filename === `${id}.yaml`, 'Invalid entry identity')
  assert(entry && Object.keys(entry).every(key => ['source', 'featured', 'manifest'].includes(key)), 'Identity and presentation fields belong in the package manifest')
  assert(entry.featured === undefined || typeof entry.featured === 'boolean', 'Invalid featured flag')
  const source = entry.source
  assert(source && ['github', 'https_zip'].includes(source.kind), 'Invalid source kind')
  assert(Object.keys(source).every(key => ['kind', 'url', 'ref', 'path'].includes(key)), 'Unknown source field')
  const url = new URL(source.url)
  assert(url.protocol === 'https:' && !url.username && !url.password && !url.hash, 'Invalid source URL')
  if (source.kind === 'github') {
    assert(url.hostname === 'github.com' && !url.port && !url.search && /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(url.pathname), 'Expected GitHub repository URL')
    assert(typeof source.ref === 'string' && source.ref.trim() && source.ref.length <= 200, 'Explicit Git ref required')
    assert(!entry.manifest, 'GitHub packages use denova-pack.json in the package directory')
    if (source.path) assert(!source.path.startsWith('/') && !source.path.includes('\\') && source.path.split('/').every(part => part && part !== '.' && part !== '..'), 'Invalid package path')
  } else {
    assert(!source.ref && !source.path, 'ZIP sources only accept a URL')
    const manifest = new URL(entry.manifest)
    assert(manifest.protocol === 'https:' && !manifest.username && !manifest.password && !manifest.hash, 'Expected public HTTPS manifest URL')
  }
  return { ...entry, id }
}

export async function assembleEntry(registration, read, updatedAt) {
  const manifest = await read('denova-pack.json')
  assert(manifest && manifest.format === 'denova.resource-pack' && manifest.schema_version === 1, 'Invalid package manifest')
  const info = manifest.package
  assert(info && info.id === registration.id, 'Package identity must match the registration filename')
  assert(Object.keys(info).every(key => ['id', 'name', 'description', 'version', 'author', 'min_denova_version', 'locale', 'translations', 'tags', 'cover', 'usage', 'compatibility', 'updated_at'].includes(key)), 'Unknown package manifest field')
  assert(typeof info.locale === 'string' && info.locale.trim(), 'Package locale required for market registration')
  assert(typeof info.name === 'string' && info.name.trim() && typeof info.description === 'string' && info.description.trim(), 'Default package name and description required')
  const translations = info.translations ?? {}
  assert(typeof translations === 'object' && !Array.isArray(translations), 'Invalid translations')
  assert(!Object.hasOwn(translations, info.locale), 'Default language text must not be repeated in translations')
  for (const text of Object.values(translations)) {
    assert(text && typeof text === 'object' && !Array.isArray(text) && Object.keys(text).every(key => ['name', 'description', 'usage', 'compatibility'].includes(key)), 'Unknown translation field')
  }
  const localized = field => {
    const values = info[field] === undefined ? {} : { [info.locale]: info[field] }
    for (const [locale, text] of Object.entries(translations)) if (text[field] !== undefined) values[locale] = text[field]
    return Object.keys(values).length ? values : undefined
  }
  assert(Array.isArray(manifest.resources) && manifest.resources.length > 0, 'Package resources required')
  return validateEntry({
    id: info.id,
    name: localized('name'), description: localized('description'), author: info.author,
    format: manifest.format, kinds: [...new Set(manifest.resources.map(resource => resource.kind))],
    tags: info.tags ?? [], cover: info.cover, usage: localized('usage'), compatibility: localized('compatibility'),
    source: registration.source, featured: registration.featured, updated_at: updatedAt || info.updated_at,
  }, `${registration.id}.yaml`)
}

async function fetchJSON(url, token) {
  const response = await fetch(url, {
    redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: token ? { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } : {},
  })
  assert(response.ok, `Manifest request failed: ${response.status} ${url}`)
  let length = 0
  const chunks = []
  for await (const chunk of response.body) {
    length += chunk.length
    assert(length <= 4 * 1024 * 1024, 'Manifest response exceeds 4 MiB')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export async function resolveEntry(entry) {
  if (entry.source.kind === 'https_zip') {
    return assembleEntry(entry, () => fetchJSON(entry.manifest))
  }
  const { url, ref, path = '' } = entry.source
  if (url === 'https://github.com/alfredxw/denova-index' && ref === 'main') {
    const date = execFileSync('git', ['log', '-1', '--format=%cs', '--', path || '.'], { encoding: 'utf8' }).trim()
    return assembleEntry(entry, async name => JSON.parse(await readFile(`${path ? `${path}/` : ''}${name}`, 'utf8')), date)
  }
  const repository = new URL(url).pathname.slice(1)
  const query = new URLSearchParams({ sha: ref, path, per_page: '1' })
  const commits = await fetchJSON(`https://api.github.com/repos/${repository}/commits?${query}`, process.env.GITHUB_TOKEN)
  assert(commits[0]?.sha, 'Package directory has no commit')
  const commit = commits[0]
  // Read the single descriptor from the resolved commit; never download or execute package code.
  const directory = path.split('/').map(encodeURIComponent).join('/')
  const root = `https://raw.githubusercontent.com/${repository}/${commit.sha}/${directory ? `${directory}/` : ''}`
  return assembleEntry(entry, name => fetchJSON(root + name), commit.commit.committer.date.slice(0, 10))
}

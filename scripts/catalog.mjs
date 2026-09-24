import assert from 'node:assert/strict'
const kinds = new Set(['preset.narrative', 'preset.image', 'preset.game_planning', 'preset.events', 'preset.rules', 'preset.actor_state', 'style.reference', 'skill', 'lore.item', 'game.opening', 'project.cover', 'extension.plugin', 'extension.game'])
const formats = new Set(['skill', 'extension.plugin', 'extension.game', 'denova.resource-pack', 'character_card'])
const idPattern = /^[a-z0-9][a-z0-9_-]{0,127}$/
function localized(value) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Expected localized text')
  assert(Object.keys(value).length > 0 && Object.keys(value).length <= 8, 'Invalid translations')
  for (const [locale, text] of Object.entries(value)) {
    assert(/^[a-z]{2}(?:-[A-Za-z]{2,4})?$/.test(locale), 'Invalid locale')
    assert(typeof text === 'string' && text.trim() && text.length <= 2000, 'Invalid text')
  }
}
export function validateEntry(entry, filename) {
  assert(entry && idPattern.test(entry.id) && filename === `${entry.id}.yaml`, 'Invalid entry identity')
  assert(Object.keys(entry).every(key => ['id', 'name', 'description', 'author', 'format', 'kinds', 'tags', 'source', 'updated_at', 'featured', 'cover', 'compatibility'].includes(key)), 'Unknown entry field')
  localized(entry.name)
  localized(entry.description)
  assert(typeof entry.author === 'string' && entry.author.length > 0 && entry.author.length <= 200, 'Invalid author')
  assert(formats.has(entry.format), 'Invalid package format')
  assert(Array.isArray(entry.kinds) && entry.kinds.length > 0 && entry.kinds.every(kind => kinds.has(kind)), 'Invalid resource kinds')
  assert(new Set(entry.kinds).size === entry.kinds.length, 'Duplicate resource kinds')
  assert(Array.isArray(entry.tags) && entry.tags.length <= 20 && entry.tags.every(tag => typeof tag === 'string' && idPattern.test(tag)), 'Invalid tags')
  assert(typeof entry.updated_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.updated_at) && !Number.isNaN(Date.parse(entry.updated_at)), 'Invalid date')
  assert(entry.featured === undefined || typeof entry.featured === 'boolean', 'Invalid featured flag')
  if (entry.compatibility) localized(entry.compatibility)
  const source = entry.source
  assert(source && ['github', 'https_zip'].includes(source.kind), 'Invalid source kind')
  assert(Object.keys(source).every(key => ['kind', 'url', 'ref', 'path'].includes(key)), 'Unknown source field')
  const url = new URL(source.url)
  assert(url.protocol === 'https:' && !url.username && !url.password && !url.hash, 'Invalid source URL')
  if (source.kind === 'github') {
    assert(url.hostname === 'github.com' && !url.port && !url.search && /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(url.pathname), 'Expected GitHub repository URL')
    assert(typeof source.ref === 'string' && source.ref.trim() && source.ref.length <= 200, 'Explicit Git ref required')
    if (source.path) assert(!source.path.startsWith('/') && !source.path.includes('\\') && source.path.split('/').every(part => part && part !== '.' && part !== '..'), 'Invalid package path')
  } else assert(!source.ref && !source.path, 'ZIP sources only accept a URL')
  if (entry.cover) {
    const cover = new URL(entry.cover)
    assert(cover.protocol === 'https:' && !cover.username && !cover.password && /\.(png|jpe?g|webp)$/i.test(cover.pathname), 'Expected static HTTPS cover')
  }
  return entry
}
export function buildCatalog(entries) {
  assert(entries.length <= 5000, 'Too many entries')
  assert(new Set(entries.map(entry => entry.id)).size === entries.length, 'Duplicate entry ID')
  const bytes = JSON.stringify({ schema_version: 1, entries: entries.toSorted((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id)) }, null, 2) + '\n'
  assert(Buffer.byteLength(bytes) <= 4 * 1024 * 1024, 'Catalog exceeds 4 MiB')
  return bytes
}

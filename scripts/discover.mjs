import assert from 'node:assert/strict'
import { fetchJSON, MetadataRequestError } from './metadata.mjs'
import { resolveEntry } from './resolve.mjs'

// A complete search is required before resolving packages or replacing the published catalog.
async function topicRepositories() {
  const repositories = new Map()
  let total
  for (let page = 1; ; page++) {
    const query = new URLSearchParams({
      q: 'topic:denova-package is:public archived:false fork:false',
      sort: 'updated', order: 'asc', per_page: '100', page: String(page),
    })
    const result = await fetchJSON(`https://api.github.com/search/repositories?${query}`, process.env.GITHUB_TOKEN)
    assert(result.incomplete_results === false && Number.isInteger(result.total_count) && result.total_count >= 0 && Array.isArray(result.items), 'GitHub topic search is incomplete')
    assert(result.total_count <= 1000, 'GitHub topic search exceeds its 1000-result limit')
    total ??= result.total_count
    assert(total === result.total_count, 'GitHub topic search changed during pagination')
    for (const repository of result.items) repositories.set(repository.full_name.toLowerCase(), repository)
    if (page * 100 >= total) break
    assert(result.items.length === 100, 'GitHub topic search returned an incomplete page')
  }
  assert(repositories.size === total, 'GitHub topic search returned duplicate or missing repositories')
  return [...repositories.values()]
}

// Only root packages on the default branch are discovered. Curated registrations
// retain control over other directories and refs, recommendations and identity conflicts.
export async function discoverEntries(registered, excludedRepositories) {
  assert(Array.isArray(excludedRepositories) && excludedRepositories.every(name => typeof name === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name)), 'Invalid excluded repository list')
  const excluded = new Set(excludedRepositories.map(name => name.toLowerCase()))
  const registeredRoots = new Set(registered.filter(entry => entry.source.kind === 'github' && !entry.source.path).map(entry => entry.source.url.toLowerCase()))
  const registeredIDs = new Set(registered.map(entry => entry.id))
  const candidates = new Map()
  for (const repository of await topicRepositories()) {
    const name = repository.full_name
    const url = `https://github.com/${name}`
    if (repository.private || repository.archived || repository.fork || registeredRoots.has(url.toLowerCase())) continue
    if (excluded.has(name.toLowerCase())) {
      console.warn(`Topic discovery skipped ${name}: repository excluded`)
      continue
    }
    try {
      const entry = await resolveEntry({ source: { kind: 'github', url, ref: repository.default_branch } })
      if (registeredIDs.has(entry.id)) {
        console.warn(`Topic discovery skipped ${name}: package ID ${entry.id} belongs to a registered source`)
        continue
      }
      const group = candidates.get(entry.id) ?? []
      group.push({ ...entry, discovery: 'github_topic' })
      candidates.set(entry.id, group)
    } catch (error) {
      // Missing/invalid manifests and empty repositories are individual submission failures. Network,
      // rate-limit and server failures preserve the previous complete publication.
      if (error instanceof MetadataRequestError && ![404, 409].includes(error.status)) throw error
      console.warn(`Topic discovery skipped ${name}: ${error.message}`)
    }
  }
  const entries = []
  for (const [id, group] of candidates) {
    if (group.length === 1) entries.push(group[0])
    else console.warn(`Topic discovery skipped conflicting package ID ${id}: ${group.map(entry => entry.source.url).join(', ')}`)
  }
  return entries
}

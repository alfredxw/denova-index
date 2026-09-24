import test from 'node:test'
import assert from 'node:assert/strict'
import { validateEntry, buildCatalog } from './catalog.mjs'
const entry = { id: 'example', name: { en: 'Example' }, description: { en: 'A skill' }, author: 'Author', format: 'skill', kinds: ['skill'], tags: ['writing'], updated_at: '2026-09-24', source: { kind: 'github', url: 'https://github.com/author/repo', ref: 'main', path: 'skills/example' } }
test('catalog roundtrip and identity validation', () => {
  assert.equal(validateEntry(entry, 'example.yaml'), entry)
  assert.deepEqual(JSON.parse(buildCatalog([entry])).entries, [entry])
  assert.throws(() => buildCatalog([entry, entry]), /Duplicate/)
  assert.throws(() => validateEntry(entry, 'other.yaml'), /identity/)
})
test('rejects unsafe source and unknown resource kind', () => {
  for (const source of [{ ...entry.source, url: 'http://github.com/author/repo' }, { ...entry.source, url: 'https://user:password@github.com/author/repo' }, { ...entry.source, path: '../outside' }, { ...entry.source, command: 'run me' }]) assert.throws(() => validateEntry({ ...entry, source }, 'example.yaml'))
  assert.throws(() => validateEntry({ ...entry, kinds: ['unknown'] }, 'example.yaml'))
})

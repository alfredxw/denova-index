import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { parseDocument } from 'yaml'
import { buildCatalog } from './catalog.mjs'
import { validateRegistration, resolveEntry } from './resolve.mjs'
const entries = []
for (const name of (await readdir('entries')).filter(name => name.endsWith('.yaml')).sort()) {
  const document = parseDocument(await readFile(`entries/${name}`, 'utf8'), { uniqueKeys: true })
  if (document.errors.length) throw document.errors[0]
  entries.push(await resolveEntry(validateRegistration(document.toJS({ maxAliasCount: 0 }), name)))
}
const catalog = buildCatalog(entries)
await mkdir('dist', { recursive: true })
await writeFile('dist/index.json', catalog)
await writeFile('dist/index.html', '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Denova index</title><h1>Denova index</h1><p>A public package catalog for Denova.</p><p><a href="index.json">Catalog JSON</a> · <a href="https://github.com/alfredxw/denova-index">Contribute</a></p></html>')
console.log(`Built ${entries.length} entries (${Buffer.byteLength(catalog)} bytes)`)

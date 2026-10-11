import { execFileSync } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Ship the license texts with the prebuilt frontend; installers need no npm
// dependencies. Only relative package names and versions enter the artifact.
const root = fileURLToPath(new URL('../', import.meta.url))
const report = JSON.parse(execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], { cwd: root, encoding: 'utf8' }))
const packages = Object.values(report).flat()
for (const name of ['shadcn', 'tailwindcss', 'tw-animate-css']) {
  const directory = path.join(root, 'node_modules', name)
  const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
  packages.push({ name, versions: [metadata.version], paths: [directory] })
}
const notices = ['Third-party licenses for the Comic Studio frontend.\nshadcn/ui components: https://ui.shadcn.com\n']
for (const item of packages.sort((a, b) => a.name.localeCompare(b.name))) {
  for (const directory of item.paths) {
    const files = (await readdir(directory)).filter(name => /^licen[cs]e(?:[.-]|$)/i.test(name))
    notices.push(`\n${'='.repeat(72)}\n${item.name} ${item.versions.join(', ')}\n`)
    // This published npm package omits LICENSE. Keep the upstream text local
    // so builds remain reproducible without contacting GitHub.
    if (!files.length) notices.push(await readFile(new URL(`licenses/${item.name.replace('/', '__')}.txt`, import.meta.url), 'utf8'))
    for (const name of files) notices.push(await readFile(path.join(directory, name), 'utf8'))
  }
}
await writeFile(new URL('../../plugin/THIRD_PARTY_NOTICES', import.meta.url), notices.join('\n'))

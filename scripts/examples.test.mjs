import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { parse } from 'yaml';
import { statistics } from '../examples/extension-starter/text-statistics/statistics.mjs';

test('text statistics handles whitespace, multilingual text and grapheme clusters', () => {
  assert.deepEqual(statistics(''), { characters: 0, wordSegments: 0, paragraphs: 0, sentences: 0 });
  assert.deepEqual(statistics('Hello world.\n\nGood night!'), { characters: 21, wordSegments: 4, paragraphs: 2, sentences: 2 });
  assert.equal(statistics('你好👩‍👩‍👧‍👦 e\u0301').characters, 4);
  assert.equal(statistics('第一句。第二句！').sentences, 2);
  assert.throws(() => statistics(null));
  assert.throws(() => statistics('a'.repeat(100001)));
});

test('mixed example packages resolve files, directories, dependencies and extension distributions', async () => {
  const packages = [];
  for (const file of await readdir('entries')) {
    const entry = parse(await readFile(`entries/${file}`, 'utf8'));
    if (entry.source.url !== 'https://github.com/alfredxw/denova-index') continue;
    const root = entry.source.path;
    const manifest = JSON.parse(await readFile(`${root}/denova-pack.json`));
    assert.equal(manifest.package.id, entry.id);
    const ids = new Map(manifest.resources.map(resource => [resource.id, resource]));
    assert.equal(ids.size, manifest.resources.length);
    function walk(id, parents = []) {
      assert(ids.has(id), `Missing dependency ${id}`);
      assert(!parents.includes(id), `Dependency cycle ${id}`);
      for (const dependency of ids.get(id).requires || []) walk(dependency, [...parents, id]);
    }
    for (const resource of manifest.resources) {
      walk(resource.id);
      assert(!resource.path.startsWith('/') && !resource.path.split('/').includes('..'));
      const path = `${root}/${resource.path}`;
      const directory = resource.kind === 'skill' || resource.kind.startsWith('extension.');
      assert.equal((await stat(path)).isDirectory(), directory, path);
      for (const asset of resource.assets || []) assert((await stat(`${root}/${asset}`)).isFile());
      if (resource.kind === 'skill') {
        const content = await readFile(`${path}/SKILL.md`, 'utf8');
        const metadata = parse(content.split('---')[1]);
        assert.equal(metadata.name, resource.id);
        assert(metadata.description);
      } else if (resource.kind.startsWith('extension.')) {
        const kind = resource.kind.split('.')[1];
        const extension = JSON.parse(await readFile(`${path}/denova.${kind}.json`));
        assert.equal(extension.apiMajor, 1);
        const distributed = name => extension.distribution.files.some(file => name === file || name.startsWith(file + '/'));
        for (const name of extension.distribution.files) await stat(`${path}/${name}`);
        for (const name of Object.values(extension.locales)) assert(distributed(name));
        const locales = await Promise.all(Object.values(extension.locales).map(async file => JSON.parse(await readFile(`${path}/${file}`))));
        assert.deepEqual(Object.keys(locales[0]).sort(), Object.keys(locales[1]).sort());
        for (const agent of extension.definitions?.agents || []) {
          assert(distributed(agent.definition));
          const definition = JSON.parse(await readFile(`${path}/${agent.definition}`));
          assert(extension.modelSlots.some(slot => slot.id === definition.modelSlot));
          assert(extension.game.uses.agents.includes(`local:${agent.id}`));
        }
      } else if (resource.kind !== 'style.reference') {
        const payload = JSON.parse(await readFile(path));
        for (const ref of payload.style_refs || []) {
          assert.equal(ids.get(ref)?.kind, 'style.reference');
          assert(resource.requires.includes(ref));
        }
        if (resource.kind === 'game.opening') {
          assert(resource.requires.length > 0);
          assert(resource.requires.every(id => ids.get(id)?.kind === 'lore.item'));
        }
      }
    }
    assert.deepEqual([...new Set(manifest.resources.map(resource => resource.kind))].sort(), [...entry.kinds].sort());
    packages.push(entry.id);
  }
  assert.deepEqual(packages.sort(), ['cultivation-starter', 'extension-starter']);
});

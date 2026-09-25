import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { parse } from 'yaml';
import { statistics } from '../examples/text-statistics/statistics.mjs';
import { choose, currentScene, initialSave, scenes } from '../examples/lantern-crossing/story.mjs';

test('text statistics handles whitespace, multilingual text and grapheme clusters', () => {
  assert.deepEqual(statistics(''), { characters: 0, wordSegments: 0, paragraphs: 0, sentences: 0 });
  assert.deepEqual(statistics('Hello world.\n\nGood night!'), { characters: 21, wordSegments: 4, paragraphs: 2, sentences: 2 });
  assert.equal(statistics('你好👩‍👩‍👧‍👦 e\u0301').characters, 4);
  assert.equal(statistics('第一句。第二句！').sentences, 2);
  assert.throws(() => statistics(null));
  assert.throws(() => statistics('a'.repeat(100001)));
});

test('all reachable story choices and localized copy are complete', async () => {
  const locales = await Promise.all(['en-US', 'zh-CN'].map(async locale => JSON.parse(await readFile(`examples/lantern-crossing/locales/${locale}.json`))));
  const visited = new Set(), endings = new Set();
  function walk(save) {
    const scene = currentScene(JSON.parse(JSON.stringify(save)));
    visited.add(scene);
    for (const locale of locales) {
      assert(locale.scenes[scene].title && locale.scenes[scene].text);
      assert.deepEqual(Object.keys(locale.scenes[scene].choices), Object.keys(scenes[scene].choices));
    }
    if (!Object.keys(scenes[scene].choices).length) endings.add(scene);
    for (const choice of Object.keys(scenes[scene].choices)) walk(choose(save, choice));
  }
  walk(initialSave());
  assert.equal(visited.size, Object.keys(scenes).length);
  assert.equal(endings.size, 2);
  for (const save of [{ version: 2, path: [] }, { version: 1, path: ['bell'] }, { version: 1, path: ['toString'] }, { version: 1, path: 'inspect' }]) assert.throws(() => currentScene(save));
  assert.throws(() => choose(initialSave(), 'constructor'));
});

test('bundled examples match catalog types and contain their declared payloads', async () => {
  const covered = new Set();
  for (const file of await readdir('entries')) {
    const entry = parse(await readFile(`entries/${file}`, 'utf8'));
    // Third-party entries remain metadata-only and are never executed or fetched in CI.
    if (entry.source.url !== 'https://github.com/alfredxw/denova-index') continue;
    const root = entry.source.path;
    assert(root.startsWith('examples/'));
    let kinds;
    if (entry.format === 'denova.resource-pack') {
      const manifest = JSON.parse(await readFile(`${root}/denova-pack.json`));
      const ids = new Set(manifest.resources.map(resource => resource.id));
      for (const resource of manifest.resources) {
        assert((await stat(`${root}/${resource.path}`)).isFile());
        for (const dependency of resource.requires || []) assert(ids.has(dependency));
      }
      kinds = manifest.resources.map(resource => resource.kind);
    } else if (entry.format.startsWith('extension.')) {
      const kind = entry.format.split('.')[1];
      const manifest = JSON.parse(await readFile(`${root}/denova.${kind}.json`));
      for (const file of manifest.distribution.files) await stat(`${root}/${file}`);
      assert.equal(manifest.apiMajor, 1);
      kinds = [entry.format];
    } else {
      assert((await readFile(`${root}/SKILL.md`, 'utf8')).startsWith('---\n'));
      kinds = ['skill'];
    }
    assert.deepEqual([...new Set(kinds)].sort(), [...entry.kinds].sort());
    kinds.forEach(kind => covered.add(kind));
  }
  assert(covered.size >= 8, 'Examples should cover more than Skills');
});

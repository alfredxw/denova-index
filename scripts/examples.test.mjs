import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { parse } from 'yaml';
import { validateRegistration, resolveEntry } from './resolve.mjs';
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
    const registration = validateRegistration(parse(await readFile(`entries/${file}`, 'utf8')), file);
    if (registration.source.url !== 'https://github.com/alfredxw/denova-index') continue;
    const entry = await resolveEntry(registration);
    assert.equal(entry.format, 'denova.resource-pack');
    assert(entry.usage['zh-CN']);
    assert(entry.usage['en-US']);
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
        if (resource.kind === 'game.openings') {
          assert(resource.requires.length > 0);
          assert(resource.requires.every(id => ids.get(id)?.kind === 'lore.collection'));
        }
      }
    }
    assert.deepEqual([...new Set(manifest.resources.map(resource => resource.kind))].sort(), [...entry.kinds].sort());
    packages.push(entry.id);
  }
  assert.deepEqual(packages.sort(), ['cultivation-starter', 'extension-starter']);
});

test('cultivation world distributes independently addressable lore in one collection', async () => {
  const root = 'examples/cultivation-starter';
  const manifest = JSON.parse(await readFile(`${root}/denova-pack.json`));
  const resources = manifest.resources.filter(resource => resource.kind === 'lore.collection');
  assert.equal(resources.length, 1);
  const collection = JSON.parse(await readFile(`${root}/${resources[0].path}`));
  assert.equal(collection.version, 1);
  assert(collection.items.length >= 50);
  assert.equal(new Set(collection.items.map(item => item.id)).size, collection.items.length);
  assert.equal(new Set(collection.items.map(item => item.name)).size, collection.items.length);
  for (const type of ['character', 'location', 'faction', 'world', 'item']) assert(collection.items.some(item => item.type === type));
  for (const item of collection.items) {
    assert(item.content.trim().length > 0, `Incomplete setting: ${item.name}`);
    assert(item.brief_description && item.keywords.length && item.enabled);
    assert(['resident', 'auto', 'manual'].includes(item.load_mode));
  }
  assert.equal(collection.items.filter(item => item.load_mode === 'resident').length, 1);
  const rules = JSON.parse(await readFile(`${root}/rules.json`));
  assert.equal(manifest.resources.find(item => item.id === rules.actor_state_id).kind, 'preset.actor_state');
  assert(manifest.resources.find(item => item.id === 'rules').requires.includes(rules.actor_state_id));
  const state = JSON.parse(await readFile(`${root}/actor-state.json`));
  assert(state.actor_state.templates[0].fields.some(field => field.name === '财物'));
  const events = JSON.parse(await readFile(`${root}/events.json`));
  assert.equal(new Set(events.events.map(event => event.id)).size, events.events.length);
  assert(events.events.every(event => event.type_name && event.description_markdown));
});

test('cultivation authored content stays within the 50000 character budget', async () => {
  const root = 'examples/cultivation-starter';
  function countStrings(value) {
    if (typeof value === 'string') return Array.from(value).length;
    if (!value || typeof value !== 'object') return 0;
    return Object.values(value).reduce((total, child) => total + countStrings(child), 0);
  }
  let characters = 0;
  for (const file of ['lore', 'openings', 'narrative', 'actor-state', 'rules', 'events', 'illustration']) {
    characters += countStrings(JSON.parse(await readFile(`${root}/${file}.json`, 'utf8')));
  }
  characters += Array.from(await readFile(`${root}/skills/book-analysis/SKILL.md`, 'utf8')).length;
  assert(characters <= 50000, `Authored content exceeds the budget: ${characters} characters`);
});

// Check the authored package boundary, not just filenames in the catalog.
test('cultivation openings use one collection and editable prompts are Chinese', async () => {
  const root = 'examples/cultivation-starter';
  const manifest = JSON.parse(await readFile(`${root}/denova-pack.json`));
  const resources = manifest.resources.filter(resource => resource.kind === 'game.openings');
  assert.equal(resources.length, 1);
  const collection = JSON.parse(await readFile(`${root}/${resources[0].path}`));
  assert.equal(collection.version, 1);
  assert.equal(collection.items.length, 4);
  assert.equal(new Set(collection.items.map(item => item.id)).size, 4);
  for (const item of collection.items) assert(item.title && item.content);
  const descriptions = new Set(['name', 'description', 'content', 'prompt', 'update_instruction', 'description_markdown', 'trigger', 'difficulty_guidance', 'state_effect_guidance', 'success_hint', 'failure_hint']);
  function check(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, field] of Object.entries(value)) {
      if (descriptions.has(key) && typeof field === 'string') assert(/[\u4e00-\u9fff]/u.test(field), `Expected a readable Chinese ${key}: ${field}`);
      check(field);
    }
  }
  for (const file of ['narrative', 'illustration', 'actor-state', 'rules', 'events']) check(JSON.parse(await readFile(`${root}/${file}.json`)));
});

test('cultivation recommends six playable characters and packages eight local material covers', async () => {
  const root = 'examples/cultivation-starter';
  const manifest = JSON.parse(await readFile(`${root}/denova-pack.json`));
  const lore = JSON.parse(await readFile(`${root}/lore.json`));
  const candidates = lore.items.filter(item => item.tags.includes('主角'));
  assert.deepEqual(candidates.map(item => item.id), ['meng-chi', 'ji-hanzhang', 'gu-tingyun', 'song-wenqu', 'lu-zhaotang', 'zhu-qingyan']);
  assert(candidates.every(item => item.enabled && item.type === 'character' && item.importance === 'major' && item.load_mode === 'auto'));
  assert.equal(candidates.filter(item => /岁，男，/.test(item.content)).length, 4);
  assert.equal(candidates.filter(item => /岁，女，/.test(item.content)).length, 2);
  const assets = manifest.resources.find(resource => resource.id === 'lore').assets;
  const illustrated = lore.items.filter(item => item.materials);
  assert.equal(illustrated.length, 8);
  assert.equal(illustrated.filter(item => item.type === 'character' && /岁，女，/.test(item.content)).length, 7);
  const referenced = [];
  for (const item of illustrated) {
    const { entries, cover_asset_path } = item.materials;
    assert(entries.some(entry => entry.asset_path === cover_asset_path));
    for (const entry of entries) {
      assert(entry.name && entry.description);
      assert(assets.includes(entry.asset_path));
      const png = await readFile(`${root}/${entry.asset_path}`);
      assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
      assert(width >= 1024 && height >= 900);
      assert(item.type === 'world' ? width > height : height > width);
      referenced.push(entry.asset_path);
    }
  }
  assert.deepEqual([...referenced].sort(), [...assets].sort());
  assert(lore.items.find(item => item.id === 'world').materials.entries[0].name.includes('通用背景'));
});

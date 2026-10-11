import test from 'node:test';
import assert from 'node:assert/strict';
import { createEpisode, createPage, readPage, renderPage, recoverJob, adoptResult, StudioError } from '../examples/comic-studio/plugin/web/studio.mjs';

function host() {
  const documents = new Map(), assets = new Map(), jobs = new Map(); let calls = 0, revision = 0;
  documents.set('comic/comic.json', { content: JSON.stringify({ version: 1, title: '', episodes: [], imageModelId: 'image-a' }), revision: '0' });
  const error = code => Object.assign(new Error(code), { code });
  const client = { async request(path, options = {}) {
    const url = new URL(path, 'http://test'); const input = options.body ? JSON.parse(options.body) : {};
    switch (url.pathname) {
      case '/project-content/file': {
        const key = url.searchParams.get('path') ?? input.path;
        const current = documents.get(key);
        if (!options.method) { if (!current) throw error('NOT_FOUND'); return structuredClone(current); }
        if ((current?.revision ?? 'missing') !== input.expectedRevision) throw error('DOCUMENT_CONFLICT');
        const saved = { content: input.content, revision: String(++revision) }; documents.set(key, saved); return { revision: saved.revision };
      }
      case '/library/items/hero': return { id: 'hero', name: 'Hero', content: 'A detective in a yellow coat.', image: { kind: 'project', path: 'assets/hero.png' } };
      case '/images/generations': {
        if (jobs.has(input.commandId)) return jobs.get(input.commandId);
        calls++; const value = { status: 'completed', images: [{ asset: { kind: 'generated', path: `${input.commandId}.png` }, mimeType: 'image/png' }] };
        jobs.set(input.commandId, value); return value;
      }
      case '/project-content/adopt': assets.set(input.path, input.asset); return { asset: { kind: 'project', path: input.path }, mimeType: 'image/png' };
      case '/assets/content': return new Response(null, { headers: { 'Content-Type': 'image/png' } });
      default: if (url.pathname.startsWith('/images/generations/')) { const job = jobs.get(url.pathname.split('/').at(-1)); if (!job) throw error('NOT_FOUND'); return job; }
    }
    throw new Error(`Unexpected route ${path}`);
  } };
  return { client, documents, assets, jobs, calls: () => calls };
}

test('comic edits retain sources, ordered references and candidates under the same Project', async () => {
  const state = host(); const episode = await createEpisode(state.client); const page = await createPage(state.client, episode.id);
  const first = await renderPage(state.client, { pageId: page.id, commandId: 'generation-one', prompt: 'A detective enters the station.', references: [{ libraryId: 'hero' }] });
  assert.match(first.asset.path, /^comic\/assets\/pages\//);
  let saved = await readPage(state.client, page.id); assert.equal(saved.data.currentId, null);
  await adoptResult(state.client, page.id, saved, first.id);
  const secondInput = { pageId: page.id, commandId: 'edit-two', sourceId: first.id, prompt: 'Change the dialogue to Hello.', selection: { x: .1, y: .2, width: .3, height: .4 }, references: [{ libraryId: 'hero' }, { asset: { kind: 'project', path: 'comic/assets/references/style.png' }, label: 'Watercolor' }] };
  const second = await renderPage(state.client, secondInput);
  assert.equal(second.sourceId, first.id); assert.deepEqual(second.selection, secondInput.selection);
  saved = await readPage(state.client, page.id);
  assert.equal(saved.data.currentId, first.id); assert.deepEqual(saved.data.results.map(item => item.id), ['generation-one', 'edit-two']);
  const request = saved.data.jobs[1].request; assert.deepEqual(request.source, first.asset); assert.equal(request.references.length, 2); assert.match(request.prompt, /Reference image 2: Hero/);
  const comic = structuredClone(state.documents.get('comic/comic.json'));
  const data = JSON.parse(comic.content); data.imageModelId = 'image-b'; comic.content = JSON.stringify(data);
  state.documents.set('comic/comic.json', comic);
  assert.equal(second.modelId, 'image-a');
  await renderPage(state.client, secondInput); assert.equal(state.calls(), 2, 'retry generated a duplicate paid image');
  await adoptResult(state.client, page.id, saved, second.id);
  assert.equal((await readPage(state.client, page.id)).data.currentId, second.id);
  assert.equal(state.assets.size, 2, 'source image was removed');
});

test('adoption rejects a stale page and recovery never resubmits an uncertain image', async () => {
  const state = host(), episode = await createEpisode(state.client, 'Episode'), page = await createPage(state.client, episode.id);
  const first = await renderPage(state.client, { pageId: page.id, commandId: 'first', prompt: 'First page' });
  const stale = await readPage(state.client, page.id);
  await renderPage(state.client, { pageId: page.id, commandId: 'second', prompt: 'Second page' });
  await assert.rejects(adoptResult(state.client, page.id, stale, first.id), error => error.code === 'DOCUMENT_CONFLICT');
  const saved = await readPage(state.client, page.id); saved.data.jobs.push({ commandId: 'uncertain', status: 'running' });
  const { savePage } = await import('../examples/comic-studio/plugin/web/studio.mjs'); await savePage(state.client, page.id, saved);
  await assert.rejects(recoverJob(state.client, page.id, saved.data.jobs.at(-1)), error => error.code === 'INTERRUPTED');
  assert.equal(state.calls(), 2); assert.equal((await readPage(state.client, page.id)).data.jobs.at(-1).status, 'interrupted');
});

test('outline operations preserve page data, reject stale edits and restore deleted hierarchies', async () => {
  const { readComic, updateOutline } = await import('../examples/comic-studio/plugin/web/studio.mjs');
  const state = host(), a = await createEpisode(state.client), b = await createEpisode(state.client);
  const first = await createPage(state.client, a.id), second = await createPage(state.client, a.id);
  await renderPage(state.client, { pageId: second.id, commandId: 'kept-image', prompt: 'A rainy station' });
  const pageBefore = await readPage(state.client, second.id);
  const stale = await readComic(state.client);
  let saved = await updateOutline(state.client, stale, { type: 'rename', episodeId: a.id, title: '  Arrival  ' });
  assert.equal(saved.data.episodes[0].title, 'Arrival');
  await assert.rejects(updateOutline(state.client, stale, { type: 'delete', id: a.id }), error => error.code === 'DOCUMENT_CONFLICT');
  assert.equal(stale.data.episodes.length, 2, 'failed save mutated the visible snapshot');
  saved = await updateOutline(state.client, saved, { type: 'move', id: b.id, overId: a.id });
  assert.deepEqual(saved.data.episodes.map(item => item.id), [b.id, a.id]);
  saved = await updateOutline(state.client, saved, { type: 'move', episodeId: a.id, id: second.id, overId: first.id });
  assert.deepEqual(saved.data.episodes[1].pages, [second, first]);
  saved = await updateOutline(state.client, saved, { type: 'delete', episodeId: a.id, id: second.id });
  saved = await updateOutline(state.client, saved, { type: 'delete', id: a.id });
  assert.deepEqual((await readComic(state.client)).data.episodes.map(item => item.id), [b.id]);
  assert.deepEqual(await readPage(state.client, second.id), pageBefore);
  await assert.rejects(updateOutline(state.client, saved, { type: 'restore', id: second.id }), error => error.code === 'NOT_FOUND');
  saved = await updateOutline(state.client, await readComic(state.client), { type: 'restore', id: a.id });
  saved = await updateOutline(state.client, saved, { type: 'restore', id: second.id });
  assert.deepEqual(saved.data.episodes[1], { ...a, title: 'Arrival', pages: [second, first] });
  assert.deepEqual(saved.data.trash, []);
  assert.deepEqual(await readPage(state.client, second.id), pageBefore);
});

test('episode scripts survive interruption and freeze shared references across all pages', async () => {
  const { saveEpisodePlan, inspectEpisode } = await import('../examples/comic-studio/plugin/web/episode.mjs');
  const state = host(), episode = await createEpisode(state.client);
  const a = await createPage(state.client, episode.id), b = await createPage(state.client, episode.id);
  const plan = await saveEpisodePlan(state.client, { episodeId: episode.id, references: [{ libraryId: 'hero', note: 'Character identity' }], pages: [
    { pageId: a.id, prompt: 'Arrival', expectedRevision: (await readPage(state.client, a.id)).revision },
    { pageId: b.id, prompt: 'Departure', expectedRevision: (await readPage(state.client, b.id)).revision },
  ] });
  assert.equal(plan.items.every(item => item.status === 'saved'), true);
  const frozen = plan.references[0]; assert.equal(frozen.libraryId, 'hero'); assert.match(frozen.asset.path, /^comic\/assets\/references\//);
  let progress = await inspectEpisode(state.client, episode.id);
  assert.deepEqual(progress.progress, { total: 2, generated: 0, adopted: 0, pending: 2, running: 0, failed: 0, interrupted: 0 });
  const first = await renderPage(state.client, { pageId: a.id });
  const settings = state.documents.get('comic/comic.json'), changed = JSON.parse(settings.content); changed.imageModelId = 'image-b'; settings.content = JSON.stringify(changed);
  const original = state.client.request;
  state.client.request = (path, options) => path === '/library/items/hero' ? Promise.reject(new Error('Live library must not be read during rendering')) : original(path, options);
  const edited = await readPage(state.client, b.id); edited.data.references = [{ content: 'New manual-page references' }];
  const { savePage } = await import('../examples/comic-studio/plugin/web/studio.mjs'); await savePage(state.client, b.id, edited);
  const second = await renderPage(state.client, { pageId: b.id });
  assert.equal(first.modelId, 'image-a'); assert.equal(second.modelId, 'image-a');
  assert.deepEqual(first.references, second.references);
  assert.equal((await renderPage(state.client, { pageId: a.id })).id, first.id);
  assert.equal(state.calls(), 2);
  progress = await inspectEpisode(state.client, episode.id);
  assert.equal(progress.progress.generated, 2); assert.equal(progress.progress.pending, 0);
  assert.equal(progress.pages[0].candidate.id, first.id);
});

test('episode plans reject missing or misplaced common references without changing artwork', async () => {
  const { saveEpisodePlan } = await import('../examples/comic-studio/plugin/web/episode.mjs');
  const { savePage } = await import('../examples/comic-studio/plugin/web/studio.mjs');
  const state = host(), episode = await createEpisode(state.client), page = await createPage(state.client, episode.id);
  const selected = await readPage(state.client, page.id);
  selected.data.references = [{ libraryId: 'hero' }]; await savePage(state.client, page.id, selected);
  const item = { pageId: page.id, prompt: 'Arrival', expectedRevision: selected.revision };
  await assert.rejects(saveEpisodePlan(state.client, { episodeId: episode.id, pages: [item] }), error => error.code === 'INVALID_ARGUMENT');
  assert.deepEqual(await readPage(state.client, page.id), selected);
  assert.equal(state.documents.has(`comic/episodes/${episode.id}/episode.json`), false);
  const first = await saveEpisodePlan(state.client, { episodeId: episode.id, references: [], pages: [item] });
  const saved = await readPage(state.client, page.id);
  await assert.rejects(saveEpisodePlan(state.client, { episodeId: episode.id, pages: [{ ...item, expectedRevision: saved.revision, references: selected.data.references }] }), error => error.code === 'INVALID_ARGUMENT');
  assert.deepEqual(await readPage(state.client, page.id), saved);
  const { inspectEpisode } = await import('../examples/comic-studio/plugin/web/episode.mjs');
  assert.equal((await inspectEpisode(state.client, episode.id)).revision, first.revision);
});

test('recovering a saved request does not resolve changed references or repeat paid generation', async () => {
  const state = host(), episode = await createEpisode(state.client), page = await createPage(state.client, episode.id);
  const result = await renderPage(state.client, { pageId: page.id, commandId: 'recover-once', prompt: 'Arrival', references: [{ libraryId: 'hero' }] });
  const saved = await readPage(state.client, page.id); saved.data.results = []; saved.data.jobs[0].status = 'running';
  const { savePage } = await import('../examples/comic-studio/plugin/web/studio.mjs'); await savePage(state.client, page.id, saved);
  const original = state.client.request;
  state.client.request = (path, options) => path === '/library/items/hero' ? Promise.reject(new Error('Do not resolve mutable references on recovery')) : original(path, options);
  const recovered = await renderPage(state.client, { pageId: page.id, commandId: result.id, action: 'recover' });
  assert.deepEqual(recovered, result); assert.equal(state.calls(), 1);
});

test('batch adoption isolates stale selections, preserves history and is repeatable', async () => {
  const { adoptPages } = await import('../examples/comic-studio/plugin/web/episode.mjs');
  const state = host(), episode = await createEpisode(state.client), a = await createPage(state.client, episode.id), b = await createPage(state.client, episode.id);
  const first = await renderPage(state.client, { pageId: a.id, commandId: 'candidate-a', prompt: 'A' });
  const second = await renderPage(state.client, { pageId: b.id, commandId: 'candidate-b', prompt: 'B' });
  const replacement = await renderPage(state.client, { pageId: b.id, commandId: 'manual-b', prompt: 'Manual' });
  await adoptResult(state.client, b.id, await readPage(state.client, b.id), replacement.id);
  const items = [{ pageId: a.id, resultId: first.id, expectedCurrentId: null }, { pageId: b.id, resultId: second.id, expectedCurrentId: null }];
  const result = await adoptPages(state.client, items);
  assert.deepEqual(result.items.map(item => item.status), ['adopted', 'failed']);
  assert.equal(result.items[1].error.code, 'DOCUMENT_CONFLICT');
  assert.deepEqual((await readPage(state.client, b.id)).data.results.map(item => item.id), [second.id, replacement.id]);
  assert.equal((await readPage(state.client, b.id)).data.currentId, replacement.id);
  assert.equal((await adoptPages(state.client, items)).items[0].status, 'already_adopted');
});

test('plan conflicts are isolated, unchanged scripts keep commands, and details are bounded', async () => {
  const { saveEpisodePlan, inspectEpisode } = await import('../examples/comic-studio/plugin/web/episode.mjs');
  const { createPages } = await import('../examples/comic-studio/plugin/web/studio.mjs');
  const state = host(), episode = await createEpisode(state.client), pages = await createPages(state.client, episode.id, 12);
  const items = await Promise.all(pages.map(async page => ({ pageId: page.id, prompt: 'Rainy station', expectedRevision: (await readPage(state.client, page.id)).revision })));
  items[1].expectedRevision = 'stale';
  const first = await saveEpisodePlan(state.client, { episodeId: episode.id, references: [{ content: 'Fixed style' }], pages: items });
  assert.equal(first.items[1].error.code, 'DOCUMENT_CONFLICT');
  assert.equal(first.items.filter(item => item.status === 'saved').length, 11);
  const detail = await inspectEpisode(state.client, episode.id);
  assert.equal(detail.pages.length, 10); assert.equal(detail.nextOffset, 10); assert.equal(detail.progress.total, 12);
  const tail = await inspectEpisode(state.client, episode.id, { offset: 10 });
  assert.equal(tail.pages.length, 2); assert.equal(tail.nextOffset, undefined);
  const saved = await readPage(state.client, pages[0].id);
  const same = await saveEpisodePlan(state.client, { episodeId: episode.id, expectedRevision: first.revision, pages: [{ ...items[0], expectedRevision: saved.revision }] });
  assert.equal(same.items[0].commandId, first.items[0].commandId);
  await assert.rejects(saveEpisodePlan(state.client, { episodeId: episode.id, expectedRevision: first.revision, pages: items }), error => error.code === 'DOCUMENT_CONFLICT');
  const clear = await saveEpisodePlan(state.client, { episodeId: episode.id, references: [], pages: [{ ...items[0], expectedRevision: (await readPage(state.client, pages[0].id)).revision }] });
  assert.deepEqual(clear.references, []); assert.notEqual(clear.items[0].commandId, same.items[0].commandId);
  const oversize = await saveEpisodePlan(state.client, { episodeId: episode.id, pages: [{ ...items[0], prompt: '雨'.repeat(6000), expectedRevision: (await readPage(state.client, pages[0].id)).revision }] });
  assert.equal(oversize.items[0].error.code, 'LIMIT_EXCEEDED');
  assert.equal((await readPage(state.client, pages[0].id)).data.script.commandId, clear.items[0].commandId);
});

test('authorized retry replaces the failed script attempt while preserving its model and references', async () => {
  const { saveEpisodePlan, inspectEpisode } = await import('../examples/comic-studio/plugin/web/episode.mjs');
  const { readComic, saveDocument, savePage } = await import('../examples/comic-studio/plugin/web/studio.mjs');
  const state = host(), episode = await createEpisode(state.client), page = await createPage(state.client, episode.id);
  await saveEpisodePlan(state.client, { episodeId: episode.id, references: [{ content: 'Fixed identity' }], pages: [{ pageId: page.id, prompt: 'Rainy station', expectedRevision: (await readPage(state.client, page.id)).revision }] });
  await assert.rejects(renderPage(state.client, { pageId: page.id, action: 'retry', commandId: 'new-attempt' }), error => error.code === 'INVALID_ARGUMENT');
  let saved = await readPage(state.client, page.id);
  const originalId = saved.data.script.commandId;
  saved.data.jobs.push({ commandId: originalId, status: 'failed', baseCurrentId: null }); await savePage(state.client, page.id, saved);
  const comic = await readComic(state.client); comic.data.imageModelId = 'image-b'; await saveDocument(state.client, 'comic/comic.json', comic);
  const candidate = await renderPage(state.client, { pageId: page.id, action: 'retry', commandId: 'new-attempt' });
  assert.equal(candidate.modelId, 'image-a'); assert.deepEqual(candidate.references, [{ content: 'Fixed identity' }]);
  const detail = await inspectEpisode(state.client, episode.id);
  assert.equal(detail.progress.generated, 1); assert.equal(detail.progress.failed, 0); assert.equal(detail.pages[0].candidate.id, 'new-attempt');
  await renderPage(state.client, { pageId: page.id, action: 'retry', commandId: 'new-attempt' }); assert.equal(state.calls(), 1);
  saved = await readPage(state.client, page.id); assert.equal(saved.data.jobs[0].commandId, originalId); assert.equal(saved.data.jobs.length, 2);
});

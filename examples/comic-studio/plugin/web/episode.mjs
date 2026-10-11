import { StudioError, readComic, readDocument, saveDocument, readPage, savePage, snapshotReferences, adoptResult } from './studio.mjs';

const settingsPath = episodeId => `comic/episodes/${episodeId}/episode.json`;

// These are artwork settings and scripts, not a task queue or Agent state.
export async function saveEpisodePlan(client, input) {
  if (input.pages.some(item => item.references !== undefined)) throw new StudioError('INVALID_ARGUMENT', 'Supply common references at the top level, not inside pages');
  const comic = await readComic(client);
  const episode = comic.data.episodes.find(item => item.id === input.episodeId);
  if (!episode) throw new StudioError('NOT_FOUND', 'Episode not found');
  let settings;
  try { settings = await readDocument(client, settingsPath(episode.id)); }
  catch (error) {
    if (error.code !== 'NOT_FOUND') throw error;
    settings = { revision: 'missing', data: { version: 1, id: episode.id, references: [] } };
  }
  if (input.expectedRevision !== undefined && input.expectedRevision !== settings.revision) throw new StudioError('DOCUMENT_CONFLICT', 'Episode settings changed');
  if (settings.revision === 'missing' && input.references === undefined) throw new StudioError('INVALID_ARGUMENT', 'The first plan requires top-level references; use [] only when no references are intended');
  const modelId = comic.data.imageModelId;
  if (!modelId) throw new StudioError('NOT_CONFIGURED', 'Select an image model in the comic toolbar');
  const references = input.references === undefined ? settings.data.references : await snapshotReferences(client, input.references);
  settings.data = { version: 1, id: episode.id, modelId, references };
  await saveDocument(client, settingsPath(episode.id), settings);
  const items = [];
  for (const item of input.pages) {
    try {
      if (!episode.pages.some(page => page.id === item.pageId)) throw new StudioError('NOT_FOUND', 'Page does not belong to episode');
      if (typeof item.prompt !== 'string' || !item.prompt.trim()) throw new StudioError('INVALID_ARGUMENT', 'Page script must not be empty');
      if (new TextEncoder().encode(item.prompt).length > 16384) throw new StudioError('LIMIT_EXCEEDED', 'Page script exceeds 16 KiB');
      const page = await readPage(client, item.pageId);
      if (page.revision !== item.expectedRevision) throw new StudioError('DOCUMENT_CONFLICT', 'Page changed');
      // A new script is a deliberate new generation. Unchanged scripts retain
      // their command so a repeated save cannot turn a completed page into work.
      const script = { prompt: item.prompt, modelId, references };
      const previous = page.data.script;
      script.commandId = previous && JSON.stringify({ prompt: previous.prompt, modelId: previous.modelId, references: previous.references }) === JSON.stringify(script) ? previous.commandId : crypto.randomUUID();
      page.data.script = script;
      page.data.references = references;
      await savePage(client, item.pageId, page);
      items.push({ pageId: item.pageId, status: 'saved', revision: page.revision, commandId: script.commandId });
    } catch (error) {
      items.push({ pageId: item.pageId, status: 'failed', error: { code: error.code || 'RUNTIME_FAILED', messageKey: error.messageKey || 'errors.RUNTIME_FAILED' } });
    }
  }
  return { episodeId: episode.id, revision: settings.revision, modelId, references, items };
}

const imageSummary = image => image ? { id: image.id, modelId: image.modelId, asset: image.asset, mimeType: image.mimeType } : null;

export async function inspectEpisode(client, episodeId, { detail = 'full', offset = 0, limit = 10 } = {}) {
  const comic = await readComic(client);
  const episode = comic.data.episodes.find(item => item.id === episodeId);
  if (!episode) throw new StudioError('NOT_FOUND', 'Episode not found');
  let settings;
  if (detail === 'full') {
    try { settings = await readDocument(client, settingsPath(episode.id)); }
    catch (error) { if (error.code !== 'NOT_FOUND') throw error; }
  }
  const progress = { total: episode.pages.length, generated: 0, adopted: 0, pending: 0, running: 0, failed: 0, interrupted: 0 };
  const pages = [];
  for (const entry of episode.pages) {
    const page = await readPage(client, entry.id), data = page.data;
    const commandId = data.script?.commandId ?? data.jobs.at(-1)?.commandId;
    const job = data.jobs.find(item => item.commandId === commandId);
    const candidate = data.results.find(item => item.id === commandId);
    const generated = !!candidate;
    if (generated) progress.generated++;
    if (candidate && data.currentId === candidate.id) progress.adopted++;
    let status = job?.status ?? 'pending';
    if (generated) status = 'completed';
    switch (status) {
      case 'pending': progress.pending++; break;
      case 'running': progress.running++; break;
      case 'failed': progress.failed++; break;
      case 'cancelled': case 'interrupted': progress.interrupted++; break;
      case 'completed': break;
      default: throw new StudioError('UNSUPPORTED', 'Unknown image request state');
    }
    const current = data.results.find(item => item.id === data.currentId);
    pages.push({ id: entry.id, revision: page.revision, currentId: data.currentId, status, commandId, needsRecovery: !!job && !generated, candidate: imageSummary(candidate), expectedCurrentId: job?.baseCurrentId ?? null, image: imageSummary(current ?? candidate ?? data.results.at(-1)),
      ...(detail === 'full' ? { script: data.script ?? null } : {}) });
  }
  if (detail === 'summary') return { id: episode.id, progress, pages };
  return { id: episode.id, revision: settings?.revision ?? 'missing', modelId: settings?.data.modelId ?? comic.data.imageModelId, references: settings?.data.references ?? [], progress, pages: pages.slice(offset, offset + limit),
    ...(offset + limit < pages.length ? { nextOffset: offset + limit } : {}) };
}

export async function adoptPages(client, items) {
  const result = [];
  for (const item of items) {
    try {
      const page = await readPage(client, item.pageId);
      if (page.data.currentId === item.resultId) { result.push({ ...item, status: 'already_adopted' }); continue; }
      if (page.data.currentId !== item.expectedCurrentId) throw new StudioError('DOCUMENT_CONFLICT', 'Current image changed');
      await adoptResult(client, item.pageId, page, item.resultId);
      result.push({ ...item, status: 'adopted' });
    } catch (error) {
      result.push({ ...item, status: 'failed', error: { code: error.code || 'RUNTIME_FAILED', messageKey: error.messageKey || 'errors.RUNTIME_FAILED' } });
    }
  }
  return { items: result };
}

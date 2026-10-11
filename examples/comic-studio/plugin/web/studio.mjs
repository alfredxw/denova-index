// Comic content belongs to the Project. Agent journals stay with the host.
export class StudioError extends Error {
  constructor(code, message) { super(message); this.code = code; this.messageKey = `errors.${code}`; }
}
const id = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(value)) throw new StudioError('INVALID_ARGUMENT', 'Invalid content ID');
  return value;
};
const pagePath = pageId => `comic/pages/${id(pageId)}/page.json`;
export async function readDocument(client, path) {
  const value = await client.request(`/project-content/file?path=${encodeURIComponent(path)}`);
  const data = JSON.parse(value.content);
  if (data.version !== 1) throw new StudioError('UNSUPPORTED', 'Unknown comic content version');
  return { data, revision: value.revision };
}
export async function saveDocument(client, path, snapshot) {
  const saved = await client.request('/project-content/file', { method: 'PUT', body: JSON.stringify({ path, content: JSON.stringify(snapshot.data, null, 2), expectedRevision: snapshot.revision }) });
  snapshot.revision = saved.revision;
  return snapshot;
}
export async function readComic(client) {
  try { return await readDocument(client, 'comic/comic.json'); }
  catch (error) {
    if (error.code !== 'NOT_FOUND') throw error;
    return { data: { version: 1, episodes: [] }, revision: 'missing' };
  }
}
export const readPage = (client, pageId) => readDocument(client, pagePath(pageId));
export const savePage = (client, pageId, snapshot) => saveDocument(client, pagePath(pageId), snapshot);
export async function createEpisode(client, title = '') {
  const comic = await readComic(client);
  const episode = { id: crypto.randomUUID(), title, pages: [] };
  comic.data.episodes.push(episode);
  await saveDocument(client, 'comic/comic.json', comic);
  return episode;
}
export async function createPage(client, episodeId) {
  return (await createPages(client, episodeId, 1))[0];
}
export async function createPages(client, episodeId, count) {
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new StudioError('INVALID_ARGUMENT', 'Create 1 to 100 pages');
  const comic = await readComic(client);
  const episode = comic.data.episodes.find(item => item.id === episodeId);
  if (!episode) throw new StudioError('NOT_FOUND', 'Episode not found');
  const pages = [];
  for (let index = 0; index < count; index++) {
    const page = { id: crypto.randomUUID() };
    await savePage(client, page.id, { revision: 'missing', data: { version: 1, id: page.id, currentId: null, references: [], results: [], jobs: [] } });
    pages.push(page);
  }
  episode.pages.push(...pages);
  await saveDocument(client, 'comic/comic.json', comic);
  return pages;
}

// Outline changes commit atomically against the displayed revision. Deleted
// entries stay in this document; page files, running jobs and artwork stay put.
export async function updateOutline(client, snapshot, change) {
  const next = structuredClone(snapshot);
  const { episodes } = next.data;
  const episode = change.episodeId ? episodes.find(item => item.id === change.episodeId) : null;
  if (change.episodeId && !episode) throw new StudioError('NOT_FOUND', 'Episode not found');
  switch (change.type) {
    case 'rename':
      if (!episode || typeof change.title !== 'string') throw new StudioError('INVALID_ARGUMENT', 'Episode title required');
      episode.title = change.title.trim();
      break;
    case 'move': {
      const items = episode ? episode.pages : episodes;
      const from = items.findIndex(item => item.id === change.id);
      const to = items.findIndex(item => item.id === change.overId);
      if (from < 0 || to < 0) throw new StudioError('NOT_FOUND', 'Outline item not found');
      items.splice(to, 0, items.splice(from, 1)[0]);
      break;
    }
    case 'delete': {
      const items = episode ? episode.pages : episodes;
      const index = items.findIndex(item => item.id === change.id);
      if (index < 0) throw new StudioError('NOT_FOUND', 'Outline item not found');
      const [item] = items.splice(index, 1);
      next.data.trash ??= [];
      next.data.trash.push({ id: item.id, kind: episode ? 'page' : 'episode', episodeId: episode?.id ?? null, index, item, deletedAt: new Date().toISOString() });
      break;
    }
    case 'restore': {
      const trash = next.data.trash ?? [];
      const index = trash.findIndex(item => item.id === change.id);
      if (index < 0) throw new StudioError('NOT_FOUND', 'Deleted item not found');
      const entry = trash[index];
      const parent = entry.kind === 'page' ? episodes.find(item => item.id === entry.episodeId) : null;
      if (entry.kind === 'page' && !parent) throw new StudioError('NOT_FOUND', 'Restore the parent episode first');
      const items = parent ? parent.pages : episodes;
      items.splice(Math.min(entry.index, items.length), 0, entry.item);
      trash.splice(index, 1);
      break;
    }
    default: throw new StudioError('INVALID_ARGUMENT', 'Unknown outline operation');
  }
  return saveDocument(client, 'comic/comic.json', next);
}

export async function libraryItems(client, query = '') {
  const items = []; let offset = 0;
  do {
    const page = await client.request(`/library/items?limit=100&offset=${offset}&query=${encodeURIComponent(query)}`);
    items.push(...page.items); offset = page.nextOffset;
  } while (offset !== undefined && offset !== null);
  return items;
}

async function resolveReferences(client, references, startIndex = 1) {
  if (references.length > 12) throw new StudioError('LIMIT_EXCEEDED', 'Use at most 12 references');
  const assets = [], descriptions = [];
  for (const reference of references) {
    let asset = reference.asset;
    let description = reference.content ?? reference.label ?? '';
    if (reference.libraryId && reference.content === undefined) {
      const item = await client.request(`/library/items/${encodeURIComponent(reference.libraryId)}`);
      asset = item.image;
      description = `${item.name}: ${item.content || item.briefDescription || ''}`;
    }
    if (reference.note) description += `\nReference purpose: ${reference.note}`;
    if (asset) { assets.push(asset); description = `Reference image ${assets.length + startIndex - 1}: ${description}`; }
    descriptions.push(description);
  }
  if (new TextEncoder().encode(descriptions.join('\n')).length > 32768) throw new StudioError('LIMIT_EXCEEDED', 'Reference descriptions exceed 32 KiB');
  return { assets, description: descriptions.join('\n\n') };
}

// Freeze the actual library text and mutable library images as ordinary artwork.
// IDs retain provenance; content prevents later library edits changing a script.
export async function snapshotReferences(client, references) {
  if (references.length > 12) throw new StudioError('LIMIT_EXCEEDED', 'Use at most 12 references');
  const snapshots = [];
  for (const reference of references) {
    const frozen = { ...reference };
    if (reference.libraryId && reference.content === undefined) {
      const item = await client.request(`/library/items/${encodeURIComponent(reference.libraryId)}`);
      frozen.content = `${item.name}: ${item.content || item.briefDescription || ''}`;
      frozen.label = item.name;
      if (item.image) frozen.asset = item.image;
    }
    if (frozen.asset && !(frozen.asset.kind === 'project' && frozen.asset.path.startsWith('comic/assets/'))) {
      const bytes = await client.request(`/assets/content?kind=${encodeURIComponent(frozen.asset.kind)}&path=${encodeURIComponent(frozen.asset.path)}`, { responseType: 'stream' });
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[bytes.headers.get('Content-Type')?.split(';')[0]];
      await bytes.body?.cancel();
      if (!ext) throw new StudioError('UNSUPPORTED', 'Reference must be a raster image');
      const saved = await client.request('/project-content/adopt', { method: 'POST', body: JSON.stringify({ path: `comic/assets/references/${crypto.randomUUID()}.${ext}`, asset: frozen.asset }) });
      frozen.asset = saved.asset;
    }
    snapshots.push(frozen);
  }
  await resolveReferences(client, snapshots);
  return snapshots;
}

// Durable jobs record the exact source and command before contacting a provider.
// Recovery only queries receipts; it never automatically starts another image.
export async function renderPage(client, input, { signal, onJob } = {}) {
  id(input.pageId);
  const snapshot = await readPage(client, input.pageId);
  const commandId = id(input.commandId ?? snapshot.data.script?.commandId);
  const existing = snapshot.data.jobs.find(job => job.commandId === commandId);
  if (existing) {
    for (const key of ['prompt', 'sourceId', 'selection', 'references']) {
      if (input[key] !== undefined && JSON.stringify(input[key]) !== JSON.stringify(existing[key])) throw new StudioError('IDEMPOTENCY_CONFLICT', 'Command already has different input');
    }
    const result = snapshot.data.results.find(result => result.id === commandId);
    return result ?? recoverJob(client, input.pageId, existing, { signal });
  }
  if (input.action === 'recover') throw new StudioError('NOT_FOUND', 'Image request not found');
  if (input.action === 'retry') {
    const script = snapshot.data.script;
    const previous = snapshot.data.jobs.find(job => job.commandId === script?.commandId);
    if (!script || !input.commandId || input.commandId === script.commandId || !['failed', 'cancelled', 'interrupted'].includes(previous?.status)) throw new StudioError('INVALID_ARGUMENT', 'Retry requires a failed saved script and a new command ID');
    if (['prompt', 'sourceId', 'selection', 'references'].some(key => input[key] !== undefined)) throw new StudioError('INVALID_ARGUMENT', 'Retry uses the saved script and references');
    // This new attempt belongs to the same saved artwork, so progress and
    // continuation follow it instead of the previous terminal request.
    script.commandId = commandId;
  }
  const prompt = input.prompt ?? snapshot.data.script?.prompt;
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 32000) throw new StudioError('INVALID_ARGUMENT', 'A page script or explicit prompt is required');
  const sourceId = input.sourceId || null;
  const source = snapshot.data.results.find(result => result.id === sourceId);
  if (sourceId && !source) throw new StudioError('NOT_FOUND', 'Source result not found');
  if (input.selection && !source) throw new StudioError('INVALID_ARGUMENT', 'A selection requires a source');
  const script = commandId === snapshot.data.script?.commandId ? snapshot.data.script : null;
  const references = input.references ?? script?.references ?? snapshot.data.references;
  const resolved = await resolveReferences(client, references, source ? 2 : 1);
  const modelId = script?.modelId ?? (await readComic(client)).data.imageModelId;
  if (!modelId) throw new StudioError('NOT_CONFIGURED', 'Select an image model in the comic toolbar');
  const request = { commandId, modelId, prompt: `${source ? "Edit the first image as requested, preserving all other page content, character identity and lettering. " : "Generate a new page from the provided references. "}Create one complete comic page. Preserve the requested language and exact dialogue text. Use readable lettering and a cohesive page layout.\n${prompt}\n\n${resolved.description}`, ...(source ? { source: source.asset } : {}), references: resolved.assets, ...(input.selection ? { selection: input.selection } : {}) };
  if (new TextEncoder().encode(request.prompt).length > 65536) throw new StudioError('LIMIT_EXCEEDED', 'Image prompt exceeds 64 KiB');
  const job = { commandId, sourceId, prompt, references, selection: input.selection ?? null, baseCurrentId: snapshot.data.currentId, request, status: 'running', createdAt: new Date().toISOString() };
  snapshot.data.jobs.push(job);
  await savePage(client, input.pageId, snapshot);
  onJob?.(job);
  const receipt = await client.request('/images/generations', { method: 'POST', body: JSON.stringify(job.request), signal });
  return settleJob(client, input.pageId, job, receipt, { signal });
}

export async function recoverJob(client, pageId, job, { signal } = {}) {
  let receipt;
  try { receipt = await client.request(`/images/generations/${encodeURIComponent(job.commandId)}`, { signal }); }
  catch (error) {
    if (error.code !== 'NOT_FOUND') throw error;
    const snapshot = await readPage(client, pageId);
    const saved = snapshot.data.jobs.find(value => value.commandId === job.commandId);
    if (saved) { saved.status = 'interrupted'; await savePage(client, pageId, snapshot); }
    throw new StudioError('INTERRUPTED', 'Image request was not admitted; create a new command to retry');
  }
  return settleJob(client, pageId, job, receipt, { signal });
}

async function settleJob(client, pageId, job, receipt, { signal } = {}) {
  while (receipt.status === 'running') {
    await new Promise((resolve, reject) => {
      const stop = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, 700);
      if (signal?.aborted) stop(); else signal?.addEventListener('abort', stop, { once: true });
    });
    receipt = await client.request(`/images/generations/${encodeURIComponent(job.commandId)}`, { signal });
  }
  let result;
  if (receipt.status === 'completed' && receipt.images.length) {
    const image = receipt.images[0];
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[image.mimeType];
    const saved = await client.request('/project-content/adopt', { method: 'POST', body: JSON.stringify({ path: `comic/assets/pages/${id(pageId)}/${id(job.commandId)}.${ext}`, asset: image.asset }), signal });
    result = { id: job.commandId, modelId: receipt.modelId ?? job.request.modelId, asset: saved.asset, mimeType: saved.mimeType, sourceId: job.sourceId, prompt: job.prompt, references: job.references, selection: job.selection, createdAt: job.createdAt };
  }
  const latest = await readPage(client, pageId);
  const currentJob = latest.data.jobs.find(value => value.commandId === job.commandId);
  if (currentJob) currentJob.status = receipt.status;
  if (result && !latest.data.results.some(value => value.id === result.id)) latest.data.results.push(result);
  await savePage(client, pageId, latest);
  if (!result) throw new StudioError(receipt.status === 'failed' ? receipt.error?.code || 'RUNTIME_FAILED' : 'INTERRUPTED', 'Image request did not complete');
  return result;
}

export async function adoptResult(client, pageId, snapshot, resultId) {
  if (!snapshot.data.results.some(result => result.id === resultId)) throw new StudioError('NOT_FOUND', 'Result not found');
  snapshot.data.currentId = resultId;
  return savePage(client, pageId, snapshot);
}

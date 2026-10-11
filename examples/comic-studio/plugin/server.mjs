import { serve, readJSON, requestHost } from './runtime.mjs';
import { readComic, readPage, libraryItems, createEpisode, createPage, createPages, renderPage } from './web/studio.mjs';
import { saveEpisodePlan, inspectEpisode, adoptPages } from './web/episode.mjs';

await serve(async (request, response, bootstrap) => {
  const abort = new AbortController();
  response.on('close', () => abort.abort(new Error('Tool caller disconnected')));
  const client = { async request(path, options = {}) {
    const { responseType, ...fetchOptions } = options;
    const result = await requestHost(bootstrap, request, path, { ...fetchOptions, signal: abort.signal });
    if (!result.ok) { const error = await result.json(); throw Object.assign(new Error(error.diagnostic), error); }
    return responseType === 'stream' ? result : result.status === 204 ? undefined : result.json();
  } };
  if (request.method !== 'POST') { response.writeHead(404).end(); return; }
  const body = await readJSON(request);
  const input = body.input ?? body;
  try {
    let result;
    switch (request.url) {
      case '/tools/inspect':
        if (input.libraryQuery !== undefined) result = await libraryItems(client, input.libraryQuery);
        else if (input.episodeId) result = await inspectEpisode(client, input.episodeId, input);
        else if (input.pageId) { const page = await readPage(client, input.pageId); result = { ...page.data, revision: page.revision }; }
        else result = (await readComic(client)).data;
        break;
      case '/tools/structure':
        switch (input.kind) {
          case 'episode': result = await createEpisode(client, input.title); break;
          case 'page': result = input.count === undefined ? await createPage(client, input.episodeId) : { pages: await createPages(client, input.episodeId, input.count) }; break;
          case 'plan': result = await saveEpisodePlan(client, input); break;
          default: throw Object.assign(new Error('Unknown structure operation'), { code: 'INVALID_ARGUMENT' });
        }
        break;
      case '/tools/render': result = await renderPage(client, input, { signal: abort.signal }); break;
      case '/tools/adopt': result = await adoptPages(client, input.items); break;
      default: response.writeHead(404).end(); return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ content: 'Operation completed. Generated images remain candidates until the user adopts them.', data: result }));
  } catch (error) {
    console.error('Comic operation failed:', error.code || 'RUNTIME_FAILED', error.message);
    response.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ code: error.code || 'RUNTIME_FAILED', messageKey: error.messageKey || 'errors.RUNTIME_FAILED', diagnostic: error.message }));
  }
});

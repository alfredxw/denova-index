import { readJSON, serve } from './runtime.mjs';
import { statistics } from './statistics.mjs';

await serve(async (request, response) => {
  if (request.method === 'POST' && request.url === '/tools/statistics') {
    let data;
    try { data = statistics((await readJSON(request)).text); }
    catch {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: 'INVALID_ARGUMENT', messageKey: 'errors.invalidText', diagnostic: 'Expected bounded text input' }));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ content: JSON.stringify(data), data }));
    return;
  }
  response.writeHead(404, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ code: 'NOT_FOUND', messageKey: 'errors.notFound', diagnostic: 'Unknown plugin endpoint' }));
});

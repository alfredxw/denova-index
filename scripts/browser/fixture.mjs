import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = fileURLToPath(new URL('../../examples/extension-starter/small-circle/', import.meta.url));
export async function createFixture(port = 0) {
  const state = { save: null, revision: null, writes: 0, calls: 0, sessions: {}, runs: new Map(), delay: 60 };
  const timers = new Set();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost'), path = url.pathname;
    const json = (data, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    try {
      if (path === '/') {
        const html = await readFile(new URL('./host.html', import.meta.url)); res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); return;
      }
      if (path.startsWith('/game/')) {
        const file = resolve(gameRoot, '.' + decodeURIComponent(path.slice(5)));
        if (!file.startsWith(gameRoot)) { res.writeHead(403).end(); return; }
        const content = await readFile(file);
        const type = { '.html': 'text/html', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[extname(file)];
        res.writeHead(200, { 'Content-Type': type || 'application/octet-stream' }); res.end(content); return;
      }
      let body = null;
      if (req.method === 'POST' || req.method === 'PUT') {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString(); body = raw ? JSON.parse(raw) : null;
      }
      if (path === '/api/game-data/files') return json({ items: state.save ? [{ path: 'social.json' }] : [] });
      if (path === '/api/game-data/file' && req.method === 'GET') return json({ content: JSON.stringify(state.save), revision: state.revision });
      if (path === '/api/game-data/file' && req.method === 'PUT') {
        if (body.expectedRevision !== state.revision) return json({ code: 'DOCUMENT_CONFLICT', diagnostic: 'Revision conflict' }, 409);
        state.save = JSON.parse(body.content); state.revision = String(++state.writes); return json({ revision: state.revision });
      }
      if (path === '/api/agents/sessions') {
        const id = body.definition.split(':')[1]; state.sessions[id] ||= []; return json({ ref: { sessionId: id } });
      }
      const history = path.match(/^\/api\/agents\/sessions\/([^/]+)\/history$/);
      if (history) {
        const items = state.sessions[history[1]], end = url.searchParams.has('cursor') ? Number(url.searchParams.get('cursor')) : items.length;
        const start = Math.max(0, end - 50); return json({ items: items.slice(start, end), cursor: start ? String(start) : '' });
      }
      const start = path.match(/^\/api\/agents\/sessions\/([^/]+)\/runs$/);
      if (start && req.method === 'POST') {
        const key = body.commandId;
        if (!state.runs.has(key)) {
          state.calls++;
          const input = JSON.parse(body.input.text);
          const text = input.locale === 'zh-CN' ? '好呀，我们先选六张，再一起看看窗边的布置。你更喜欢哪一张？' : 'Sounds good. Let’s choose six photos and plan the window wall together. Which photo do you like most?';
          const run = { run: { runId: key }, status: 'running', text: '', completion: { recordId: 'answer-' + key } };
          state.sessions[start[1]].push({ recordId: 'user-' + key, role: 'user', text: body.input.text, createdAt: new Date().toISOString() });
          const execution = { result: run, listeners: new Set(), text, input: body.input.text, id: start[1] };
          state.runs.set(key, execution);
          let position = 0;
          const tick = () => {
            if (run.status !== 'running') return;
            const delta = text.slice(position, position + 6); position += 6; run.text += delta;
            for (const listener of execution.listeners) listener('delta', { delta });
            if (position >= text.length) {
              run.status = 'completed'; state.sessions[start[1]].push({ recordId: run.completion.recordId, role: 'assistant', text, createdAt: new Date().toISOString() });
              for (const listener of execution.listeners) listener('result', run);
            } else { const timer = setTimeout(() => { timers.delete(timer); tick(); }, state.delay); timers.add(timer); }
          };
          const timer = setTimeout(() => { timers.delete(timer); tick(); }, state.delay); timers.add(timer);
        }
        const execution = state.runs.get(key);
        if (execution.input !== body.input.text) return json({ code: 'IDEMPOTENCY_CONFLICT', diagnostic: 'Input changed' }, 409);
        return json(execution.result, 202);
      }
      const runPath = path.match(/^\/api\/agents\/runs\/([^/]+)(?:\/(events|cancel))?$/);
      if (runPath) {
        const execution = state.runs.get(runPath[1]);
        if (!execution) return json({ code: 'NOT_FOUND', diagnostic: 'Unknown run' }, 404);
        if (runPath[2] === 'cancel') {
          execution.result.status = 'aborted';
          for (const listener of execution.listeners) listener('result', execution.result);
          return json(execution.result);
        }
        if (runPath[2] === 'events') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
          const send = (event, data) => { res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'); if (event === 'result') res.end(); };
          send('snapshot', { snapshot: execution.result });
          if (execution.result.status !== 'running') { res.end(); return; }
          execution.listeners.add(send); res.on('close', () => execution.listeners.delete(send)); return;
        }
        return json(execution.result);
      }
      res.writeHead(404).end();
    } catch (error) {
      console.error('Browser fixture failed', error); if (!res.headersSent) json({ diagnostic: error.message }, 500); else res.end();
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { state, url: 'http://127.0.0.1:' + server.address().port, close: async () => { for (const timer of timers) clearTimeout(timer); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}

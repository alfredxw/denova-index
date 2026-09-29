import test from 'node:test';
import assert from 'node:assert/strict';
import { GameController } from '../examples/extension-starter/small-circle/controller.mjs';
import { initialState, validateState, inputEnvelope, playerText } from '../examples/extension-starter/small-circle/state.mjs';
import { consumeEvents } from '../examples/extension-starter/small-circle/stream.mjs';

const posts = [{ id: 'poster', author: 'lin', text: 'A title for our exhibition?' }];
function fixture() {
  const store = { state: null, revision: null, writes: 0, calls: 0, commands: new Map(), histories: {}, failSave: false, loseReply: false, terminal: 'completed' };
  const client = { context: { locale: 'zh-CN', scope: { projectId: 'book' } }, async request(path, options = {}) {
    const body = options.body ? JSON.parse(options.body) : null;
    if (path === '/game-data/files') return { items: store.state ? [{ path: 'social.json' }] : [] };
    if (path.startsWith('/game-data/file?')) return { content: JSON.stringify(store.state), revision: store.revision };
    if (path === '/game-data/file') {
      if (store.failSave || body.expectedRevision !== store.revision) throw new Error('DOCUMENT_CONFLICT');
      store.state = JSON.parse(body.content); store.revision = String(++store.writes); return { revision: store.revision };
    }
    if (path === '/agents/sessions') return { ref: { sessionId: body.definition.split(':')[1] } };
    const history = path.match(/^\/agents\/sessions\/([^/]+)\/history/);
    if (history) return { items: store.histories[history[1]] || [], cursor: '' };
    const run = path.match(/^\/agents\/sessions\/([^/]+)\/runs$/);
    if (run) {
      assert.equal(store.state.pending.commandId, body.commandId, 'Intent must be persisted before submitting');
      if (!store.commands.has(body.commandId)) {
        store.calls++;
        const result = { status: store.terminal, text: '可以，我们一起选六张。', run: { runId: body.commandId }, completion: { recordId: 'answer-' + body.commandId } };
        store.commands.set(body.commandId, { result, input: body.input.text });
        store.histories[run[1]] = [...(store.histories[run[1]] || []), { recordId: 'user-' + body.commandId, role: 'user', text: body.input.text }, { recordId: result.completion.recordId, role: 'assistant', text: result.text }];
      }
      assert.equal(store.commands.get(body.commandId).input, body.input.text);
      if (store.loseReply) { store.loseReply = false; throw new Error('Disconnected after acceptance'); }
      return store.commands.get(body.commandId).result;
    }
    const saved = path.match(/^\/agents\/runs\/([^/]+)$/);
    if (saved) return store.commands.get(saved[1]).result;
    throw new Error('Unexpected endpoint ' + path);
  } };
  return { store, client, game: new GameController(client) };
}

test('chat persists intent first and keeps the host as the only transcript store', async () => {
  const { game, store } = fixture(); await game.initialize();
  await game.send({ contactId: 'lin', text: '展览叫街角如何？', posts });
  assert.equal(store.calls, 1); assert.equal(store.state.pending, null);
  assert.equal(playerText(game.histories.lin.items[0].text), '展览叫街角如何？');
  assert(!JSON.stringify(store.state).includes('我们一起选六张'));
});
test('lost acceptance response is recovered with the original command without another model call', async () => {
  const { game, store, client } = fixture(); await game.initialize(); store.loseReply = true;
  await assert.rejects(game.send({ contactId: 'lin', text: '你好', posts }));
  assert.equal(game.blocked, true); assert(store.state.pending);
  const resumed = new GameController(client); await resumed.initialize();
  assert.equal(store.calls, 1); assert.equal(resumed.state.pending, null); assert.equal(resumed.blocked, false);
});
test('unconfirmed or conflicting save never submits a new model request', async () => {
  const { game, store } = fixture(); await game.initialize(); store.failSave = true;
  await assert.rejects(game.send({ contactId: 'lin', text: '你好', posts }));
  assert.equal(store.calls, 0); assert.equal(game.locked, true); assert.equal(game.status, 'saveError');
});
test('comments, likes and published moments survive reload; AI comment bodies stay in the host journal', async () => {
  const { game, store, client } = fixture(); await game.initialize();
  await game.post('我来帮忙布展。'); await game.like('poster');
  await game.send({ contactId: 'lin', channel: 'comment', postId: 'poster', text: '叫街角如何？', posts });
  const resumed = new GameController(client); await resumed.initialize();
  assert.deepEqual(resumed.state.likes, ['poster']); assert.equal(resumed.state.posts[0].text, '我来帮忙布展。');
  assert.equal(resumed.state.comments.length, 2); assert(!('text' in resumed.state.comments[1]));
  assert.equal(resumed.replies[resumed.state.comments[1].runId], '可以，我们一起选六张。');
  assert.equal(store.calls, 1);
});
test('completed requests survive a failed final save without duplicate comments', async () => {
  const { game, store, client } = fixture(); await game.initialize();
  const request = client.request.bind(client);
  client.request = async (path, options) => {
    if (path === '/game-data/file' && store.calls && !JSON.parse(JSON.parse(options.body).content).pending) store.failSave = true;
    return request(path, options);
  };
  await assert.rejects(game.send({ contactId: 'lin', channel: 'comment', postId: 'poster', text: '好', posts }));
  store.failSave = false; client.request = request;
  const resumed = new GameController(client); await resumed.initialize();
  assert.equal(store.calls, 1); assert.equal(resumed.state.comments.length, 2);
});
test('incomplete requests are acknowledged instead of automatically regenerated', async () => {
  const { game, store } = fixture(); await game.initialize(); store.terminal = 'incomplete';
  await game.send({ contactId: 'lin', text: '你好', posts });
  assert.equal(store.calls, 1); assert.equal(game.state.pending, null); assert.equal(game.status, 'incomplete');
});
test('invalid saves are never overwritten; public context contains no private transcript', async () => {
  const { game, store } = fixture(); store.state = { version: 99 }; await game.initialize();
  assert.equal(game.blocked, true); assert.equal(store.writes, 0);
  const input = inputEnvelope({ channel: 'chat', text: '你好', locale: 'zh-CN', posts: Array.from({ length: 12 }, (_, i) => ({ id: String(i), text: 'post', author: 'you' })) });
  assert.equal(JSON.parse(input).publicContext.posts.length, 8);
  assert.throws(() => validateState({ ...initialState(), likes: ['missing'] }));
  assert.throws(() => inputEnvelope({ text: ' ', posts: [] }));
});
test('SSE replaces snapshots, handles split UTF-8/CRLF, and requires a terminal result', async () => {
  const raw = 'event: snapshot\r\ndata: {"snapshot":{"text":"旧"}}\r\n\r\nevent: delta\r\ndata: {"delta":"消息"}\r\n\r\nevent: result\r\ndata: {"status":"completed","text":"旧消息"}\r\n\r\n';
  const bytes = new TextEncoder().encode(raw), events = [];
  await consumeEvents(new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } })), (kind, data) => { events.push([kind, data]); return kind === 'result'; });
  assert.deepEqual(events.map(([kind]) => kind), ['snapshot', 'delta', 'result']);
  assert.equal(events[1][1].delta, '消息');
  await assert.rejects(consumeEvents(new Response('event: delta\ndata: {"delta":"partial"}\n\n'), () => false), /terminal/);
});

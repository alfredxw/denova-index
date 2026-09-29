import { CONTACTS, TERMINAL, initialState, validateState, inputEnvelope } from './state.mjs';
import { consumeEvents } from './stream.mjs';

// Game data owns public moments and pending intents. The host owns all Agent history.
export class GameController {
  constructor(client, changed = () => {}) {
    this.client = client; this.changed = changed;
    this.state = initialState(); this.revision = null; this.sessions = {};
    this.histories = {}; this.replies = {}; this.busy = false; this.blocked = true;
    this.live = null; this.status = 'loading';
  }
  get locked() { return this.busy || this.blocked || !!this.state.pending; }
  emit() { this.changed(); }
  async save(next) {
    validateState(next);
    try {
      const result = await this.client.request('/game-data/file', { method: 'PUT', body: JSON.stringify({
        path: 'social.json', content: JSON.stringify(next), expectedRevision: this.revision,
      }) });
      this.revision = result.revision; this.state = next;
    } catch (error) {
      this.blocked = true; this.status = 'saveError';
      console.error('Save social game failed', error); throw error;
    }
  }
  async initialize() {
    if (this.busy) return;
    this.busy = true; this.blocked = true; this.status = 'loading'; this.live = null; this.emit();
    try {
      const { items } = await this.client.request('/game-data/files');
      if (items.some(item => item.path === 'social.json')) {
        const file = await this.client.request('/game-data/file?path=social.json');
        this.state = validateState(JSON.parse(file.content)); this.revision = file.revision;
      } else { this.state = initialState(); this.revision = null; }
      for (const id of CONTACTS) {
        const session = await this.client.request('/agents/sessions', { method: 'POST', body: JSON.stringify({
          projectId: this.client.context.scope.projectId, definition: `local:${id}`, key: `small-circle-v1:${id}`,
        }) });
        this.sessions[id] = session.ref.sessionId;
        await this.history(id);
      }
      this.replies = {};
      const results = await Promise.allSettled(this.state.comments.filter(c => c.runId).map(async c => {
        this.replies[c.runId] = (await this.client.request(`/agents/runs/${encodeURIComponent(c.runId)}`)).text;
      }));
      if (results.some(result => result.status === 'rejected')) throw new Error('Failed to read saved comment replies');
      this.blocked = false; this.status = 'ready';
      if (this.state.pending) await this.resume();
    } catch (error) {
      this.blocked = true;
      if (!['saveError', 'disconnected'].includes(this.status)) this.status = 'loadError';
      console.error('Load social game failed', error);
    } finally { this.busy = false; this.emit(); }
  }
  async history(id, older = false, notify = true) {
    if (!CONTACTS.includes(id) || !this.sessions[id]) return;
    const current = this.histories[id];
    if (older && !current?.cursor) return;
    const query = new URLSearchParams({ limit: '50' });
    if (older) query.set('cursor', current.cursor);
    const page = await this.client.request(`/agents/sessions/${encodeURIComponent(this.sessions[id])}/history?${query}`);
    const all = older ? [...page.items, ...current.items] : page.items;
    this.histories[id] = { items: [...new Map(all.map(item => [item.recordId, item])).values()], cursor: page.cursor };
    if (notify) this.emit();
  }
  async mutate(change) {
    if (this.locked) return false;
    this.busy = true; this.emit();
    try { await this.save(change(structuredClone(this.state))); this.status = 'ready'; return true; }
    finally { this.busy = false; this.emit(); }
  }
  async post(text) {
    if (!text.trim() || text.length > 4000) throw new Error('invalidText');
    return this.mutate(state => { state.posts.push({ id: crypto.randomUUID(), author: 'you', text: text.trim(), at: Date.now() }); return state; });
  }
  like(postId) {
    return this.mutate(state => { state.likes = state.likes.includes(postId) ? state.likes.filter(id => id !== postId) : [...state.likes, postId]; return state; });
  }
  seen(id) {
    const last = this.histories[id]?.items.at(-1)?.recordId;
    if (!last || this.state.seen[id] === last) return Promise.resolve(false);
    return this.mutate(state => { state.seen[id] = last; return state; });
  }
  async send({ contactId, text, channel = 'chat', postId, posts }) {
    if (this.locked) return false;
    if (!CONTACTS.includes(contactId)) throw new Error('Unknown contact');
    const input = inputEnvelope({ channel, text, postId, posts, locale: this.client.context.locale });
    this.busy = true; this.emit();
    try {
      await this.save({ ...this.state, pending: { commandId: crypto.randomUUID(), contactId, channel, postId, text: text.trim(), input, at: Date.now() } });
      await this.resume();
      return true;
    } catch (error) {
      if (!this.blocked) { this.status = 'disconnected'; this.blocked = true; }
      console.error('Character request failed', error);
      throw error;
    } finally { this.busy = false; this.emit(); }
  }
  async resume() {
    const pending = this.state.pending;
    if (!pending) return;
    this.status = 'thinking'; this.emit();
    // Reusing the persisted command and exact input recovers accepted requests without another model call.
    let result = await this.client.request(`/agents/sessions/${encodeURIComponent(this.sessions[pending.contactId])}/runs`, {
      method: 'POST', body: JSON.stringify({ commandId: pending.commandId, input: { text: pending.input } }),
    });
    this.live = { ...result, contactId: pending.contactId }; this.emit();
    if (!TERMINAL.has(result.status)) {
      try {
        const response = await this.client.request(`/agents/runs/${encodeURIComponent(result.run.runId)}/events`, { responseType: 'stream' });
        await consumeEvents(response, (kind, data) => {
          if (kind === 'snapshot') result = data.snapshot;
          if (kind === 'delta') result = { ...result, text: result.text + data.delta };
          if (kind === 'state') result = { ...result, status: data.status };
          if (kind === 'interaction') this.status = 'waiting';
          if (kind === 'result') result = data;
          this.live = { ...result, contactId: pending.contactId };
          if (result.status === 'waiting') this.status = 'waiting';
          this.emit();
          return TERMINAL.has(result.status);
        });
      } catch (error) {
        this.status = 'disconnected'; this.blocked = true; throw error;
      }
    }
    await this.history(pending.contactId, false, false);
    const next = structuredClone(this.state);
    if (pending.channel === 'comment') {
      if (!next.comments.some(comment => comment.id === pending.commandId)) next.comments.push({
        id: pending.commandId, postId: pending.postId, author: 'you', text: pending.text, at: pending.at,
      });
      if (result.status === 'completed' && result.text && !next.comments.some(comment => comment.id === pending.commandId + ':reply')) {
        next.comments.push({ id: pending.commandId + ':reply', postId: pending.postId, author: pending.contactId, runId: result.run.runId, at: Date.now() });
        this.replies[result.run.runId] = result.text;
      }
    }
    next.pending = null;
    await this.save(next);
    this.live = null;
    this.status = result.status === 'completed' ? 'ready' : result.status === 'incomplete' ? 'incomplete' : 'failed';
    this.emit();
  }
  async stop() {
    if (!this.live || TERMINAL.has(this.live.status)) return;
    this.status = 'stopping'; this.emit();
    try { await this.client.request(`/agents/runs/${encodeURIComponent(this.live.run.runId)}/cancel`, { method: 'POST' }); }
    catch (error) { this.status = 'disconnected'; this.emit(); console.error('Cancel character reply failed', error); throw error; }
  }
}

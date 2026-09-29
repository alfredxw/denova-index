export const CONTACTS = ['lin', 'xu', 'tang'];
export const OPENING_POSTS = ['poster', 'cafe', 'rain'];
export const TERMINAL = new Set(['completed', 'failed', 'aborted', 'incomplete']);
export const initialState = () => ({ version: 1, posts: [], likes: [], comments: [], seen: {}, pending: null });
const text = (value, max = 4000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export function validateState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.posts) || !Array.isArray(value.likes) ||
      !Array.isArray(value.comments) || !value.seen || typeof value.seen !== 'object' || Array.isArray(value.seen)) throw new Error('Invalid save');
  const ids = new Set(OPENING_POSTS);
  for (const post of value.posts) {
    if (!text(post.id, 128) || ids.has(post.id) || post.author !== 'you' || !text(post.text) || !Number.isFinite(post.at)) throw new Error('Invalid post');
    ids.add(post.id);
  }
  if (new Set(value.likes).size !== value.likes.length || value.likes.some(id => !ids.has(id))) throw new Error('Invalid likes');
  const commentIds = new Set();
  for (const comment of value.comments) {
    if (!text(comment.id, 160) || commentIds.has(comment.id) || !ids.has(comment.postId) || !Number.isFinite(comment.at)) throw new Error('Invalid comment');
    commentIds.add(comment.id);
    if (comment.author === 'you' ? !text(comment.text) : !CONTACTS.includes(comment.author) || !text(comment.runId, 256)) throw new Error('Invalid comment author');
  }
  for (const [id, record] of Object.entries(value.seen)) if (!CONTACTS.includes(id) || typeof record !== 'string') throw new Error('Invalid seen marker');
  if (value.pending !== null) {
    const p = value.pending;
    if (!p || !CONTACTS.includes(p.contactId) || !text(p.commandId, 128) || !text(p.input, 65536) || !text(p.text) ||
        !['chat', 'comment'].includes(p.channel) || (p.channel === 'comment' && !ids.has(p.postId)) || !Number.isFinite(p.at)) throw new Error('Invalid pending command');
    const envelope = JSON.parse(p.input);
    if (envelope.format !== 'small-circle-v1' || envelope.channel !== p.channel || envelope.text !== p.text || envelope.postId !== p.postId) throw new Error('Pending input mismatch');
  }
  return value;
}
export function playerText(raw) {
  try {
    const envelope = JSON.parse(raw);
    if (envelope.format === 'small-circle-v1' && typeof envelope.text === 'string') return envelope.text;
  } catch { /* Historical plain text remains readable. */ }
  return raw;
}
export function inputEnvelope({ channel, text, postId, locale, posts }) {
  if (!text.trim() || text.length > 4000) throw new Error('invalidText');
  // The latest public posts provide bounded shared context; private conversations stay private.
  return JSON.stringify({ format: 'small-circle-v1', channel, text: text.trim(), postId, locale,
    publicContext: { scope: 'Latest 8 public moments; older moments omitted. No other private conversations.', posts: posts.slice(-8).map(({ id, author, text }) => ({ id, author, text })), targetPost: posts.find(post => post.id === postId) || null } });
}

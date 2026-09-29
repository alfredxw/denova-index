import { connect } from './client.mjs';
import { GameController } from './controller.mjs';
import { CONTACTS, TERMINAL, playerText } from './state.mjs';
import zh from './locales/zh-CN.json' with { type: 'json' };
import en from './locales/en-US.json' with { type: 'json' };

const $ = id => document.getElementById(id);
let current = 'lin', view = 'chats', commentPost, controller, historyVersion = '';
const drafts = Object.fromEntries(CONTACTS.map(id => [id, '']));
const client = await connect({ prepareExit: () => !controller?.busy || !!controller?.state.pending });
const strings = () => client.context.locale === 'zh-CN' ? zh : en;
const posts = () => [...strings().posts, ...controller.state.posts];
const name = id => id === 'you' ? strings().you : strings().contacts[id].name;
const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
function avatar(id) { return el('span', 'avatar ' + id, id === 'you' ? strings().you : strings().contacts[id].initial); }
function button(label, action, cls = '') { const node = el('button', cls, label); node.type = 'button'; node.addEventListener('click', action); return node; }
async function action(work) {
  try { await work(); } catch (error) {
    console.error('Social game action failed', error);
    if (!controller.blocked) controller.status = error.message === 'invalidText' ? 'invalidText' : 'historyError';
    render();
  }
}
function showContact(id) {
  drafts[current] = $('message').value;
  current = id; view = 'chats'; $('app').dataset.chatOpen = 'true'; historyVersion = '';
  $('message').value = drafts[id];
  render(); void action(() => controller.seen(id));
}
function renderContacts() {
  const s = strings(), query = $('search').value.trim().toLocaleLowerCase();
  const nodes = CONTACTS.filter(id => (s.contacts[id].name + s.contacts[id].role).toLocaleLowerCase().includes(query)).map(id => {
    const history = controller.histories[id]?.items || [], last = history.at(-1);
    const node = button('', () => showContact(id), 'contact' + (id === current && view === 'chats' ? ' selected' : ''));
    const copy = el('div', 'contact-copy'); copy.append(el('div', 'contact-name', name(id)), el('div', 'contact-preview', last ? playerText(last.text) : s.contacts[id].greeting));
    node.append(avatar(id), copy);
    node.setAttribute('aria-label', name(id) + ' · ' + s.contacts[id].role);
    const reading = id === current && view === 'chats' && (window.innerWidth > 600 || $('app').dataset.chatOpen === 'true');
    if (!reading && last?.role === 'assistant' && controller.state.seen[id] !== last.recordId) { const dot = el('span', 'unread'); dot.setAttribute('aria-label', s.unread); node.append(dot); }
    return node;
  });
  $('contacts').replaceChildren(...(nodes.length ? nodes : [el('p', 'muted', s.noContacts)]));
}
function message(role, text, live = false) {
  const row = el('div', 'message ' + role + (live ? ' streaming' : ''));
  row.append(avatar(role === 'user' ? 'you' : current), el('div', 'bubble', text)); return row;
}
function renderMessages() {
  const s = strings(), history = controller.histories[current], pending = controller.state.pending;
  const live = controller.live?.contactId === current ? controller.live : null;
  const version = JSON.stringify([current, client.context.locale, history, pending, live?.text, live?.status]);
  if (version === historyVersion) return;
  historyVersion = version;
  const area = $('messages'), bottom = area.scrollHeight - area.scrollTop - area.clientHeight < 110;
  const nodes = [el('p', 'chat-divider', s.subtitle)];
  if (history?.cursor) {
    const older = button(s.older, () => action(() => controller.history(current, true)));
    older.disabled = controller.busy; nodes.push(older);
  }
  nodes.push(message('assistant', s.contacts[current].greeting));
  for (const item of history?.items || []) {
    if (!['assistant', 'user'].includes(item.role)) continue;
    let text = playerText(item.text);
    try { if (JSON.parse(item.text).channel === 'comment') text = '[' + s.moments + '] ' + text; } catch { /* Plain replies. */ }
    nodes.push(message(item.role, text));
  }
  if (pending?.contactId === current) {
    if (history?.items.at(-1)?.text !== pending.input) nodes.push(message('user', pending.text));
    nodes.push(message('assistant', live?.text || s.thinking, true));
  }
  area.replaceChildren(...nodes);
  if (bottom || !(history?.items.length)) area.scrollTop = area.scrollHeight;
}
function openComment(post) {
  commentPost = post.id; $('comment-target').textContent = post.text;
  $('reply-contact').replaceChildren(...CONTACTS.map(id => { const option = el('option', '', name(id)); option.value = id; return option; }));
  $('reply-contact').value = post.author === 'you' ? current : post.author;
  $('reply-contact').disabled = post.author !== 'you';
  $('comment-text').value = ''; $('comment-dialog').showModal(); $('comment-text').focus();
}
let feedVersion = '';
function renderFeed() {
  const s = strings();
  const version = JSON.stringify([client.context.locale, controller.state.posts, controller.state.likes, controller.state.comments, controller.replies, controller.locked]);
  if (version === feedVersion) return;
  feedVersion = version;
  const nodes = posts().toReversed().map(post => {
    const article = el('article', 'post'); article.dataset.postId = post.id;
    article.append(avatar(post.author)); const body = el('div', 'post-body');
    body.append(el('div', 'post-name', name(post.author)), el('p', 'post-text', post.text));
    if (post.art) { const art = el('div', 'art ' + post.art); art.setAttribute('aria-hidden', 'true'); body.append(art); }
    const when = post.at ? new Intl.DateTimeFormat(client.context.locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(post.at) : s.earlier;
    body.append(el('p', 'post-meta', when + (post.tag ? ' · ' + post.tag : '')));
    const controls = el('div', 'post-actions'), liked = controller.state.likes.includes(post.id);
    const like = button(liked ? s.liked : s.like, () => action(() => controller.like(post.id)));
    like.setAttribute('aria-pressed', String(liked)); like.disabled = controller.locked;
    const comment = button(s.comment, () => openComment(post)); comment.disabled = controller.locked;
    controls.append(like, comment); body.append(controls);
    const replies = controller.state.comments.filter(item => item.postId === post.id);
    if (replies.length) {
      const comments = el('div', 'comments');
      for (const reply of replies) {
        const line = el('p', 'comment-line'); line.append(el('span', 'comment-author', name(reply.author) + ': '), document.createTextNode(reply.text ?? controller.replies[reply.runId] ?? s.commentMissing)); comments.append(line);
      }
      body.append(comments);
    }
    article.append(body); return article;
  });
  $('feed').replaceChildren(...nodes);
}
function render() {
  if (!controller) return;
  const s = strings();
  document.documentElement.lang = client.context.locale;
  document.documentElement.dataset.theme = client.context.theme;
  document.title = s.title;
  document.querySelectorAll('[data-t]').forEach(node => node.textContent = s[node.dataset.t]);
  $('app').dataset.view = view;
  $('tab-chats').setAttribute('aria-pressed', String(view === 'chats'));
  $('tab-moments').setAttribute('aria-pressed', String(view === 'moments'));
  $('search').placeholder = s.searchPlaceholder; $('search').setAttribute('aria-label', s.search);
  $('message').placeholder = s.messagePlaceholder; $('post-text').placeholder = s.postPlaceholder;
  $('comment-text').placeholder = s.commentPlaceholder;
  $('back').setAttribute('aria-label', s.back);
  $('chat-view').hidden = view !== 'chats'; $('moments-view').hidden = view !== 'moments';
  $('chat-avatar').replaceChildren(avatar(current)); $('chat-name').textContent = name(current); $('chat-role').textContent = s.contacts[current].role;
  for (const id of ['send', 'publish', 'comment-send']) $(id).disabled = controller.locked;
  $('status').textContent = s[controller.status] || s.loadError;
  $('recover').hidden = !controller.blocked; $('recover').disabled = controller.busy;
  $('stop').hidden = !controller.live || TERMINAL.has(controller.live.status);
  $('stop').disabled = controller.status === 'stopping';
  renderContacts(); renderMessages(); renderFeed();
}
controller = new GameController(client, render);
$('search').addEventListener('input', renderContacts);
$('tab-chats').addEventListener('click', () => { view = 'chats'; $('app').dataset.chatOpen = 'false'; render(); });
$('tab-moments').addEventListener('click', () => { view = 'moments'; render(); });
$('back').addEventListener('click', () => { $('app').dataset.chatOpen = 'false'; render(); });
$('exit').addEventListener('click', () => client.exit());
$('recover').addEventListener('click', () => controller.initialize());
$('stop').addEventListener('click', () => action(() => controller.stop()));
$('close-comment').addEventListener('click', () => $('comment-dialog').close());
$('chat-form').addEventListener('submit', event => {
  event.preventDefault(); if (controller.locked) return;
  const field = $('message'), text = field.value, contactId = current;
  drafts[contactId] = text;
  void action(async () => {
    if (await controller.send({ contactId, text, posts: posts() })) {
      if (drafts[contactId] === text) drafts[contactId] = '';
      if (current === contactId && field.value === text) field.value = '';
    }
  });
});
$('post-form').addEventListener('submit', event => {
  event.preventDefault(); const text = $('post-text').value;
  void action(async () => { if (await controller.post(text) && $('post-text').value === text) $('post-text').value = ''; });
});
$('comment-form').addEventListener('submit', event => {
  event.preventDefault(); if (controller.locked) return;
  const text = $('comment-text').value;
  if (!text.trim()) { $('comment-text').focus(); return; }
  const contactId = $('reply-contact').value, postId = commentPost;
  $('comment-dialog').close();
  void action(() => controller.send({ contactId, text, channel: 'comment', postId, posts: posts() }));
});
window.addEventListener('denova:appearance', () => { historyVersion = ''; feedVersion = ''; render(); });
await controller.initialize();

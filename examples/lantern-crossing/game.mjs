import { connect } from './client.mjs';
import { scenes, initialSave, currentScene, choose } from './story.mjs';
import english from './locales/en-US.json' with { type: 'json' };
import chinese from './locales/zh-CN.json' with { type: 'json' };

let pending;
const client = await connect({ prepareExit: async () => { if (pending) await pending; return true; } });
const root = document.querySelector('#game-root');
const choices = document.querySelector('#choices');
let save = initialSave(), revision = null, ready = false, status = 'loading';
const text = () => client.context.locale === 'zh-CN' ? chinese : english;
const setText = (id, value) => { document.getElementById(id).textContent = value; };
function render() {
  const strings = text();
  document.documentElement.lang = client.context.locale;
  document.documentElement.dataset.theme = client.context.theme;
  document.title = strings.title;
  for (const id of ['title', 'subtitle', 'eyebrow', 'exit', 'retry', 'restart']) setText(id, strings[id]);
  const scene = currentScene(save);
  setText('chapter', strings.step.replace('{n}', String(save.path.length + 1)));
  setText('scene-title', strings.scenes[scene].title);
  setText('scene-text', strings.scenes[scene].text);
  choices.replaceChildren();
  for (const choice of Object.keys(scenes[scene].choices)) {
    const button = document.createElement('button');
    button.textContent = strings.scenes[scene].choices[choice];
    button.disabled = !ready || !!pending;
    button.addEventListener('click', () => persist(choose(save, choice)));
    choices.append(button);
  }
  setText('status', strings[status]);
  root.setAttribute('aria-busy', String(!!pending || status === 'loading'));
  document.querySelector('#exit').hidden = false;
  document.querySelector('#retry').hidden = !['loadFailed', 'saveFailed', 'conflict'].includes(status);
  document.querySelector('#retry').disabled = !!pending;
  document.querySelector('#restart').hidden = !ready || Object.keys(scenes[scene].choices).length > 0;
  document.querySelector('#restart').disabled = !!pending;
}
async function load() {
  ready = false; status = 'loading'; render();
  try {
    const { items } = await client.request('/game-data/files');
    if (items.some(item => item.path === 'journey.json')) {
      const snapshot = await client.request('/game-data/file?path=journey.json');
      const next = JSON.parse(snapshot.content);
      currentScene(next);
      save = next; revision = snapshot.revision;
    } else { save = initialSave(); revision = null; }
    ready = true; status = revision ? 'saved' : 'ready';
  } catch (error) { console.error('Load game save failed', error); status = 'loadFailed'; }
  render();
}
function persist(next) {
  if (!ready || pending) return;
  status = 'saving';
  pending = (async () => {
    try {
      const result = await client.request('/game-data/file', { method: 'PUT', body: JSON.stringify({ path: 'journey.json', content: JSON.stringify(next), expectedRevision: revision }) });
      revision = result.revision; save = next; status = 'saved';
    } catch (error) {
      console.error('Save game decision failed', error);
      ready = false; status = error.code === 'DOCUMENT_CONFLICT' ? 'conflict' : 'saveFailed';
    } finally {
      pending = undefined; render();
      if (ready) document.querySelector('#scene-title').focus();
    }
  })();
  render();
}
document.querySelector('#retry').addEventListener('click', () => { if (!pending) void load(); });
document.querySelector('#restart').addEventListener('click', () => persist(initialSave()));
document.querySelector('#exit').addEventListener('click', () => client.exit());
window.addEventListener('denova:appearance', render);
await load();

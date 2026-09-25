// Saves store decisions. Replaying them validates both the version and reachable state.
export const scenes = {
  dock: { choices: { inspect: 'ledger', follow: 'bridge' } },
  ledger: { choices: { question: 'keeper', hurry: 'bridge' } },
  bridge: { choices: { signal: 'keeper', cross: 'warehouse' } },
  keeper: { choices: { trust: 'rescue', investigate: 'warehouse' } },
  warehouse: { choices: { chain: 'smugglers', bell: 'rescue' } },
  rescue: { choices: {} },
  smugglers: { choices: {} },
};
export const initialSave = () => ({ version: 1, path: [] });
export function currentScene(save) {
  if (save?.version !== 1 || !Array.isArray(save.path) || save.path.length > 8) throw new Error('Invalid save format');
  let scene = 'dock';
  for (const choice of save.path) {
    if (typeof choice !== 'string' || !Object.hasOwn(scenes[scene].choices, choice)) throw new Error('Invalid saved decision');
    scene = scenes[scene].choices[choice];
  }
  return scene;
}
export function choose(save, choice) {
  const scene = currentScene(save);
  if (!Object.hasOwn(scenes[scene].choices, choice)) throw new Error('Unavailable choice');
  return { version: 1, path: [...save.path, choice] };
}

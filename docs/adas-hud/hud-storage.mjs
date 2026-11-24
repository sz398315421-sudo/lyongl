const lastSettingsKey = 'last-settings-v1';
let resetting = false;

export const hudPreferences = {
  getItem(key) { return localStorage.getItem(`hud:${key}`); },
  setItem(key, value) { if (!resetting) localStorage.setItem(`hud:${key}`, value); }
};

export const hudSnapshots = {
  getItem(key) { return sessionStorage.getItem(`hud:${key}`); },
  setItem(key, value) { if (!resetting) sessionStorage.setItem(`hud:${key}`, value); }
};

export function readHudLastSettings() {
  try {
    const saved = JSON.parse(hudPreferences.getItem(lastSettingsKey));
    if (typeof saved?.query === 'string' && new URLSearchParams(saved.query).has('scene')) return saved;
  } catch {}
  return null;
}

export function restoreHudStartup() {
  if (location.search) return;
  const saved = readHudLastSettings();
  if (!saved) return;
  const url = new URL(location.href);
  url.search = saved.query;
  history.replaceState(history.state, '', url);
}

export function saveHudLastSettings(query, controls) {
  try { hudPreferences.setItem(lastSettingsKey, JSON.stringify({query, controls})); } catch {}
}

export function resetHudSettings() {
  resetting = true;
  try {
    for (const key of [lastSettingsKey, 'preview-controls', 'sr-theme', 'sr-screen-format', 'sr-guidance-color', 'sr-traffic', 'png-sequence']) {
      localStorage.removeItem(`hud:${key}`);
    }
  } catch {}
  try { sessionStorage.removeItem('hud:drivescene-preview-v10'); } catch {}
  location.replace(new URL('./', location.href));
}

export const hudPreferences = {
  getItem(key) { return localStorage.getItem(`hud:${key}`); },
  setItem(key, value) { localStorage.setItem(`hud:${key}`, value); }
};

export const hudSnapshots = {
  getItem(key) { return sessionStorage.getItem(`hud:${key}`); },
  setItem(key, value) { sessionStorage.setItem(`hud:${key}`, value); }
};

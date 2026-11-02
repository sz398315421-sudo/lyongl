/* A visitor-facing gate for GitHub Pages, not server-side authorization. */
(() => {
  'use strict';
  const root = document.documentElement;
  const sessionKey = 'yongle:portfolio-access:v1';
  let unlocked = false;
  try { unlocked = sessionStorage.getItem(sessionKey) === 'granted'; } catch {}

  function isPublicRoute(value = location.href) {
    const url = new URL(value, location.href);
    if (url.origin !== location.origin) return false;
    return /^\/explore\/?$/.test(url.pathname) || url.pathname === '/explore/index.html'
      || /^\/(adas|luyoupu|danmugame|game-demo2)(\/|$)/.test(url.pathname)
      || (['/', '/index.html'].includes(url.pathname) && url.hash === '#explore');
  }
  const canView = value => unlocked || isPublicRoute(value);
  function sync() {
    const allowed = canView(location.href);
    root.dataset.access = allowed ? 'open' : 'locked';
    const gate = document.getElementById('access-gate');
    if (gate) {
      gate.hidden = allowed;
      if (allowed && gate.open) gate.close();
      else if (!allowed && !gate.matches(':modal')) {
        if (gate.open) gate.close();
        gate.showModal();
      }
    }
    return allowed;
  }
  window.portfolioAccess = {isPublicRoute, canView, sync};
  sync();
  document.addEventListener('DOMContentLoaded', () => {
    const gate = document.getElementById('access-gate');
    if (!gate) return;
    const form = document.getElementById('access-form');
    const input = document.getElementById('access-password');
    const error = document.getElementById('access-error');
    gate.addEventListener('cancel', event => event.preventDefault());
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (input.value !== '6666') {
        error.textContent = input.value ? '密码不正确，请重试。' : '请输入密码。';
        input.setAttribute('aria-invalid', 'true');
        input.focus(); input.select();
        return;
      }
      unlocked = true;
      try { sessionStorage.setItem(sessionKey, 'granted'); } catch {}
      input.value = ''; error.textContent = '';
      input.removeAttribute('aria-invalid');
      sync();
      document.dispatchEvent(new Event('portfolio:unlocked'));
    });
    input.addEventListener('input', () => {
      error.textContent = ''; input.removeAttribute('aria-invalid');
    });
    // The public exit uses a normal navigation even before the app is ready.
    document.getElementById('access-explore').addEventListener('click', event => event.stopPropagation());
    sync();
  });
  window.addEventListener('pageshow', sync);
  window.addEventListener('hashchange', sync);
  // The courtyard iframe shares this tab's session but has its own document.
  window.addEventListener('storage', event => {
    if (event.key !== sessionKey) return;
    unlocked = event.newValue === 'granted';
    sync();
  });
})();

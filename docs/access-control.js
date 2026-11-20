/* A visitor-facing gate for GitHub Pages, not server-side authorization. */
(() => {
  'use strict';
  const root = document.documentElement;
  const sessionKey = 'yongle:portfolio-access:v1';
  const passwordVerifier = Object.freeze({
    salt: '4f4f7553dc0f6439179c103e417d6009',
    iterations: 600000,
    hash: '34fc8af92a49d4dfa10fcd9741b4c6a18a2b0a7470b4ea3f393ce1d0c842b6a1',
  });
  async function verifyPassword(password) {
    const subtle = window.crypto?.subtle;
    if (!subtle) throw new Error('Password verification requires Web Crypto.');
    const salt = Uint8Array.from(passwordVerifier.salt.match(/../g), byte => parseInt(byte, 16));
    const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt, iterations:passwordVerifier.iterations}, key, 256);
    const hash = Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('');
    return hash === passwordVerifier.hash;
  }
  let unlocked = false;
  try { unlocked = sessionStorage.getItem(sessionKey) === 'granted'; } catch {}

  function isPublicRoute(value = location.href) {
    const url = new URL(value, location.href);
    if (url.origin !== location.origin) return false;
    return /^\/explore\/?$/.test(url.pathname) || url.pathname === '/explore/index.html'
      || /^\/(adas|luyoupu|danmugame|game-demo2|xszw)(\/|$)/.test(url.pathname)
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
    const submit = form.querySelector('button[type="submit"]');
    let checking = false;
    gate.addEventListener('cancel', event => event.preventDefault());
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (checking) return;
      if (!input.value) {
        error.textContent = '请输入密码。';
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      checking = true;
      input.disabled = submit.disabled = true;
      gate.setAttribute('aria-busy', 'true');
      error.textContent = '';
      input.removeAttribute('aria-invalid');
      let valid = false;
      try {
        valid = await verifyPassword(input.value);
        if (!valid) {
          error.textContent = '密码不正确，请重试。';
          input.setAttribute('aria-invalid', 'true');
          return;
        }
        unlocked = true;
        try { sessionStorage.setItem(sessionKey, 'granted'); } catch {}
        input.value = '';
        sync();
        document.dispatchEvent(new Event('portfolio:unlocked'));
      } catch {
        error.textContent = '密码验证暂不可用，请刷新重试。';
      } finally {
        checking = false;
        input.disabled = submit.disabled = false;
        gate.removeAttribute('aria-busy');
        if (!valid) { input.focus(); input.select(); }
      }
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

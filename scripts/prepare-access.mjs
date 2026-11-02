import {readFile, writeFile, readdir} from 'node:fs/promises';

const root = new URL('../docs/', import.meta.url);
const projects = await readdir(new URL('projects/', root), {withFileTypes: true});
const routes = ['index.html', 'explore/index.html', 'about/index.html', 'projects/index.html',
  ...projects.filter(entry => entry.isDirectory()).map(entry => `projects/${entry.name}/index.html`),
  'unseen-engine/index.html'];
const head = `
  <!-- access-control:start -->
  <style>html[data-access="locked"] body>:not(#access-gate):not(.access-noscript){visibility:hidden!important;pointer-events:none!important}html:not([data-access="locked"]) #access-gate{display:none!important}</style>
  <link rel="stylesheet" href="/access-control.css?v=20261102-minimal">
  <script src="/access-control.js?v=20261102-minimal"></script>
  <!-- access-control:end -->`;
const gate = `
  <!-- access-gate:start -->
  <dialog id="access-gate" open aria-labelledby="access-title">
    <header class="access-header"><span class="access-brand">YONGLE LIU<sup>®</sup></span></header>
    <div class="access-content">
      <div class="access-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></div>
      <h1 id="access-title">访问密码</h1>
      <form id="access-form" method="dialog" novalidate>
        <input id="access-password" type="password" inputmode="numeric" autocomplete="off" placeholder="请输入密码" aria-label="访问密码" aria-describedby="access-error" required autofocus>
        <p id="access-error" role="status" aria-live="polite"></p>
        <button class="access-submit" type="submit"><span>解锁并进入</span><span aria-hidden="true">↗</span></button>
      </form>
      <a id="access-explore" href="/explore/">前往探索 <span aria-hidden="true">↗</span></a>
    </div>
    <footer class="access-footer"><span>© 2026 刘泳乐</span></footer>
  </dialog>
  <noscript class="access-noscript">请输入密码前先开启 JavaScript，或<a href="/explore/">前往探索</a>。</noscript>
  <!-- access-gate:end -->`;
for (const route of routes) {
  const url = new URL(route, root);
  let html = await readFile(url, 'utf8');
  html = html.replace(/\s*<!-- access-control:start -->[\s\S]*?<!-- access-control:end -->/, '')
    .replace(/\s*<!-- access-gate:start -->[\s\S]*?<!-- access-gate:end -->/, '')
    .replace(/<html([^>]*?)>/, (_, attrs) => `<html${attrs.replace(/ data-access="[^"]*"/, '')} data-access="locked">`)
    .replace(/<head>/, `<head>${head}`)
    .replace(/<body([^>]*)>/, `<body$1>${gate}`)
    .replace(/app-controller\.js\?v=[^" ]+/, 'app-controller.js?v=20261102-secret')
    .replace(/scene-start\.js\?v=[^" ]+/, 'scene-start.js?v=20261102-gallery-ready')
    .replace(/welcome\.js\?v=[^" ]+/, 'welcome.js?v=20261102-secret');
  await writeFile(url, html);
}
console.log(`Prepared password gate on ${routes.length} portfolio documents; public experiments are unchanged.`);

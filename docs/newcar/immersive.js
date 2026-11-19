const button = document.querySelector('#immersive-btn');
const sheet = document.querySelector('#sheet');
const canvas = document.querySelector('#gl');
const app = window.app;

// A short tap exits. Dragging, zooming and multi-touch keep the scene open.
const contacts = new Set();
let tapOrigin = null;

function setImmersive(enabled) {
  app.immersive = enabled;
  document.body.classList.toggle('immersive', enabled);
  sheet.inert = enabled;
  contacts.clear();
  tapOrigin = null;
  app.pointer.down = null;
  app.setHoverPart(null);
  app.boulders.setShowTall(!enabled && app.sys.overlay);
  app.resize();
  if (enabled) canvas.focus({preventScroll:true});
  else button.focus({preventScroll:true});
}

button.disabled = true;
await app.ready;
if (app.share) {
  button.disabled = false;
  button.addEventListener('click', () => setImmersive(true));
}

window.addEventListener('keydown', event => {
  if (!app.immersive) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    setImmersive(false);
  } else if (event.key === '?' || event.key.toLowerCase() === 'h') {
    // Keep help and navigation overlays closed while viewing the scene.
    event.stopImmediatePropagation();
  }
}, true);

canvas.addEventListener('pointerdown', event => {
  if (!app.immersive) return;
  contacts.add(event.pointerId);
  tapOrigin = contacts.size === 1 && event.isPrimary && event.button === 0
    ? {id:event.pointerId, x:event.clientX, y:event.clientY} : null;
}, true);
canvas.addEventListener('pointermove', event => {
  if (tapOrigin && Math.hypot(event.clientX-tapOrigin.x,event.clientY-tapOrigin.y)>6) tapOrigin = null;
}, true);
canvas.addEventListener('pointercancel', event => {
  contacts.delete(event.pointerId);
  tapOrigin = null;
}, true);
canvas.addEventListener('pointerup', event => {
  const tapped = tapOrigin?.id === event.pointerId && contacts.size === 1 &&
    Math.hypot(event.clientX-tapOrigin.x,event.clientY-tapOrigin.y)<=6;
  contacts.delete(event.pointerId);
  tapOrigin = null;
  if (app.immersive && tapped) setImmersive(false);
}, true);

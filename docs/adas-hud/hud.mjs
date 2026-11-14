const canvas = document.getElementById('scene-canvas');
const immersive = document.getElementById('hud-immersive');
const dialog = document.getElementById('hud-immersive-dialog');
const scenePicker = document.getElementById('scene-picker');
const sceneMenu = document.getElementById('mobile-scene-menu');
let placeholder;

sceneMenu.addEventListener('click', event => {
  if (event.target.closest('button[data-structure]') && scenePicker.getAttribute('aria-expanded') === 'true') {
    scenePicker.click();
  }
});

immersive.addEventListener('click', () => {
  if (placeholder) return;
  placeholder = document.createComment('HUD canvas');
  canvas.replaceWith(placeholder);
  dialog.append(canvas);
  dialog.showModal();
  document.documentElement.style.overflow = 'hidden';
});

dialog.addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  placeholder.replaceWith(canvas);
  placeholder = null;
  document.documentElement.style.overflow = '';
  immersive.focus({preventScroll: true});
});

function enablePreviewActions() {
  immersive.disabled = false;
}

window.addEventListener('studio:ready', enablePreviewActions);
if (document.getElementById('preview').dataset.vehicleReady === 'true') enablePreviewActions();

window.addEventListener('studio:error', () => {
  if (dialog.open) dialog.close();
  immersive.disabled = true;
});

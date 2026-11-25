import {setScreenFormat, sizeLabel} from '../adas/screen-format.js';

export function initHudSubpageNavigation() {
  const picker = document.getElementById('scene-picker');
  const menu = document.getElementById('mobile-scene-menu');
  const nav = document.getElementById('scenes');
  const mobileNav = document.getElementById('mobile-scene-nav');
  const mobile = matchMedia('(max-width: 760px)');
  const showMenu = open => {
    menu.classList.toggle('is-open', open);
    menu.inert = !open;
    menu.setAttribute('aria-hidden', String(!open));
    picker.setAttribute('aria-expanded', String(open));
    picker.setAttribute('aria-label', open ? '关闭场景菜单' : '选择场景');
  };
  const placeNavigation = () => {
    showMenu(false);
    (mobile.matches ? mobileNav : menu.parentElement).append(nav);
  };
  picker.addEventListener('click', () => showMenu(menu.inert));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || menu.inert) return;
    showMenu(false);
    picker.focus();
  });
  mobile.addEventListener('change', placeNavigation);
  placeNavigation();
}

export function initHudSubpageFormats(dimensions, onChange) {
  const formats = [...document.querySelectorAll('[data-screen-format]')];
  const group = formats[0].parentElement;
  const syncIndicator = () => {
    const active = formats.find(button => button.getAttribute('aria-pressed') === 'true');
    group.style.setProperty('--selection-x', `${active.offsetLeft}px`);
    group.style.setProperty('--selection-width', `${active.offsetWidth}px`);
  };
  for (const button of formats) {
    button.addEventListener('click', () => {
      const format = setScreenFormat(button.dataset.screenFormat);
      document.documentElement.style.setProperty('--screen-aspect', String(format.width / format.height));
      dimensions.textContent = sizeLabel();
      for (const item of formats) item.setAttribute('aria-pressed', String(item === button));
      syncIndicator();
      onChange(format);
    });
  }
  new ResizeObserver(syncIndicator).observe(group);
}

export function initHudSubpageImmersive(canvas) {
  const button = document.getElementById('hud-immersive');
  const dialog = document.getElementById('hud-immersive-dialog');
  const placeholder = document.createComment('HUD canvas');
  button.addEventListener('click', () => {
    canvas.replaceWith(placeholder);
    dialog.append(canvas);
    dialog.showModal();
  });
  dialog.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    placeholder.replaceWith(canvas);
    button.focus({preventScroll: true});
  });
}

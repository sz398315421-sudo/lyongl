// Typography stays interactive even when WebGL is unavailable.
export function createHeroInteractions(hero, reduced) {
  const title = hero.querySelector('h1');
  if (!title) return;
  const copy = hero.querySelector('.hero-copy');
  const cta = hero.querySelector('.primary-cta');
  const cursor = hero.querySelector('.scene-cursor');
  const letters = [];
  title.setAttribute('aria-label', [...title.children].map(line => line.textContent.trim()).join(' '));
  for (const line of title.children) {
    const text = line.textContent;
    line.textContent = '';
    line.setAttribute('aria-hidden', 'true');
    for (const character of text) {
      const span = document.createElement('span');
      span.className = 'hero-letter';
      span.textContent = character === ' ' ? '\u00a0' : character;
      line.append(span);
      letters.push({ element: span, x: 0, y: 0, vx: 0, vy: 0, cx: 0, cy: 0 });
    }
  }
  let rect, button, active = false, visible = true, dirty = true;
  let px = -1000, py = -1000, nx = 0, ny = 0;
  let copyX = 0, copyY = 0, buttonX = 0, buttonY = 0, previous = 0, frame = 0;
  function measure() {
    rect = hero.getBoundingClientRect();
    for (const letter of letters) {
      const bounds = letter.element.getBoundingClientRect();
      letter.cx = bounds.left + bounds.width / 2 - letter.x - copyX;
      letter.cy = bounds.top + bounds.height / 2 - letter.y - copyY;
    }
    if (cta) {
      const bounds = cta.getBoundingClientRect();
      button = { x: bounds.left + bounds.width / 2 - buttonX - copyX,
        y: bounds.top + bounds.height / 2 - buttonY - copyY,
        width: bounds.width, height: bounds.height };
    }
    dirty = false;
  }
  function reset() {
    active = false; nx = ny = 0;
    hero.classList.remove('pointer-active', 'over-text');
  }
  hero.addEventListener('pointermove', event => {
    if (reduced || event.pointerType === 'touch') return;
    if (dirty) measure();
    px = event.clientX; py = event.clientY;
    nx = (px - rect.left) / rect.width * 2 - 1;
    ny = (py - rect.top) / rect.height * 2 - 1;
    active = true;
    hero.classList.toggle('pointer-active', !event.target.closest('a, button, nav'));
  }, { passive: true });
  hero.addEventListener('pointerleave', reset);
  window.addEventListener('blur', reset);
  window.addEventListener('resize', () => { dirty = true; }, { passive: true });
  window.addEventListener('scroll', () => { dirty = true; reset(); }, { passive: true });
  document.fonts.ready.then(() => { dirty = true; });
  copy.addEventListener('animationend', () => { dirty = true; });
  document.addEventListener('welcome:entered', () => { dirty = true; });
  new ResizeObserver(() => { dirty = true; }).observe(title);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !frame && !reduced) frame = requestAnimationFrame(animate);
  }).observe(hero);
  function animate(now) {
    frame = 0;
    if (!visible || reduced) return;
    if (document.hidden || document.body.classList.contains('locked') || document.body.classList.contains('intro-pending')) {
      previous = now; frame = requestAnimationFrame(animate); return;
    }
    const dt = Math.min((now - (previous || now - 16.67)) / 1000, .035);
    previous = now;
    if (dirty) measure();
    const ease = 1 - Math.exp(-dt * 6);
    copyX += (nx * -13 - copyX) * ease;
    copyY += (ny * -8 - copyY) * ease;
    copy.style.setProperty('--copy-x', `${copyX.toFixed(2)}px`);
    copy.style.setProperty('--copy-y', `${copyY.toFixed(2)}px`);
    let overText = false;
    for (const letter of letters) {
      const dx = px - letter.cx - copyX, dy = py - letter.cy - copyY;
      const distance = Math.hypot(dx, dy);
      const influence = active ? Math.max(0, 1 - distance / 140) ** 2 : 0;
      const targetX = -dx / Math.max(distance, 30) * influence * 18;
      const targetY = -dy / Math.max(distance, 30) * influence * 22;
      letter.vx += ((targetX - letter.x) * 155 - letter.vx * 16) * dt;
      letter.vy += ((targetY - letter.y) * 155 - letter.vy * 16) * dt;
      letter.x += letter.vx * dt; letter.y += letter.vy * dt;
      letter.element.style.transform = `translate3d(${letter.x.toFixed(2)}px,${letter.y.toFixed(2)}px,0) rotate(${(letter.x * .14).toFixed(2)}deg)`;
      if (active && Math.abs(dx) < 35 && Math.abs(dy) < 48) overText = true;
    }
    hero.classList.toggle('over-text', overText);
    if (button) {
      const dx = px - button.x - copyX, dy = py - button.y - copyY;
      const near = active && Math.abs(dx) < button.width * .7 && Math.abs(dy) < button.height * 1.3;
      buttonX += ((near ? dx * .2 : 0) - buttonX) * ease;
      buttonY += ((near ? dy * .28 : 0) - buttonY) * ease;
      cta.style.setProperty('--magnet-x', `${buttonX.toFixed(2)}px`);
      cta.style.setProperty('--magnet-y', `${buttonY.toFixed(2)}px`);
    }
    if (cursor && active) {
      cursor.style.left = `${px - rect.left}px`;
      cursor.style.top = `${py - rect.top}px`;
    }
    frame = requestAnimationFrame(animate);
  }
  if (!reduced) frame = requestAnimationFrame(animate);
}

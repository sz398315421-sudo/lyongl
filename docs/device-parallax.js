// One sensor subscription in the host; renderers keep their existing damping.
(() => {
  const coarse = matchMedia('(pointer:coarse)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const Sensor = window.DeviceOrientationEvent;
  const Motion = window.DeviceMotionEvent;
  const NativeGravity = window.Accelerometer;
  const state = { x: 0, y: 0, active: false };
  window.portfolioMotion = state;
  if (!(Sensor || Motion || NativeGravity) || !window.isSecureContext || !coarse.matches) return;

  const root = document.documentElement;
  const button = document.createElement('button');
  button.type = 'button';button.className = 'motion-toggle';
  button.setAttribute('aria-pressed', 'false');
  const shell = document.querySelector('#site-shell');
  const welcome = document.querySelector('#welcome');
  const permissionAPIs = [Sensor, Motion].filter(api => typeof api?.requestPermission === 'function');
  let enabled = permissionAPIs.length === 0;
  let userChoice = false;
  let listening = false, pending = false, baseline = null, wasAvailable = false, wasWelcoming = false;
  let feedback = '', feedbackTimer;
  let signalTimer, noSignal = false, gravity = null, lastOrientation = -Infinity;
  let nativeTimer, accelerometer;
  const now = () => window.performance?.now() ?? Date.now();
  const available = () => coarse.matches && !reduced.matches && !document.hidden &&
    ['home', 'about', 'explore'].includes(root.dataset.page) &&
    !['locked', 'diving', 'ascending', 'descending', 'studio-travel'].some(name => document.body.classList.contains(name));
  const publish = (x = 0, y = 0, active = false, source = null) => {
    const connected = active !== state.active;
    Object.assign(state, { x, y, active, source });
    if (active) { clearTimeout(signalTimer);noSignal = false; }
    if (connected) updateButton();
    document.dispatchEvent(new CustomEvent('portfolio:tilt', { detail: { ...state } }));
  };
  function reset() { baseline = null;gravity = null;lastOrientation = -Infinity;publish(); }
  const angle = () => window.screen?.orientation?.angle ?? window.orientation ?? 0;
  const delta = (value, origin) => ((value - origin + 540) % 360) - 180;
  const normalize = (value, range) => Math.sign(value) * Math.min(1, Math.max(0, Math.abs(value) - .6) / range);
  function sample(beta, gamma, source) {
    const rotation = angle();
    if (!baseline || baseline.rotation !== rotation || baseline.source !== source) baseline = { beta, gamma, rotation, source };
    const radians = rotation * Math.PI / 180;
    const x = delta(gamma, baseline.gamma), y = delta(beta, baseline.beta);
    publish(normalize(x * Math.cos(radians) + y * Math.sin(radians), 22),
      normalize(y * Math.cos(radians) - x * Math.sin(radians), 26), true, source);
  }
  function orient(event) {
    if (!available() || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    lastOrientation = now();
    accelerometer?.stop();accelerometer = null;
    sample(event.beta, event.gamma, 'orientation');
  }
  function motion(event) {
    if (!available() || now() - lastOrientation < 750) return;
    const value = event.accelerationIncludingGravity;
    if (!value || ![value.x, value.y, value.z].every(Number.isFinite)) return;
    const magnitude = Math.hypot(value.x, value.y, value.z);
    if (magnitude < 5 || magnitude > 15) return;
    if (!gravity) gravity = { x: value.x, y: value.y, z: value.z };
    else for (const axis of ['x', 'y', 'z']) gravity[axis] += (value[axis] - gravity[axis]) * .2;
    sample(Math.atan2(gravity.y, gravity.z) * 180 / Math.PI,
      Math.atan2(-gravity.x, Math.hypot(gravity.y, gravity.z)) * 180 / Math.PI, 'gravity');
  }
  function updateButton() {
    button.disabled = pending;
    button.textContent = feedback || (pending ? '正在开启…' : !enabled ? '开启重力感应' : state.active ? '倾斜手机 · 感应已连接' : noSignal ? '未收到感应 · 点击重试' : '正在连接感应…');
    button.dataset.sensorState = !enabled ? 'off' : state.active ? 'connected' : noSignal ? 'unavailable' : 'waiting';
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled && (!noSignal || state.active) ? '关闭重力感应' : '连接重力感应，倾斜手机让眼睛和场景跟随移动');
    button.title = noSignal ? '尚未收到传感器数据；可重试，或在手机浏览器中允许本网站使用运动传感器。' : '';
  }
  function watchSignal() {
    clearTimeout(signalTimer);clearTimeout(nativeTimer);noSignal = false;
    accelerometer?.stop();accelerometer = null;
    if (listening && NativeGravity) nativeTimer = setTimeout(() => {
      if (!listening || state.active) return;
      try {
        accelerometer = new NativeGravity({ frequency: 30 });
        accelerometer.addEventListener('reading', () => {
          if (accelerometer) motion({ accelerationIncludingGravity: accelerometer });
        });
        accelerometer.addEventListener('error', () => { accelerometer?.stop();accelerometer = null; });
        accelerometer.start();
      } catch { accelerometer = null; }
    }, 1000);
    if (listening) signalTimer = setTimeout(() => {
      if (listening && !state.active) { noSignal = true;updateButton(); }
    }, 4000);
  }
  function recalibrate() { reset();watchSignal(); }
  function sync() {
    const usable = available();
    const welcoming = document.body.classList.contains('intro-pending');
    const container = welcoming ? welcome : shell;
    if (button.parentElement !== container) container.append(button);
    button.dataset.welcome = String(welcoming);
    button.hidden = !usable;
    const shouldListen = enabled && usable;
    if (shouldListen !== listening) {
      listening = shouldListen;
      if (listening) {
        if (Sensor) window.addEventListener('deviceorientation', orient, { passive: true });
        if (Motion) window.addEventListener('devicemotion', motion, { passive: true });
      } else {
        window.removeEventListener('deviceorientation', orient);
        window.removeEventListener('devicemotion', motion);
      }
      reset();watchSignal();
    } else if (usable !== wasAvailable || welcoming !== wasWelcoming) { reset();watchSignal(); }
    wasAvailable = usable;
    wasWelcoming = welcoming;
    updateButton();
  }
  button.addEventListener('click', async () => {
    if (pending) return;
    userChoice = true;
    feedback = '';clearTimeout(feedbackTimer);
    if (enabled && !noSignal) { enabled = false;sync();return; }
    if (enabled) { enabled = false;sync(); }
    pending = true;
    try {
      // Safari requires this call directly within the user's click gesture.
      const permission = permissionAPIs.map(api => api.requestPermission());
      sync();enabled = !permission.length || (await Promise.allSettled(permission)).some(result => result.status === 'fulfilled' && result.value === 'granted');
      if (!enabled) feedback = '未获授权 · 点击重试';
    } catch { feedback = '暂不可用 · 点击重试'; }
    finally {
      pending = false;sync();
      if (feedback) feedbackTimer = setTimeout(() => { feedback = '';sync(); }, 3500);
    }
  });
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-page'] });
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('portfolio:content', () => { recalibrate();sync(); });
  window.addEventListener('orientationchange', recalibrate, { passive: true });
  window.screen?.orientation?.addEventListener('change', recalibrate);
  reduced.addEventListener('change', sync);coarse.addEventListener('change', sync);
  sync();
  // Some Android browsers expose requestPermission() even when motion sensors
  // already have site permission. Start from that actual permission state.
  const permissions = window.navigator?.permissions;
  if (!enabled && permissions?.query) permissions.query({ name: 'accelerometer' }).then(result => {
    if (result.state === 'granted' && !userChoice) { enabled = true;sync(); }
  }).catch(() => {});
})();

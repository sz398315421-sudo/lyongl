const welcome = document.querySelector('#welcome');
const shell = document.querySelector('#site-shell');
const enterButton = document.querySelector('#enter-world');
const mutedButton = document.querySelector('#enter-muted');
const soundButton = document.querySelector('#sound-toggle');
const motionReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let entered = false, soundEnabled = false, soundRequested = false, audioContext, master;
let musicTimer, suspendTimer, soundRevision = 0, analyser, nextBar = 0, barIndex = 0;
const audioSamples = new Float32Array(256);

function waitForHero() {
  const host = document.querySelector('#world');
  if (document.documentElement.dataset.page !== 'home' || ['ready','fallback'].includes(host.dataset.sceneState)) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => {clearTimeout(timeout);document.removeEventListener('portfolio:scene-settled', finish);resolve();};
    document.addEventListener('portfolio:scene-settled', finish, {once:true});
    const timeout = setTimeout(() => {
      // Allow entry without cancelling a slow scene download. The host accepts
      // a later ready message and restores the interactive courtyard.
      host.dataset.sceneState = 'fallback';
      document.querySelector('.hero').classList.add('scene-fallback');
      document.dispatchEvent(new Event('portfolio:scene-fallback'));
      finish();
    }, 20000);
  });
}

async function prepareWelcome() {
  // Preload immediately behind the welcome screen, before any Enter click.
  welcome.setAttribute('aria-busy','true');
  enterButton.disabled = mutedButton.disabled = true;
  const loader = welcome.querySelector('.welcome-loader');
  const track=loader.querySelector('[role="progressbar"]');
  const copy=loader.querySelector('.welcome-load-copy');
  const percent=loader.querySelector('.welcome-load-percent');
  const update=()=>{
    const host=document.querySelector('#world');
    const value=Number(host.dataset.sceneProgress)||0;
    loader.dataset.progressKnown=String(value>0);
    track.setAttribute('aria-valuenow',String(value));loader.style.setProperty('--load-progress',value+'%');
    percent.textContent=Math.round(value)+'%';
    copy.textContent=host.dataset.scenePhase==='render'?'正在生成场景…':'正在加载场景…';
  };
  document.addEventListener('portfolio:scene-progress',update);update();
  await waitForHero();
  document.removeEventListener('portfolio:scene-progress',update);
  loader.dataset.progressKnown='true';loader.style.setProperty('--load-progress','100%');track.setAttribute('aria-valuenow','100');percent.textContent='100%';
  copy.textContent=document.querySelector('#world').dataset.sceneState==='ready'?'动态场景已就绪':'静态首页已就绪';
  welcome.removeAttribute('aria-busy');welcome.dataset.sceneReady = '';
  enterButton.disabled = mutedButton.disabled = false;
  if (document.activeElement === document.body || welcome.contains(document.activeElement)) enterButton.focus({preventScroll:true});
}

// A quiet original score, generated locally after the visitor enables audio.
// Schedule against the audio clock so scene rendering cannot interrupt notes.
const musicBars = [
  {chord:[48,55,59,64],melody:[76,79,83,79]},
  {chord:[45,52,55,60],melody:[76,72,79,76]},
  {chord:[41,48,52,57],melody:[77,76,72,69]},
  {chord:[43,50,52,59],melody:[71,74,79,74]},
];
function playTone(note, start, length, volume, attack = .04) {
  const oscillator = audioContext.createOscillator(), envelope = audioContext.createGain();
  oscillator.type = 'sine'; oscillator.frequency.value = 440 * 2 ** ((note - 69) / 12);
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(volume, start + attack);
  if (attack > .5) envelope.gain.linearRampToValueAtTime(volume * .72, start + length * .7);
  envelope.gain.exponentialRampToValueAtTime(.0001, start + length);
  oscillator.connect(envelope); envelope.connect(master);
  oscillator.onended = () => {oscillator.disconnect(); envelope.disconnect();};
  oscillator.start(start); oscillator.stop(start + length + .05);
}
function scheduleMusic() {
  if (audioContext.state !== 'running') return;
  while (nextBar < audioContext.currentTime) {nextBar += 8; barIndex++;}
  // Keep two bars buffered, including during a busy WebGL transition.
  while (nextBar < audioContext.currentTime + 16) {
    const bar = musicBars[barIndex++ % musicBars.length];
    bar.chord.forEach((note, i) => playTone(note, nextBar + i * .08, 8.8, .034, 1.1));
    bar.melody.forEach((note, i) => playTone(note, nextBar + .4 + i * 2, 3.6, .065));
    nextBar += 8;
  }
  analyser.getFloatTimeDomainData(audioSamples);
  const level = Math.sqrt(audioSamples.reduce((sum, value) => sum + value * value, 0) / audioSamples.length);
  soundButton.dataset.audioLevel = level.toFixed(4);
}
function syncSoundButton() {
  soundEnabled = soundRequested && audioContext?.state === 'running' && !document.hidden;
  soundButton.classList.toggle('is-playing', soundEnabled);
  soundButton.setAttribute('aria-pressed', String(soundEnabled));
  const label = soundEnabled ? '关闭背景音乐' : '开启背景音乐';
  soundButton.setAttribute('aria-label', label); soundButton.title = label;
  soundButton.dataset.audioState = audioContext?.state || 'off';
  if (!soundEnabled) soundButton.dataset.audioLevel = '0';
}
function createAmbience() {
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  if (!AudioEngine) return false;
  audioContext = new AudioEngine();
  master = audioContext.createGain(); master.gain.value = 0;
  const filter = audioContext.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 2600;
  analyser = audioContext.createAnalyser(); analyser.fftSize = audioSamples.length;
  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -18; compressor.ratio.value = 3;
  master.connect(filter); filter.connect(analyser); analyser.connect(compressor); compressor.connect(audioContext.destination);
  nextBar = audioContext.currentTime + .05; barIndex = 0;
  audioContext.addEventListener('statechange', () => {
    syncSoundButton();
    if (soundRequested && audioContext.state === 'running') scheduleMusic();
  });
  clearInterval(musicTimer); musicTimer = setInterval(scheduleMusic, 750);
  return true;
}
async function setSound(enabled) {
  soundRequested = enabled; const revision = ++soundRevision;
  clearTimeout(suspendTimer);
  try {
    if (enabled && (!audioContext || audioContext.state === 'closed') && !createAmbience()) throw new Error('Web Audio unavailable');
    if (enabled && audioContext.state !== 'running') await audioContext.resume();
    if (revision !== soundRevision) return;
    if (master) {
      master.gain.cancelScheduledValues(audioContext.currentTime);
      master.gain.setTargetAtTime(enabled ? .6 : 0, audioContext.currentTime, enabled ? .4 : .08);
    }
    if (enabled) scheduleMusic();
    else if (audioContext) suspendTimer = setTimeout(() => {
      if (!soundRequested) audioContext.suspend().catch(() => {});
    }, 650);
    syncSoundButton();
  } catch {
    if (revision !== soundRevision) return;
    soundRequested = false; syncSoundButton();
    soundButton.title = '音乐尚未启动，点击重试';
  }
}
function enterWorld(withSound, animate = true) {
  if (entered) return;
  if (document.documentElement.dataset.page === 'home' && !['ready','fallback'].includes(document.querySelector('#world').dataset.sceneState)) return;
  entered = true;
  setSound(withSound);
  shell.inert = false;
  document.body.classList.remove('intro-pending');
  welcome.classList.add('leaving'); welcome.inert = true;
  // Preserve shared project and section links instead of forcing them to the hero.
  if (!location.hash || location.hash === '#home') document.querySelector('.primary-cta').focus({ preventScroll: true });
  if (!animate || motionReduced) welcome.hidden = true;
  else setTimeout(() => { welcome.hidden = true; }, 800);
}
enterButton.addEventListener('click', () => enterWorld(true));
mutedButton.addEventListener('click', () => enterWorld(false));
soundButton.addEventListener('click', () => setSound(!soundEnabled));
function moveWelcomeEyes(x, y) {
  welcome.style.setProperty('--eye-x', `${x}px`);
  welcome.style.setProperty('--eye-y', `${y}px`);
  for (const pupil of welcome.querySelectorAll('.eye-pupil')) pupil.style.transform = `translate(${x}px, ${y}px)`;
}
document.addEventListener('portfolio:tilt', event => {
  if (motionReduced || entered || welcome.hidden) return;
  const {x, y, active} = event.detail;
  moveWelcomeEyes(active ? x * 12 : 0, active ? y * 14 : 0);
});
welcome.addEventListener('pointermove', event => {
  if (motionReduced || event.pointerType === 'touch' || window.portfolioMotion?.active) return;
  const eyes = welcome.querySelector('svg').getBoundingClientRect();
  const page=welcome.getBoundingClientRect();
  const cx=eyes.left+eyes.width/2,cy=eyes.top+eyes.height/2;
  const dx=event.clientX-cx,dy=event.clientY-cy;
  // Normalize against the available space on each side, so the top edge always
  // reaches the upward limit even in a short window. The pupils start below
  // the eye centers, leaving substantially more room above than below.
  const nx=Math.max(-1,Math.min(1,dx/Math.max(1,dx<0?cx-page.left:page.right-cx)));
  const ny=Math.max(-1,Math.min(1,dy/Math.max(1,dy<0?cy-page.top:page.bottom-cy)));
  const radius=Math.max(1,Math.hypot(nx,ny));
  const x=nx/radius*(nx<0?12:9);
  const y=ny/radius*(ny<0?20:7);
  moveWelcomeEyes(x, y);
});
welcome.addEventListener('pointerleave', () => {
  if (window.portfolioMotion?.active) return;
  moveWelcomeEyes(0, 0);
});
welcome.addEventListener('keydown', event => {
  if (event.key === 'Escape') enterWorld(false);
  if (event.key !== 'Tab') return;
  const controls = [...welcome.querySelectorAll('button:not([disabled])')].filter(button => !button.hidden && getComputedStyle(button).visibility !== 'hidden');
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
});
document.addEventListener('visibilitychange', () => {
  if (!audioContext) return;
  if (document.hidden) audioContext.suspend().catch(() => {});
  else if (soundRequested) setSound(true);
  syncSoundButton();
});
window.portfolioWelcomeInitialized=true;
if (document.documentElement.hasAttribute('data-skip-welcome')||welcome.hidden||!document.body.classList.contains('intro-pending')) enterWorld(false, false);
else { shell.inert = true; prepareWelcome().catch(error=>{
  console.warn('Welcome uses the static homepage.',error);
  document.querySelector('#world').dataset.sceneState='fallback';document.querySelector('.hero').classList.add('scene-fallback');
  document.dispatchEvent(new Event('portfolio:scene-fallback'));welcome.dataset.sceneReady='';
  welcome.removeAttribute('aria-busy');enterButton.disabled=mutedButton.disabled=false;
}); }

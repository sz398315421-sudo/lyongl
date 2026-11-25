import {readFile, writeFile} from 'node:fs/promises';

const [source, output] = process.argv.slice(2);
if (!source || !output) throw Error('Usage: node prepare-hud-u-turn.mjs <motion.json> <u-turn-motion.json>');
const motion = JSON.parse(await readFile(source, 'utf8'));
const firstFrame = 175;
const lastFrame = 394;
const formation = motion.frames.slice(firstFrame, lastFrame + 1);
const [startX, startY, startZ] = formation[0][0].p;
const baseDepth = -startZ;
const view = Math.tan(Math.PI / 10);
const kernel = [1, 3, 6, 8, 6, 3, 1];
const weightSum = kernel.reduce((total, weight) => total + weight, 0);
const round = values => values.map(value => Number(value.toFixed(6)));

// Use the active maneuver from the existing Blender reconstruction. Fit the
// camera-normalized motion to the HUD preview and smooth sampling jitter.
const frames = formation.map((frame, frameIndex) => frame.map((arrow, arrowIndex) => {
  const position = [0, 0, 0];
  const rotation = [0, 0, 0, 0];
  kernel.forEach((weight, index) => {
    const neighbor = formation[Math.max(0, Math.min(formation.length - 1, frameIndex + index - 3))][arrowIndex];
    const hemisphere = neighbor.q.reduce((sum, value, component) => sum + value * arrow.q[component], 0) < 0 ? -1 : 1;
    neighbor.p.forEach((value, component) => { position[component] += weight * value / weightSum; });
    neighbor.q.forEach((value, component) => { rotation[component] += hemisphere * weight * value / weightSum; });
  });
  const depth = -position[2];
  const x = .497 + (position[0] / depth - startX / baseDepth) / (2 * view * 16 / 9);
  const y = .520 - (position[1] / depth - startY / baseDepth) * 1.25 / (2 * view);
  const length = Math.hypot(...rotation);
  return round([x, y, depth * 13.21 / baseDepth, ...rotation.map(value => value / length), arrow.s[0]]);
}));

await writeFile(output, JSON.stringify({fps: motion.fps, frames, farAnchor: frames[101].at(-1).slice(0, 2)}));

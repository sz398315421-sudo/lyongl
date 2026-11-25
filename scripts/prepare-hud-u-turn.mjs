import {readFile, writeFile} from 'node:fs/promises';

const [source, output] = process.argv.slice(2);
if (!source || !output) throw Error('Usage: node prepare-hud-u-turn.mjs <motion.json> <u-turn-motion.json>');
const motion = JSON.parse(await readFile(source, 'utf8'));
const depthScale = 13.21 / -motion.frames[0][0].p[2];
const sourceView = Math.tan(motion.camera.horizontalFov / 2) * motion.height / motion.width;
const modelScale = depthScale * Math.tan(Math.PI / 10) / sourceView;
const round = values => values.map(value => Number(value.toFixed(6)));

// The Blender reconstruction has its camera at the origin and facing -Z.
// Preserve every pose and visibility key, converting only the projection.
const frames = motion.frames.map(frame => frame.map(({p, q, s}) => {
  const depth = -p[2];
  const span = 2 * depth * sourceView;
  const x = .5 + p[0] / (span * 16 / 9);
  const y = .5 - p[1] / span;
  const length = Math.hypot(...q);
  return round([x, y, depth * depthScale, ...q.map(value => value / length), s[0]]);
}));

await writeFile(output, JSON.stringify({
  fps: motion.fps,
  modelScale,
  frames,
  startAnchor: frames[0][0].slice(0, 2),
  farAnchor: frames[275].at(-1).slice(0, 2)
}));

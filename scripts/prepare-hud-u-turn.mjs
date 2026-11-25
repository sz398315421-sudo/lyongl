import {readFile, writeFile} from 'node:fs/promises';
import {referenceAspect, uTurnTiming} from '../docs/adas-hud/ar-arrow-motion.mjs';

const [source, output] = process.argv.slice(2);
if (!source || !output) throw Error('Usage: node prepare-hud-u-turn.mjs <motion.json> <u-turn-motion.json>');
const motion = JSON.parse(await readFile(source, 'utf8'));
const {frames: sourceFrames, fps} = motion;
const {durationMs, extend, turn, peak, straightAgain, retract, singleAgain} = uTurnTiming;
const firstTurnFrame = 170;
const lastTurnFrame = 385;
const depthScale = 13.21 / -sourceFrames[0][0].p[2];
const sourceView = Math.tan(motion.camera.horizontalFov / 2) * motion.height / motion.width;
const modelScale = depthScale * Math.tan(Math.PI / 10) / sourceView;

function ease(progress) {
  const t = Math.max(0, Math.min(1, progress));
  return t * t * t * (10 + t * (6 * t - 15));
}

function mixPose(from, to, progress) {
  const dot = from.slice(3, 7).reduce((sum, value, index) => sum + value * to[index + 3], 0);
  const pose = from.map((value, index) => {
    const target = dot < 0 && index >= 3 && index < 7 ? -to[index] : to[index];
    return value + (target - value) * progress;
  });
  const length = Math.hypot(...pose.slice(3, 7));
  for (let index = 3; index < 7; index++) pose[index] /= length;
  return pose;
}

// Convert the camera-relative Blender poses to the HUD's projection. The
// middle excerpt contains the maneuver itself, with all five arrows present.
const poses = sourceFrames.slice(firstTurnFrame, lastTurnFrame + 1).map(frame => frame.map(({p, q}) => {
  const depth = -p[2];
  const span = 2 * depth * sourceView;
  return [.5 + p[0] / (span * referenceAspect), .5 - p[1] / span, depth * depthScale, ...q, 1];
}));
const [startingX, startingY] = poses[0][0];
const straightRotation = poses[0][0].slice(3, 7);
// Open up the straight row so the folded silhouettes remain separate.
const straight = poses[0].map(([, y, depth]) => [
  startingX, startingY + (y - startingY) * 1.5, depth, ...straightRotation, 1
]);

function straightFormation(elapsed) {
  // Use the same staggered motion in reverse to retract from far to near.
  const time = elapsed >= retract ? extend + singleAgain - elapsed : elapsed;
  const formation = [straight[0]];
  for (let index = 1; index < straight.length; index++) {
    const start = extend + (index - 1) * 240;
    const spread = ease((time - start) / 680);
    const pose = mixPose(formation[index - 1], straight[index], spread);
    pose[7] = ease((spread - .18) / .68);
    formation.push(pose);
  }
  return formation;
}

function turnFormation(elapsed) {
  const frame = (elapsed - turn) / (straightAgain - turn) * (poses.length - 1);
  const index = Math.floor(frame);
  const next = poses[Math.min(index + 1, poses.length - 1)];
  // Ease into and out of the original turn to meet the authored straight line.
  const weight = ease((elapsed - turn) / 840) * ease((straightAgain - elapsed) / 920);
  const formation = poses[index].map((pose, arrow) =>
    mixPose(straight[arrow], mixPose(pose, next[arrow], frame - index), weight));
  // Keep vertical separation while the arrows turn into or out of the narrow
  // part of the curve. The reference already has room at its widest point.
  const [lead] = formation;
  const horizontalSpan = Math.abs(lead[0] - formation.at(-1)[0]);
  const spacing = (1 - ease((horizontalSpan - .04) / .105)) * weight;
  return formation.map((pose, arrow) => {
    const straightGap = straight[0][1] - straight[arrow][1];
    const spacedY = lead[1] - straightGap * 1.35;
    pose[1] += Math.min(0, spacedY - pose[1]) * spacing;
    return pose;
  });
}

const frames = Array.from({length: Math.round(durationMs * fps / 1000) + 1}, (_, index) => {
  const elapsed = index * 1000 / fps;
  const formation = elapsed > turn && elapsed < straightAgain ? turnFormation(elapsed) : straightFormation(elapsed);
  return formation.map(pose => pose.map(value => Number(value.toFixed(6))));
});
const farthest = frames[Math.round(peak * fps / 1000)].at(-1);
await writeFile(output, JSON.stringify({
  fps,
  modelScale,
  frames,
  startAnchor: frames[0][0].slice(0, 2),
  farAnchor: farthest.slice(0, 2)
}));

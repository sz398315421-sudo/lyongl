export function easeLaneMotion(fraction) {
  const t = Math.min(1, Math.max(0, fraction));
  return t * t * (3 - 2 * t);
}

function drawLane(context, project, gradient, side, shift, curve, color) {
  const farX = side * 59 + shift * 19;
  const lateral = side * 187 + shift * 53;
  const bend = curve * 92;
  const leftEdge = [];
  const rightEdge = [];
  const segments = curve ? 24 : 1;
  for (let segment = 0; segment <= segments; segment++) {
    const fraction = segment / segments;
    const depth = 1 - fraction;
    // Lead into the corner at the far end, keeping the near edge under the car.
    const x = farX + lateral * fraction + bend * depth * depth;
    const y = -85 + 170 * fraction;
    const tangentX = lateral - 2 * bend * depth;
    const width = (.6 + 3.1 * fraction) / Math.hypot(tangentX, 170);
    const offsetX = -170 * width;
    const offsetY = tangentX * width;
    leftEdge.push([x + offsetX, y + offsetY]);
    rightEdge.push([x - offsetX, y - offsetY]);
  }
  const outline = project([...leftEdge, ...rightEdge.reverse()]);
  if (outline.length < 3) return;

  const line = context.createLinearGradient(...gradient[0], ...gradient[1]);
  line.addColorStop(0, color + '00');
  line.addColorStop(.27, color + 'e8');
  line.addColorStop(.66, color + 'ff');
  line.addColorStop(.86, color + '5c');
  line.addColorStop(1, color + '00');
  context.fillStyle = line;
  context.beginPath();
  context.moveTo(...outline[0]);
  for (const point of outline.slice(1)) context.lineTo(...point);
  context.closePath();
  context.fill();
}

export function renderLanes(context, view, {key, shift, curve}, colors, transparent = false) {
  const {width, height} = context.canvas;
  if (transparent) context.clearRect(0, 0, width, height);
  else {
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
  }
  const scale = Math.min(width / 700, height / 330);
  const projected = view.project([[0, -85], [0, 85]]);
  const first = projected[0];
  const last = projected.findLast(point => Math.hypot(point[0] - first[0], point[1] - first[1]) > .01);
  const gradient = last ? [first, last] : [[0, -85], [0, 85]];
  context.save();
  context.translate(width / 2, height / 2);
  context.scale(scale, scale);
  const regular = key === 'lcc' ? colors.lcc : colors.recognition;
  drawLane(context, view.project, gradient, -1, shift, curve, key === 'left' ? colors.warning : regular);
  drawLane(context, view.project, gradient, 1, shift, curve, key === 'right' ? colors.warning : regular);
  context.restore();
}

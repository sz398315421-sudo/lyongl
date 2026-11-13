import {laneWidth} from '../adas/road-assist.js';

export function startLayout(id, laneCount) {
  if (id === '02' || id === '09') {
    if (laneCount === 3) return {key: 'road', count: 3, first: -laneWidth, defaultLane: 1, min: -45, max: 130};
    return {key: 'road', count: (laneCount || (id === '09' ? 2 : 6)) / 2, first: .5 * laneWidth, defaultLane: 0, min: -45, max: 130};
  }
  if (['03', '06', '07'].includes(id)) {
    return {key: id === '03' ? 'elevated' : 'ramp', count: 3, first: -laneWidth, defaultLane: 1, min: -45, max: id === '03' ? 130 : 55};
  }
  if (['05', '08'].includes(id)) return {key: 'junction', min: -45, max: 30};
  if (['10', '14', '16', '17', '18', '19'].includes(id)) return {key: 'parking', min: -12, max: 10};
  return null;
}

export function hasStartOverride(world, id) {
  return Boolean(world.hudSettings?.starts[startLayout(id)?.key]);
}

export function resetStartPose(world, id, laneCount) {
  if (['05', '08'].includes(id)) return;
  world.car.position.x = ['02', '09', '13'].includes(id) && laneCount !== 3 ? .5 * laneWidth : 0;
  world.car.position.z = 0;
}

export function applyStartPose(world, id, options) {
  const layout = startLayout(id, options.laneCount);
  const start = world.hudSettings?.starts[layout?.key];
  if (!start || layout.key === 'junction' && options.junctionPosition !== 'approaching') return;
  const {car, camera, cameraAim} = world;
  const dx = layout.count && start.lane !== null ? layout.first + Math.min(start.lane, layout.count - 1) * laneWidth - car.position.x : 0;
  const dz = -Math.min(layout.max, Math.max(layout.min, start.distance));
  car.position.x += dx;
  car.position.z += dz;
  camera.position.x += dx;
  camera.position.z += dz;
  cameraAim.x += dx;
  cameraAim.z += dz;
}

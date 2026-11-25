export const carpetView = Object.freeze({yaw: 0, pitch: 12, distance: 8, fov: 36, ahead: 12});

export function hudCameraPose({yaw, pitch, distance, ahead}) {
  const azimuth = yaw * Math.PI / 180;
  const elevation = pitch * Math.PI / 180;
  const radius = distance * Math.cos(elevation);
  return {
    position: [radius * Math.sin(azimuth), distance * Math.sin(elevation) + .85, radius * Math.cos(azimuth)],
    target: [0, .85, -ahead]
  };
}

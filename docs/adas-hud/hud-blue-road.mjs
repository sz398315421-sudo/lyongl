import {laneWidth} from '../adas/road-assist.js';
import {createHudClayTruck} from './hud-clay-truck.mjs';
import {carpetView} from './hud-camera-view.mjs';

export const blueRoadColor = '#01cff3';

export const blueRoadPreset = {
  view: {yaw: 0, pitch: 20, distance: 15, fov: 37, ahead: 5},
  guide: {width: 2.4, length: 70, gradient: true, far: '#082b32'},
  color: blueRoadColor
};

export const carpetPreset = {
  view: carpetView,
  guide: {width: 2.9, length: 43, gradient: true, far: '#063038'},
  color: blueRoadColor
};

export const waveguideView = {yaw: 0, pitch: 20, distance: 21, fov: 36, ahead: 9};

export function createBlueRoadTraffic() {
  const truck = createHudClayTruck();
  truck.position.set(-laneWidth, .02, -27);
  return truck;
}

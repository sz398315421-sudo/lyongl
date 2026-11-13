import {CylinderGeometry, Group, Mesh, MeshStandardMaterial} from 'three';
import {RoundedBoxGeometry} from '../adas/RoundedBoxGeometry.js';
import {laneWidth} from '../adas/road-assist.js';

export const blueRoadColor = '#01cff3';

export const blueRoadPreset = {
  view: {yaw: 0, pitch: 20, distance: 15, fov: 37, ahead: 5},
  guide: {width: 2.4, length: 70, gradient: true, far: '#082b32'},
  color: blueRoadColor
};

export const carpetPreset = {
  view: {yaw: 0, pitch: 12, distance: 8, fov: 36, ahead: 12},
  guide: {width: 2.9, length: 43, gradient: true, far: '#063038'},
  color: blueRoadColor
};

export function createBlueRoadTraffic() {
  const material = color => new MeshStandardMaterial({color, roughness: .68});
  const cargo = material('#a0a9b8');
  const cab = material('#717f93');
  const glass = material('#233246');
  const bumper = material('#424b58');
  const tire = material('#15191e');
  const box = (size, surface, x, y, z) => {
    const mesh = new Mesh(new RoundedBoxGeometry(...size, 2, .07), surface);
    mesh.position.set(x, y, z);
    return mesh;
  };
  const truck = new Group();
  truck.name = 'HUD stationary left-lane vehicle';
  truck.add(
    box([2.32, 2.02, 4.03], cargo, 0, 1.88, .52),
    box([2.15, 1.47, 1.53], cab, 0, 1.19, -2.15),
    box([1.83, .46, .07], glass, 0, 1.66, -2.91),
    box([2.08, .4, 5.35], bumper, 0, .59, -.14),
    box([2.19, .18, .2], bumper, 0, .59, 2.63)
  );
  const wheel = new CylinderGeometry(.39, .39, .27, 16);
  for (const x of [-1.02, 1.02]) for (const z of [-1.98, 1.59]) {
    const mesh = new Mesh(wheel, tire);
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set(x, .39, z);
    truck.add(mesh);
  }
  truck.position.set(-laneWidth, .02, -27);
  return truck;
}

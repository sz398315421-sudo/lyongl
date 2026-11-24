import {CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape} from 'three';
import {RoundedBoxGeometry} from '../adas/RoundedBoxGeometry.js';

function sideProfile(shape, width, bevel) {
  // Draw the profile facing left in world space, with depth across the truck.
  const geometry = new ExtrudeGeometry(shape, {
    depth: width, steps: 1, curveSegments: 10,
    bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3
  });
  geometry.translate(0, 0, -width / 2).rotateY(Math.PI / 2);
  return geometry;
}

export function createHudClayTruck() {
  const truck = new Group();
  truck.name = 'HUD stationary left-lane vehicle';
  const matte = color => new MeshStandardMaterial({color, roughness: .85, metalness: 0});
  const body = matte('#c8d0d6');
  const panel = matte('#bec8cf');
  const glazing = matte('#bac6ce');
  const chassis = matte('#7f8992');
  const tires = matte('#89939b');
  const hubs = matte('#aab6bf');

  function add(geometry, material, x, y, z) {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    truck.add(mesh);
    return mesh;
  }
  function box(width, height, depth, bevel, material, x, y, z) {
    return add(new RoundedBoxGeometry(width, height, depth, 2, bevel), material, x, y, z);
  }

  const frontAxle = 2.02;
  const cab = new Shape();
  cab.moveTo(1.09, .60);
  cab.quadraticCurveTo(1.14, .50, 1.30, .50);
  cab.lineTo(frontAxle - .48, .50);
  cab.absarc(frontAxle, .50, .48, Math.PI, 0, true);
  cab.lineTo(2.82, .50);
  cab.quadraticCurveTo(3.04, .50, 3.04, .72);
  cab.lineTo(3.04, 1.26);
  cab.quadraticCurveTo(3.04, 1.45, 2.97, 1.57);
  cab.lineTo(2.76, 2.13);
  cab.quadraticCurveTo(2.66, 2.30, 2.45, 2.31);
  cab.lineTo(1.37, 2.31);
  cab.quadraticCurveTo(1.09, 2.30, 1.09, 2.02);
  cab.closePath();
  add(sideProfile(cab, 1.99, .065), body, 0, 0, 0);
  box(1.83, .61, .095, .04, glazing, 0, 1.77, -2.963).rotation.x = .37;
  box(1.78, .15, .105, .04, panel, 0, .60, -3.045);

  const sideWindow = new Shape();
  sideWindow.moveTo(1.64, 1.49);
  sideWindow.quadraticCurveTo(1.56, 1.49, 1.56, 1.57);
  sideWindow.lineTo(1.56, 2.04);
  sideWindow.quadraticCurveTo(1.56, 2.15, 1.67, 2.15);
  sideWindow.lineTo(2.52, 2.15);
  sideWindow.quadraticCurveTo(2.60, 2.15, 2.64, 2.05);
  sideWindow.lineTo(2.83, 1.55);
  sideWindow.quadraticCurveTo(2.86, 1.49, 2.78, 1.49);
  sideWindow.closePath();
  const windowGeometry = sideProfile(sideWindow, .025, .012);

  box(1.51, .32, 4.62, .075, chassis, 0, .53, -.19);
  box(2.30, 2.02, 4.05, .12, body, 0, 1.89, .56);
  const rearDoor = new RoundedBoxGeometry(1.065, 1.82, .085, 2, .04);
  const tire = new CylinderGeometry(.385, .385, .25, 24).rotateZ(Math.PI / 2);
  const hub = new CylinderGeometry(.244, .244, .035, 24).rotateZ(Math.PI / 2);
  const hubCenter = new CylinderGeometry(.082, .082, .046, 16).rotateZ(Math.PI / 2);

  for (const side of [-1, 1]) {
    add(windowGeometry, glazing, side * 1.06, 0, 0);
    box(.24, .06, .08, .025, panel, side * 1.09, 1.62, -2.71);
    box(.105, .24, .15, .045, body, side * 1.22, 1.68, -2.71);
    box(.23, .115, .08, .025, panel, side * .78, .67, -3.07);
    add(rearDoor, panel, side * .55, 1.89, 2.579);
    box(.045, .31, .065, .017, hubs, side * .16, 1.28, 2.641);
    box(.305, .115, .085, .027, hubs, side * .86, .648, 2.598);

    for (const z of [-frontAxle, 1.65]) {
      add(tire, tires, side * .89, .385, z);
      add(hub, hubs, side * 1.01, .385, z);
      add(hubCenter, panel, side * 1.03, .385, z);
    }
  }

  box(2.13, .16, .19, .052, panel, 0, .53, 2.549);
  return truck;
}

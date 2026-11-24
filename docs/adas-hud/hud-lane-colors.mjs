import {Color, DoubleSide, Mesh, ShaderMaterial} from 'three';
import {laneWidth} from '../adas/road-assist.js';

export function hudLaneLayout(world) {
  const {id, laneCount} = world.state ?? {};
  if (id === '02' || id === '09') {
    const count = laneCount || (id === '09' ? 2 : 6);
    const turn = world.roadGuidePath?.rightTurn;
    const firstX = turn && count === 3 ? 0 : -count * laneWidth / 2;
    return {key: `${id}:${count}`, count, firstX, gap: 0, crossingZ: turn?.centerZ, crossingWidth: turn?.width};
  }
  if (id === '05' || id === '08') {
    const threeLanes = id === '05' && world.hudSettings?.junction?.threeLanes;
    return {key: `${id}:${threeLanes ? 3 : 6}`, count: threeLanes ? 3 : 6, firstX: threeLanes ? 0 : -3 * laneWidth, gap: 0, crossingZ: -40, crossingWidth: 6 * laneWidth};
  }
  if (world.dividedRoad && ['03', '06', '07'].includes(id)) {
    const {oppositeCenter, lanesPerDirection, medianWidth} = world.dividedRoad;
    const count = lanesPerDirection * 2;
    return {key: `${id}:${count}`, count, firstX: oppositeCenter - lanesPerDirection * laneWidth / 2, gap: medianWidth};
  }
  return null;
}

export function createLaneColors(world) {
  const colors = Array.from({length: 6}, () => new Color());
  const enabled = Array(6).fill(0);
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: {
      colors: {value: colors}, enabled: {value: enabled}, laneCount: {value: 0},
      firstX: {value: 0}, median: {value: 0}, laneWidth: {value: laneWidth},
      crossingZ: {value: 0}, crossingWidth: {value: 0}, layoutBlend: world.layoutBlend, roadMatrix: {value: null}
    },
    vertexShader: `
      attribute vec3 layoutOffset;
      uniform float layoutBlend;
      uniform mat4 roadMatrix;
      varying vec2 roadPoint;
      varying float viewDistance;
      void main() {
        vec4 point = vec4(position + layoutOffset * (1.0 - layoutBlend), 1.0);
        roadPoint = (roadMatrix * point).xz;
        vec4 viewPoint = modelViewMatrix * point;
        viewDistance = -viewPoint.z;
        gl_Position = projectionMatrix * viewPoint;
      }`,
    fragmentShader: `
      uniform vec3 colors[6];
      uniform float enabled[6];
      uniform float laneCount, firstX, median, laneWidth;
      uniform float crossingZ, crossingWidth;
      varying vec2 roadPoint;
      varying float viewDistance;
      void main() {
        if (abs(roadPoint.y - crossingZ) < crossingWidth * 0.5) discard;
        float x = roadPoint.x - firstX;
        float halfWidth = laneCount * laneWidth * 0.5;
        if (x >= halfWidth && x < halfWidth + median) discard;
        if (x >= halfWidth + median) x -= median;
        float lane = x / laneWidth;
        if (lane < 0.0 || lane >= laneCount) discard;
        int i = int(floor(lane));
        float edge = smoothstep(0.0, 0.045, min(fract(lane), 1.0 - fract(lane)));
        float fade = 1.0 - smoothstep(52.0, 138.0, viewDistance);
        gl_FragColor = vec4(colors[i], enabled[i] * edge * fade);
      }`
  });
  material.defaultAttributeValues.layoutOffset = [0, 0, 0];
  const overlays = new WeakMap();

  return function drawLanes(layout, selections, opacity, draw) {
    if (!layout) return draw();
    let anyColor = false;
    for (let i = 0; i < enabled.length; i++) {
      const key = `${layout.key}:${i}`;
      const color = i < layout.count && selections[key];
      enabled[i] = color ? (opacity[key] ?? 38) / 100 : 0;
      if (color) { colors[i].set(color); anyColor = true; }
    }
    if (!anyColor) return draw();

    material.uniforms.laneCount.value = layout.count;
    material.uniforms.firstX.value = layout.firstX;
    material.uniforms.median.value = layout.gap;
    material.uniforms.crossingZ.value = layout.crossingZ ?? 0;
    material.uniforms.crossingWidth.value = layout.crossingWidth ?? 0;
    const {root} = world;
    const surfaces = root.children.filter(object => object.isMesh && object.visible && object.material === world.mat.road);
    const activeMeshes = surfaces.map(surface => {
      let mesh = overlays.get(surface);
      if (!mesh) {
        mesh = new Mesh(surface.geometry, material);
        mesh.renderOrder = -1;
        mesh.userData.hudLaneColor = true;
        mesh.onBeforeRender = () => {
          material.uniforms.roadMatrix.value = mesh.matrix;
          material.uniformsNeedUpdate = true;
        };
        overlays.set(surface, mesh);
      }
      mesh.position.copy(surface.position);
      mesh.quaternion.copy(surface.quaternion);
      mesh.scale.copy(surface.scale);
      mesh.updateMatrix();
      root.add(mesh);
      return mesh;
    });
    try { return draw(); }
    finally { activeMeshes.forEach(mesh => mesh.removeFromParent()); }
  };
}

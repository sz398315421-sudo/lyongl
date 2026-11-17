import * as pc from 'playcanvas';
import type { TrackDefinition } from '../../shared/types';
import { findNearestTrackAngle, sampleTrack } from '../../game-core/track';
import { buildKart, type KartVisualEffects, type KartVisualOptions } from './kart-model';
import { PaperWorkshop, PAPER_COLORS, type PaperColor } from './paper';
import { buildScenery } from './scenery';
import {
  buildRoadSamples,
  buildRoadStripGeometry,
  TRACK_VISUAL_LAYOUT,
} from './track-layout';

export interface KartSceneObject {
  kart: pc.Entity;
  body: pc.Entity;
  wheels: pc.Entity[];
  frontWheels: pc.Entity[];
  sparks: pc.Entity[];
  effects: KartVisualEffects;
  avatarMaterial: pc.StandardMaterial;
  avatarFaceCount: number;
}

export interface SceneObjects {
  kart: pc.Entity;
  body: pc.Entity;
  wheels: pc.Entity[];
  frontWheels: pc.Entity[];
  sparks: pc.Entity[];
  camera: pc.Entity;
  gates: pc.Entity[];
  racers: KartSceneObject[];
  itemBoxes: pc.Entity[];
  glueTraps: pc.Entity[];
  setPlayerAvatar: (source: string) => void;
  setRacerAvatar: (index: number, source: string, label?: string) => void;
  dispose: () => void;
}

function rotateY(entity: pc.Entity, radians: number) {
  entity.setEulerAngles(0, radians * pc.math.RAD_TO_DEG, 0);
  return entity;
}

export function buildScene(app: pc.AppBase, track: TrackDefinition): SceneObjects {
  const paper = new PaperWorkshop(app);
  const root = new pc.Entity('Paper diorama');
  app.root.addChild(root);

  const roadSamples = buildRoadSamples(track);

  const roadStrip = (name: string, inner: number, outer: number, y: number, color: PaperColor) => {
    const geometry = buildRoadStripGeometry(roadSamples, inner, outer, y);
    const entity = paper.mesh(name, geometry.positions, geometry.indices, paper.palette[color], root);
    entity.render!.castShadows = false;
    return entity;
  };

  const roadTile = (
    name: string,
    angle: number,
    offset: number,
    width: number,
    length: number,
    height: number,
    color: PaperColor,
  ) => {
    const point = sampleTrack(track, angle, offset);
    const tile = paper.box(name, [point.x, height, point.z], [width, 0.07, length], color, root);
    rotateY(tile, point.heading);
    tile.render!.castShadows = false;
    return tile;
  };

  // A layered paper base makes the level read like a small tabletop diorama.
  paper.box('Kraftboard bottom', [0, -1.15, 0], [TRACK_VISUAL_LAYOUT.trayWidth, 1.85, TRACK_VISUAL_LAYOUT.trayDepth], 'edge', root);
  paper.box('White cut paper edge', [0, -0.16, 0], [TRACK_VISUAL_LAYOUT.trayWidth - 2, 0.18, TRACK_VISUAL_LAYOUT.trayDepth - 2], 'white', root);
  paper.box('Painted meadow sheet', [0, -0.03, 0], [TRACK_VISUAL_LAYOUT.meadowWidth, 0.1, TRACK_VISUAL_LAYOUT.meadowDepth], 'grass', root);
  paper.box('Meadow inset shadow', [0, 0.035, 0], [TRACK_VISUAL_LAYOUT.meadowWidth - 4, 0.035, TRACK_VISUAL_LAYOUT.meadowDepth - 4], 'mint', root);

  // The visible raceway is deliberately narrower than the forgiving collision
  // lane. It reads as a cut paper road with a white border and warm paper
  // shoulders, while the extra gameplay width remains an invisible run-off.
  const roadHalfWidth = TRACK_VISUAL_LAYOUT.roadHalfWidth;
  roadStrip('White paper road cutout', -TRACK_VISUAL_LAYOUT.cutoutHalfWidth, TRACK_VISUAL_LAYOUT.cutoutHalfWidth, 0.08, 'white');
  roadStrip('Inner paper shoulder', -TRACK_VISUAL_LAYOUT.shoulderOuter, -TRACK_VISUAL_LAYOUT.shoulderInner, 0.105, 'peach');
  roadStrip('Outer paper shoulder', TRACK_VISUAL_LAYOUT.shoulderInner, TRACK_VISUAL_LAYOUT.shoulderOuter, 0.105, 'peach');
  roadStrip('Blue painted road', -roadHalfWidth, roadHalfWidth, 0.13, 'road');

  // Handmade tile details follow the same centerline, so corners remain
  // crisp, readable and free of overlapping ribbon seams.
  for (let index = 0; index < roadSamples.length; index += 8) {
    const sample = roadSamples[index];
    roadTile('Road center paper dash', sample.angle, 0, 0.14, 2.4, 0.19, index % 16 === 0 ? 'white' : 'sky');
  }
  for (let index = 0; index < 128; index++) {
    const angle = (index + 0.5) / 128 * Math.PI * 2;
    const color = index % 2 === 0 ? 'coral' : 'white';
    roadTile('Outer paper curb tile', angle, roadHalfWidth + 0.24, 0.46, 2.35, 0.2, color);
    roadTile('Inner paper curb tile', angle, -roadHalfWidth - 0.24, 0.46, 2.35, 0.2, color);
  }

  const startLine = sampleTrack(track, 0);
  // A broad checker line is easier to read from the chase camera than a thin texture.
  for (let index = 0; index < 10; index++) {
    roadTile('Start finish checker', 0, index - 4.5, 0.95, 1.3, 0.2, index % 2 ? 'ink' : 'white');
  }

  // Guardrails share the exact wall segments used by the simple collision solver.
  for (const wall of track.walls) {
    const dx = wall.b.x - wall.a.x;
    const dz = wall.b.z - wall.a.z;
    const length = Math.hypot(dx, dz);
    const x = (wall.a.x + wall.b.x) / 2;
    const z = (wall.a.z + wall.b.z) / 2;
    const rail = paper.box('White folded guardrail', [x, 0.62, z], [0.24, 0.82, length], 'white', root);
    rotateY(rail, Math.atan2(dx, dz));
    const stripe = paper.box('Painted rail stripe', [x, 0.69, z], [0.28, 0.13, Math.max(0.45, length * 0.72)], 'coral', root);
    rotateY(stripe, Math.atan2(dx, dz));
  }

  for (const obstacle of track.obstacles) {
    const angle = findNearestTrackAngle(track, obstacle);
    const group = new pc.Entity('Roadside cardboard crate');
    group.setPosition(obstacle.x, 0, obstacle.z);
    rotateY(group, sampleTrack(track, angle).heading);
    root.addChild(group);
    paper.box('Cardboard road crate', [0, 0.72, 0], [obstacle.halfX * 2, 1.42, obstacle.halfZ * 2], 'peach', group);
    paper.box('Crate white tape', [0, 1.44, 0], [0.22, 0.055, obstacle.halfZ * 2 + 0.05], 'white', group);
    paper.box('Crate colored tape', [0, 1.45, 0], [obstacle.halfX * 2 + 0.05, 0.06, 0.2], 'coral', group);
  }

  const itemBoxes = track.itemBoxes.map((item, index) => {
    const group = new pc.Entity('Folded item box ' + index);
    group.setPosition(item.x, 0, item.z);
    rotateY(group, item.heading);
    root.addChild(group);
    paper.box('Item box paper cube', [0, 0.72, 0], [0.95, 0.95, 0.95], index % 2 ? 'blue' : 'gold', group);
    paper.box('Item box white band', [0, 0.73, 0], [1.02, 0.16, 0.2], 'white', group);
    return group;
  });

  const glueTraps = Array.from({ length: 8 }, (_, index) => {
    const trap = new pc.Entity('Paper glue trap ' + index);
    root.addChild(trap);
    const cutout = paper.card(
      'Glue puddle white cutout ' + index,
      [[-1.18, -0.48], [0.82, -0.58], [1.16, -0.03], [0.72, 0.46], [-0.44, 0.58], [-1.12, 0.24]],
      'white',
      trap,
      0.08,
      0.08,
    );
    cutout.setLocalEulerAngles(90, 0, 0);
    cutout.setLocalPosition(0, 0.01, 0);
    const puddle = paper.card(
      'Glue puddle mint paper ' + index,
      [[-1.02, -0.36], [0.72, -0.45], [0.98, -0.01], [0.58, 0.34], [-0.38, 0.44], [-0.94, 0.16]],
      'mint',
      trap,
      0.06,
      0.035,
    );
    puddle.setLocalEulerAngles(90, 0, 0);
    puddle.setLocalPosition(0, 0.04, 0);
    const shine = paper.card('Glue puddle gold shine ' + index, [[-0.48, -0.04], [0.02, -0.16], [0.35, -0.02], [0.06, 0.1]], 'gold', trap, 0.04, 0.025);
    shine.setLocalEulerAngles(90, 0, 0);
    shine.setLocalPosition(-0.12, 0.09, -0.12);
    for (const [x, z, rotation] of [[-0.72, 0.62, -12], [0.34, 0.58, 10], [0.86, -0.3, 18]] as const) {
      const drip = paper.card('Glue warning drop ' + index, [[-0.14, -0.05], [0.15, -0.05], [0.09, 0.28], [-0.06, 0.23]], 'coral', trap, 0.04, 0.025);
      drip.setLocalEulerAngles(90, 0, rotation);
      drip.setLocalPosition(x, 0.08, z);
    }
    trap.enabled = false;
    return trap;
  });

  buildScenery(paper, root, track);

  // The complete gate uses the same local road frame as the finish line.
  const startGate = new pc.Entity('Folded start gate');
  startGate.setPosition(startLine.x, 0, startLine.z);
  rotateY(startGate, startLine.heading);
  root.addChild(startGate);
  for (const side of [-1, 1]) {
    paper.box('Start gate post', [side * TRACK_VISUAL_LAYOUT.checkpointOffset, 3.2, 0], [0.28, 6.4, 0.28], 'white', startGate);
  }
  paper.box('Start gate cardboard beam', [0, 5.9, 0], [TRACK_VISUAL_LAYOUT.checkpointOffset * 2 + 0.7, 0.52, 0.22], 'coral', startGate);
  const banner = paper.label('PAPER KART', 7.5, 0.58, startGate, 'coral', 'white');
  // The player approaches from -Z, so the readable label sits on the near paper face.
  banner.setLocalPosition(0, 5.9, -0.15);
  banner.setLocalEulerAngles(0, 180, 0);
  for (let i = 0; i < 14; i++) {
    const pennant = paper.box('Banner paper fold', [-6.5 + i, 5.25, 0], [0.58, 0.56, 0.2], i % 2 ? 'white' : 'gold', startGate);
    pennant.setLocalEulerAngles(0, 0, i % 2 ? -8 : 8);
  }

  const gates = track.checkpoints.map((checkpoint, index) => {
    const marker = new pc.Entity('Paper checkpoint ' + index);
    marker.setPosition(checkpoint.x, 0.08, checkpoint.z);
    rotateY(marker, checkpoint.heading);
    root.addChild(marker);
    const roadsideOffset = TRACK_VISUAL_LAYOUT.checkpointOffset;
    for (const side of [-1, 1]) {
      // Checkpoints are physical roadside flags; nothing floats across the racing line.
      paper.box('Checkpoint roadside foot', [side * roadsideOffset, 0.08, 0], [0.85, 0.12, 0.58], 'white', marker);
      const post = paper.box('Checkpoint folded post', [side * roadsideOffset, 1.05, 0], [0.18, 2.1, 0.18], 'edge', marker);
      post.setLocalEulerAngles(0, 0, side * 3);
      const flag = paper.card('Checkpoint flag', [[-0.76, 0], [0.76, 0], [0.64, 0.86], [-0.58, 0.98]], index % 2 ? 'gold' : 'coral', marker, 0.12, 0.1);
      flag.setLocalPosition(side * roadsideOffset, 1.88, 0);
      flag.setLocalEulerAngles(0, side < 0 ? 180 : 0, 0);
      paper.stroke([[-0.48, 0.48], [0.04, 0.7], [0.4, 0.32]], flag, 0.08, 'white', 0.05);
    }
    marker.enabled = false;
    return marker;
  });

  const kartSpecs: KartVisualOptions[] = [
    { bodyColor: 'coral', accentColor: 'gold', number: '01', avatarSource: 'default', avatarFallback: 'gold', avatarLabel: 'P' },
    { bodyColor: 'blue', accentColor: 'white', number: '02', avatarSource: 'ai:熊', avatarFallback: 'gold', avatarLabel: '熊' },
    { bodyColor: 'mint', accentColor: 'peach', number: '03', avatarSource: 'ai:墨', avatarFallback: 'blue', avatarLabel: '墨' },
    { bodyColor: 'gold', accentColor: 'coral', number: '04', avatarSource: 'ai:兔', avatarFallback: 'white', avatarLabel: '兔' },
    { bodyColor: 'peach', accentColor: 'mint', number: '05', avatarSource: 'ai:邮', avatarFallback: 'coral', avatarLabel: '邮' },
    { bodyColor: 'pine', accentColor: 'gold', number: '06', avatarSource: 'ai:猫', avatarFallback: 'white', avatarLabel: '猫' },
  ];
  const racers = kartSpecs.map(spec => buildKart(paper, root, spec));
  racers.slice(1).forEach(racer => { racer.kart.enabled = false; });
  const kartModel = racers[0];

  const light = new pc.Entity('Warm afternoon light');
  light.addComponent('light', {
    type: 'directional',
    color: new pc.Color(1, 0.94, 0.82),
    intensity: 1.05,
    castShadows: true,
    shadowResolution: 1024,
    shadowDistance: 170,
    shadowBias: 0.18,
    normalOffsetBias: 0.06,
  });
  light.setEulerAngles(48, -35, 0);
  root.addChild(light);
  app.scene.ambientLight = new pc.Color(0.58, 0.64, 0.58);

  const camera = new pc.Entity('Follow camera');
  camera.addComponent('camera', {
    clearColor: new pc.Color().fromString(PAPER_COLORS.sky),
    fov: 56,
    nearClip: 0.4,
    farClip: 350,
  });
  root.addChild(camera);

  return {
    kart: kartModel.kart,
    body: kartModel.body,
    wheels: kartModel.wheels,
    frontWheels: kartModel.frontWheels,
    sparks: kartModel.sparks,
    camera,
    gates,
    racers,
    itemBoxes,
    glueTraps,
    setPlayerAvatar: source => paper.applyImage(kartModel.avatarMaterial, source || 'default', 'gold', 'P'),
    setRacerAvatar: (index, source, label = 'P') => {
      const racer = racers[index];
      const spec = kartSpecs[index];
      if (!racer || !spec) return;
      paper.applyImage(racer.avatarMaterial, source || 'default', spec.avatarFallback ?? 'gold', label.slice(0, 1) || 'P');
    },
    dispose: () => {
      root.destroy();
      paper.dispose();
    },
  };
}

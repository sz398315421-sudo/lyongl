import * as pc from 'playcanvas';
import type { ItemKind } from '../../shared/types';
import { PaperWorkshop, roundCutout, type PaperColor, type Point } from './paper';

export interface KartVisualOptions {
  bodyColor?: PaperColor;
  accentColor?: PaperColor;
  number?: string;
  avatarSource?: string;
  avatarFallback?: PaperColor;
  avatarLabel?: string;
}

export interface KartVisualEffects {
  itemIndicators: Record<ItemKind, pc.Entity>;
  shield: pc.Entity;
  rocket: pc.Entity;
  planeBurst: pc.Entity;
}

const SHIELD_POINTS: Point[] = [
  [0, -1.05], [0.76, -0.72], [1.05, 0], [0.76, 0.72],
  [0, 1.05], [-0.76, 0.72], [-1.05, 0], [-0.76, -0.72],
];

const SHIELD_INNER_POINTS: Point[] = [
  [0, -0.82], [0.58, -0.55], [0.8, 0], [0.58, 0.55],
  [0, 0.82], [-0.58, 0.55], [-0.8, 0], [-0.58, -0.55],
];

const GLUE_ICON_POINTS: Point[] = [
  [-0.76, -0.18], [-0.54, 0.25], [-0.12, 0.48], [0.34, 0.42],
  [0.73, 0.12], [0.58, -0.27], [0.06, -0.43], [-0.52, -0.32],
];

function createIndicator(
  paper: PaperWorkshop,
  kart: pc.Entity,
  name: string,
  color: PaperColor,
  points: readonly Point[],
  detail: (group: pc.Entity) => void,
) {
  const group = new pc.Entity(name);
  group.setLocalPosition(0, 2.62, 0.18);
  group.enabled = false;
  kart.addChild(group);
  const badge = paper.card(name + ' badge', points, color, group, 0.08, 0.08);
  badge.setLocalPosition(0, 0, 0);
  detail(group);
  return group;
}

export function buildKart(paper: PaperWorkshop, root: pc.Entity, options: KartVisualOptions = {}) {
  const bodyColor = options.bodyColor ?? 'coral';
  const accentColor = options.accentColor ?? 'gold';
  const kart = new pc.Entity('Player paper kart'); root.addChild(kart);

  const paperPlaneIndicator = createIndicator(
    paper,
    kart,
    'Held paper plane indicator',
    'coral',
    [[-0.7, -0.24], [0.96, 0.03], [-0.06, 0.2], [-0.34, 0.68]],
    group => {
      paper.stroke([[-0.4, -0.12], [0.12, 0.12], [0.72, 0.08]], group, 0.06, 'white', 0.06);
      paper.stroke([[-0.06, 0.2], [-0.34, 0.68]], group, 0.055, 'white', 0.05);
    },
  );
  const glueIndicator = createIndicator(paper, kart, 'Held glue indicator', 'mint', GLUE_ICON_POINTS, group => {
    for (const [x, y, size] of [[-0.38, -0.52, 0.16], [0.04, -0.58, 0.2], [0.42, -0.45, 0.13]] as const) {
      const drip = paper.card('Glue drop', roundCutout(size, 0, 10), 'gold', group, 0.045, 0.025);
      drip.setLocalPosition(x, y, -0.06);
    }
    paper.stroke([[-0.45, 0.12], [0.1, 0.25], [0.46, 0.05]], group, 0.06, 'white', 0.06);
  });
  const shieldIndicator = createIndicator(paper, kart, 'Held cardboard shield indicator', 'gold', SHIELD_POINTS, group => {
    const inner = paper.card('Shield blue center', SHIELD_INNER_POINTS, 'blue', group, 0.045, 0.035);
    inner.setLocalPosition(0, 0, -0.07);
    paper.stroke([[-0.42, 0], [0, 0.38], [0.42, 0]], group, 0.05, 'white', 0.075);
    paper.stroke([[-0.38, -0.18], [0, -0.52], [0.38, -0.18]], group, 0.045, 'white', 0.055);
  });
  const rocketIndicator = createIndicator(
    paper,
    kart,
    'Held rocket boost indicator',
    'coral',
    [[-0.28, -0.62], [0.28, -0.62], [0.48, 0.03], [0.2, 0.58], [-0.2, 0.58], [-0.48, 0.03]],
    group => {
      const nose = paper.card('Rocket gold nose', [[-0.2, 0.24], [0.2, 0.24], [0, 0.62]], 'gold', group, 0.045, 0.03);
      nose.setLocalPosition(0, 0, -0.07);
      const flame = paper.card('Rocket paper flame', [[-0.16, -0.25], [0.16, -0.25], [0.05, -0.72], [0, -0.5], [-0.05, -0.72]], 'gold', group, 0.045, 0.03);
      flame.setLocalPosition(0, 0, -0.08);
      paper.stroke([[-0.24, 0], [0.24, 0]], group, 0.05, 'white', 0.055);
    },
  );

  const shield = new pc.Entity('Active cardboard shield aura');
  shield.enabled = false;
  kart.addChild(shield);
  const shieldOuter = paper.card('Shield white cut edge', SHIELD_POINTS, 'white', shield, 0.1, 0.06);
  shieldOuter.setLocalPosition(0, 1.32, 0.32);
  const shieldFace = paper.card('Shield blue paper face', SHIELD_INNER_POINTS, 'blue', shield, 0.065, 0.035);
  shieldFace.setLocalPosition(0, 1.32, 0.21);
  const shieldCross = new pc.Entity('Shield hand-drawn cross');
  shieldCross.setLocalPosition(0, 1.32, 0.13);
  shield.addChild(shieldCross);
  paper.stroke([[-0.48, 0], [0, 0.45], [0.48, 0]], shieldCross, 0, 'white', 0.08);
  const shieldFlag = paper.card('Shield protection flag', [[-0.36, -0.14], [0.36, -0.14], [0.25, 0.18], [-0.22, 0.2]], 'gold', shield, 0.045, 0.035);
  shieldFlag.setLocalPosition(0, 1.02, 0.18);

  const rocket = new pc.Entity('Active rocket boost exhaust');
  rocket.enabled = false;
  kart.addChild(rocket);
  for (const x of [-0.53, 0.53]) {
    const outerFlame = paper.card('Rocket white paper flame', [[-0.22, 0.35], [0.22, 0.35], [0.12, -0.12], [0, -1.05], [-0.12, -0.12]], 'white', rocket, 0.07, 0.045);
    outerFlame.setLocalPosition(x, 0.43, -1.43);
    const flame = paper.card('Rocket coral flame', [[-0.14, 0.27], [0.14, 0.27], [0.08, -0.16], [0, -0.76], [-0.08, -0.16]], 'coral', rocket, 0.045, 0.03);
    flame.setLocalPosition(x, 0.43, -1.5);
    const hot = paper.card('Rocket gold core', [[-0.08, 0.18], [0.08, 0.18], [0, -0.5]], 'gold', rocket, 0.035, 0.02);
    hot.setLocalPosition(x, 0.43, -1.55);
  }
  for (const [x, y, width] of [[-1.02, 0.9, 0.38], [1.02, 0.72, 0.32], [-0.82, 1.2, 0.24], [0.82, 1.1, 0.26]] as const) {
    const speedLine = paper.box('Rocket speed paper line', [x, y, -1.34], [width, 0.055, 0.06], 'white', rocket);
    speedLine.setLocalEulerAngles(0, 0, x < 0 ? -7 : 7);
    speedLine.render!.castShadows = false;
  }

  const planeBurst = new pc.Entity('Paper plane launch burst');
  planeBurst.enabled = false;
  kart.addChild(planeBurst);
  const burstPlane = paper.card('Paper plane launch card', [[-0.62, -0.18], [1.15, 0.04], [-0.05, 0.26], [-0.34, 0.78]], 'coral', planeBurst, 0.08, 0.07);
  burstPlane.setLocalPosition(0, 1.65, -1.18);
  paper.stroke([[-0.38, -0.1], [0.16, 0.13], [0.86, 0.08]], burstPlane, 0.06, 'white', 0.06);
  const burstSpark = paper.card('Paper plane launch star', [[0, 0.5], [0.1, 0.1], [0.5, 0], [0.1, -0.1], [0, -0.5], [-0.1, -0.1], [-0.5, 0], [-0.1, 0.1]], 'gold', planeBurst, 0.04, 0.035);
  burstSpark.setLocalPosition(-0.86, 1.88, -1.1);

  const body = new pc.Entity('Suspended cardboard body'); kart.addChild(body);
  const chassis: Point[] = [[-0.78, -1.15], [0.78, -1.15], [0.9, -0.7], [0.64, 1.18], [-0.64, 1.18], [-0.9, -0.7]];
  const base = paper.card('Cutout chassis', chassis, bodyColor, body, 0.22, 0.075);
  base.setLocalEulerAngles(-90, 0, 0); base.setLocalPosition(0, 0.43, 0);
  const sideShape: Point[] = [[-1.05, 0.43], [1.05, 0.43], [0.8, 0.95], [-0.35, 0.87], [-0.8, 0.98]];
  for (const x of [-0.7, 0.7]) {
    const side = paper.card('Folded side panel', sideShape, bodyColor, body, 0.1, 0.055);
    side.setLocalPosition(x, 0, 0); side.setLocalEulerAngles(0, 90, 0);
    paper.stroke([[-0.75, 0.59], [0.6, 0.59]], side, 0.07, 'white', 0.055);
  }
  const bonnet = paper.card('Paper bonnet', [[-0.57, -0.4], [0.57, -0.4], [0.5, 0.4], [-0.5, 0.4]], bodyColor, body, 0.06, 0.055);
  bonnet.setLocalPosition(0, 0.87, 0.71); bonnet.setLocalEulerAngles(-83, 0, 0);
  paper.stroke([[0, -0.37], [0.02, 0.36]], bonnet, 0.047, 'white', 0.13);
  paper.box('Rear seat', [0, 0.81, -0.5], [0.75, 0.65, 0.18], 'ink', body);
  const driver = paper.imageCard('Sticker driver helmet', roundCutout(0.45, 0, 18), body, options.avatarSource ?? 'default', options.avatarFallback ?? accentColor, options.avatarLabel ?? 'P', 0.24, 0.045);
  driver.card.setLocalPosition(0, 1.44, -0.15);
  paper.stroke([[-0.24, 0.05], [0.24, 0.05]], driver.card, 0.145, 'ink', 0.10);
  paper.stroke([[-0.15, 0.24], [0.1, 0.3]], driver.card, -0.14, 'white', 0.065);
  const spoiler = paper.card('Folded rear wing', [[-0.95, -0.19], [0.95, -0.19], [0.85, 0.19], [-0.85, 0.19]], accentColor, body, 0.085, 0.06);
  spoiler.setLocalPosition(0, 1, -1.03); spoiler.setLocalEulerAngles(-83, 0, 0);
  for (const x of [-0.55, 0.55]) paper.box('Wing tab', [x, 0.78, -1.02], [0.075, 0.42, 0.16], 'edge', body);
  const number = paper.label(options.number ?? '01', 0.63, 0.34, body);
  number.setLocalPosition(0, 0.68, -1.2); number.setLocalEulerAngles(0, 180, 0);

  const wheels: pc.Entity[] = [], frontWheels: pc.Entity[] = [];
  for (const x of [-0.86, 0.86]) for (const z of [-0.72, 0.76]) {
    const axle = new pc.Entity('Steering wheel pivot'); kart.addChild(axle); axle.setLocalPosition(x, 0.41, z);
    if (z > 0) frontWheels.push(axle);
    const wheel = paper.card('Layered cardboard wheel', roundCutout(0.4, 0, 16), 'ink', axle, 0.28, 0.035);
    wheel.setLocalEulerAngles(0, 90, 0); wheels.push(wheel);
    for (const side of [-1, 1]) {
     const hub = paper.card('Wheel hub sticker', roundCutout(0.15, 0, 8), accentColor, wheel, 0.025, 0.02);
      hub.setLocalPosition(0, 0, side * 0.16);
      paper.stroke([[-0.11, 0], [0.11, 0]], hub, side * 0.03, 'ink', 0.032);
    }
  }
  const sparks = [-0.65, 0.65].map(x => {
    const flame = paper.card('Paper boost ribbon', [[-0.18, 0], [0.18, 0], [0.1, -0.8], [0, -0.5], [-0.08, -1.1]], 'gold', kart, 0.025, 0.045);
    flame.setLocalPosition(x, 0.32, -1.2); flame.setLocalEulerAngles(90, 0, 0); flame.enabled = false;
    return flame;
  });
  return {
    kart,
    body,
    wheels,
    frontWheels,
    sparks,
    effects: {
      itemIndicators: {
        'paper-plane': paperPlaneIndicator,
        glue: glueIndicator,
        'cardboard-shield': shieldIndicator,
        spring: rocketIndicator,
      },
      shield,
      rocket,
      planeBurst,
    },
    avatarMaterial: driver.material,
    avatarFaceCount: driver.faceCount,
  };
}

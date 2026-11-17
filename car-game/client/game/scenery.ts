import * as pc from 'playcanvas';
import type { TrackDefinition } from '../../shared/types';
import { PaperWorkshop, roundCutout, type Point, type PaperColor } from './paper';
import { buildDecorationLayout, type DecorationPlacement } from './track-layout';

const TREE_COLORS: PaperColor[] = ['mint', 'pine', 'grass', 'blue'];
const HOUSE_COLORS: PaperColor[] = ['coral', 'blue', 'gold'];

export function buildScenery(paper: PaperWorkshop, root: pc.Entity, track: TrackDefinition) {
  const tree = (placement: DecorationPlacement) => {
    const height = 4.8 + placement.variant % 4 * 0.52;
    const group = new pc.Entity('Pop-up paper tree');
    group.setPosition(placement.x, 0.03, placement.z);
    group.setEulerAngles(0, placement.rotation * pc.math.RAD_TO_DEG, 0);
    root.addChild(group);
    for (const angle of [0, 90]) {
      const panel = new pc.Entity('Slotted tree panel');
      group.addChild(panel);
      panel.setLocalEulerAngles(0, angle, 0);
      const trunk = paper.card('Drawn trunk', [[-0.2, 0], [0.2, 0], [0.14, height * 0.65], [-0.12, height * 0.65]], 'peach', panel, 0.15, 0.06);
      paper.stroke([[0, 0.1], [0.03, height * 0.55]], trunk, 0.09, 'edge');
      const canopy = roundCutout(height * 0.31, 5, 25).map(([x, y]) => [x, y + height * 0.7] as Point);
      const crown = paper.card('Scissor-cut canopy', canopy, TREE_COLORS[placement.variant % TREE_COLORS.length], panel, 0.14, 0.14);
      paper.stroke([[0, height * 0.43], [0.08, height * 0.77], [-0.1, height * 0.94]], crown, 0.09, 'white', 0.045);
      paper.stroke([[0.04, height * 0.65], [height * 0.17, height * 0.77]], crown, 0.09, 'white', 0.045);
    }
    paper.box('Folded paper foot', [0, 0.04, 0], [0.65, 0.08, 1.1], 'white', group);
  };

  const house = (placement: DecorationPlacement) => {
    const group = new pc.Entity('Folded paper cottage');
    root.addChild(group);
    group.setPosition(placement.x, 0.04, placement.z);
    group.setEulerAngles(0, placement.rotation * pc.math.RAD_TO_DEG, 0);
    const color = HOUSE_COLORS[placement.variant % HOUSE_COLORS.length];
    const silhouette: Point[] = [[-2.4, 0], [2.4, 0], [2.4, 3], [0, 4.8], [-2.4, 3]];
    const front = paper.card('House facade', silhouette, 'peach', group, 0.2, 0.16);
    front.setLocalPosition(0, 0, 1.2);
    const back = paper.card('House back', silhouette, 'peach', group, 0.2, 0.16);
    back.setLocalPosition(0, 0, -1.2);
    paper.box('House side', [-2.25, 1.5, 0], [0.15, 3, 2.4], 'peach', group);
    paper.box('House side', [2.25, 1.5, 0], [0.15, 3, 2.4], 'peach', group);
    for (const side of [-1, 1]) {
      const roofEdge = paper.box('White roof cut edge', [side * 1.25, 3.83, 0], [3.25, 0.34, 2.9], 'white', group);
      roofEdge.setLocalEulerAngles(0, 0, side < 0 ? 35 : -35);
      const roofPaper = paper.box('Colored folded roof', [side * 1.25, 3.83, 0], [3.03, 0.2, 2.72], color, group);
      roofPaper.setLocalEulerAngles(0, 0, side < 0 ? 35 : -35);
    }
    for (const side of [-1, 1]) {
      paper.box('Painted window frame', [side * 1.25, 1.8, 1.33], [0.9, 0.95, 0.04], 'white', group);
      paper.box('Painted window', [side * 1.25, 1.8, 1.37], [0.68, 0.74, 0.025], 'blue', group);
      paper.box('Pencil window mullion', [side * 1.25, 1.8, 1.39], [0.04, 0.72, 0.014], 'ink', group);
    }
    paper.box('Paper door', [0, 0.85, 1.34], [0.75, 1.6, 0.06], color, group);
    paper.stroke([[-2.2, 0.3], [-2, 0.34], [-1.8, 0.28]], group, 1.35, 'edge');
  };

  const pond = (placement: DecorationPlacement) => {
    const water = paper.card('Blue paper pond', roundCutout(4.6, 3, 28), 'blue', root, 0.1, 0.3);
    water.setPosition(placement.x, 0.1, placement.z);
    water.setEulerAngles(-90, placement.rotation * pc.math.RAD_TO_DEG, 0);
    water.setLocalScale(1.3, 0.72, 1);
    paper.stroke([[-2.6, 0], [-1.7, 0.15], [-0.8, 0]], water, 0.07, 'white', 0.09);
    paper.stroke([[0.2, -1.7], [1.1, -1.55], [2, -1.7]], water, 0.07, 'white', 0.09);
  };

  const sign = (placement: DecorationPlacement) => {
    const group = new pc.Entity('Hand-drawn turn sign');
    root.addChild(group);
    group.setPosition(placement.x, 0.07, placement.z);
    group.setEulerAngles(0, placement.rotation * pc.math.RAD_TO_DEG, 0);
    paper.box('Sign folded foot', [0, 0.05, 0], [1.1, 0.1, 0.8], 'white', group);
    paper.box('Sign post', [0, 0.9, 0], [0.15, 1.8, 0.17], 'edge', group);
    const face = paper.card('Arrow board', [[-1.15, 1.5], [1.15, 1.5], [1.15, 2.6], [-1.15, 2.6]], 'coral', group, 0.16, 0.1);
    paper.stroke([[-0.65, 2.05], [0.65, 2.05]], face, 0.1, 'white', 0.1);
    paper.stroke([[0.15, 1.7], [0.65, 2.05], [0.15, 2.4]], face, 0.1, 'white', 0.1);
  };

  const flower = (placement: DecorationPlacement) => {
    const petals = paper.card('Paper daisy', roundCutout(0.5, 6, 24), placement.variant % 2 ? 'gold' : 'coral', root, 0.07, 0.055);
    petals.setPosition(placement.x, 0.95, placement.z);
    petals.setEulerAngles(0, placement.rotation * pc.math.RAD_TO_DEG, 12);
    paper.box('Flower stem', [placement.x, 0.4, placement.z], [0.07, 0.8, 0.07], 'pine', root);
  };

  for (const placement of buildDecorationLayout(track)) {
    if (placement.kind === 'tree') tree(placement);
    else if (placement.kind === 'house') house(placement);
    else if (placement.kind === 'pond') pond(placement);
    else if (placement.kind === 'sign') sign(placement);
    else flower(placement);
  }
}

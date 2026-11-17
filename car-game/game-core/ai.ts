import type { AiDifficulty, ItemKind, KartInput, RacerState, TrackDefinition } from '../shared/types';
import { EMPTY_INPUT, KART } from './config';
import { angleDifference, clamp } from './math';
import { findNearestTrackAngle, sampleTrack } from './track';

export interface AiTuning {
  lookahead: number;
  steeringGain: number;
  throttle: number;
  driftAngle: number;
  lineOffset: number;
}

export const AI_TUNING: Record<AiDifficulty, AiTuning> = {
  easy: { lookahead: 0.19, steeringGain: 3.3, throttle: 0.74, driftAngle: 0.54, lineOffset: -1.45 },
  normal: { lookahead: 0.23, steeringGain: 3.9, throttle: 0.86, driftAngle: 0.42, lineOffset: 1.25 },
  hard: { lookahead: 0.27, steeringGain: 4.5, throttle: 0.96, driftAngle: 0.34, lineOffset: -0.65 },
};

function shouldUseItem(racer: RacerState): boolean {
  if (!racer.item || racer.race.elapsed < 4) return false;
  const currentWindow = Math.floor(racer.race.elapsed / 8);
  const previousWindow = Math.floor(Math.max(0, racer.race.elapsed - KART.fixedDt) / 8);
  return currentWindow !== previousWindow;
}

export function aiInput(racer: RacerState, track: TrackDefinition): KartInput {
  const tuning = AI_TUNING[racer.difficulty ?? 'normal'];
  const currentAngle = findNearestTrackAngle(track, racer.kart);
  const target = sampleTrack(track, currentAngle + tuning.lookahead, tuning.lineOffset);
  const targetHeading = Math.atan2(target.x - racer.kart.x, target.z - racer.kart.z);
  const headingError = angleDifference(targetHeading, racer.kart.heading);
  const cornering = Math.abs(headingError);
  const steer = clamp(-headingError * tuning.steeringGain, -1, 1);
  const throttle = cornering > 0.85 ? tuning.throttle * 0.78 : tuning.throttle;
  const drifting = racer.kart.speed >= KART.driftMinSpeed && cornering > tuning.driftAngle;

  return {
    ...EMPTY_INPUT,
    throttle,
    steer,
    drift: drifting,
    useItem: shouldUseItem(racer),
  };
}

export function aiNames(): string[] {
  return ['纸袋小熊', '蓝墨水', '折角兔', '金色邮差', '剪纸猫'];
}

export function aiDifficulties(): AiDifficulty[] {
  return ['easy', 'normal', 'hard', 'normal', 'hard'];
}

export function aiColors(): string[] {
  return ['#e8755e', '#5baec2', '#e3b849', '#7cae67', '#ad7db8'];
}

export function aiAvatarLabel(index: number): string {
  return ['熊', '墨', '兔', '邮', '猫'][index] ?? 'AI';
}

export function itemLabel(item: ItemKind): string {
  return {
    'paper-plane': '纸飞机',
    glue: '胶水',
    'cardboard-shield': '纸箱护盾',
    spring: '火箭加速',
  }[item];
}

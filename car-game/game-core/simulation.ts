import type { GameState, KartInput, KartState, TrackDefinition } from '../shared/types';
import { EMPTY_INPUT, KART } from './config';
import { clamp, lerp, angleDifference } from './math';
import { distanceFromRoad } from './track';
import { resolveCollisions } from './collision';
import { updateRace } from './race';

export function createKart(track: TrackDefinition): KartState {
  return {
    x: track.spawn.x, z: track.spawn.z, heading: track.spawn.heading,
    steering: 0, yawRate: 0, driftDirection: 0, slipAngle: 0, driftHeld: false,
    velocity: { x: 0, z: 0 }, speed: 0, drifting: false, driftCharge: 0,
    boostRemaining: 0, offTrackTime: 0, resetCount: 0, collisionCount: 0,
  };
}

export function createGame(track: TrackDefinition, phase: 'menu' | 'racing' = 'menu'): GameState {
  return {
    kart: createKart(track),
    race: { phase, completedLaps: 0, totalLaps: 3, nextCheckpoint: 1, lastCheckpoint: -1, elapsed: 0 },
  };
}

export function resetKart(game: GameState, track: TrackDefinition): void {
  const gate = game.race.lastCheckpoint < 0 ? track.spawn : track.checkpoints[game.race.lastCheckpoint];
  const old = game.kart;
  game.kart = {
    ...createKart(track), x: gate.x, z: gate.z, heading: gate.heading,
    resetCount: old.resetCount + 1, collisionCount: old.collisionCount,
  };
}

export function stepGame(
  game: GameState,
  rawInput: KartInput,
  track: TrackDefinition,
  dt = KART.fixedDt,
  speedMultiplier = 1,
): void {
  if (game.race.phase !== 'racing') return;
  if (rawInput.reset) { resetKart(game, track); return; }
  const input = {
    ...EMPTY_INPUT, ...rawInput,
    throttle: clamp(rawInput.throttle, 0, 1),
    brake: clamp(rawInput.brake, 0, 1),
    steer: clamp(rawInput.steer, -1, 1),
  };
  const kart = game.kart;
  const before = { x: kart.x, z: kart.z };
  game.race.elapsed += dt;
  const roadDistance = distanceFromRoad(track, kart);
  const offRoad = roadDistance > track.halfWidth;
  // A kart pressed against a rail can remain technically inside the road
  // ribbon. Count that as a recoverable stuck state after a collision so the
  // player is not trapped by a decorative barrier or roadside crate.
  const nearBarrier = roadDistance > track.halfWidth - 1.0 && kart.collisionCount > 0
    && (input.throttle > 0.1 || input.brake > 0.1);
  kart.offTrackTime = roadDistance > track.halfWidth + track.shoulder || nearBarrier
    ? kart.offTrackTime + dt : 0;
  if (kart.offTrackTime >= KART.respawnDelay) { resetKart(game, track); return; }

  const steeringRate = input.steer === 0 ? KART.steeringReturn : KART.steeringResponse;
  kart.steering = lerp(kart.steering, input.steer, 1 - Math.exp(-steeringRate * dt));
  const wasDrifting = kart.drifting;
  if (input.drift && !kart.driftHeld && Math.abs(input.steer) > 0.15 && kart.speed >= KART.driftMinSpeed && !offRoad) {
    kart.drifting = true;
    kart.driftDirection = Math.sign(input.steer);
  }
  // Lock the drift side until release, so countersteering adjusts the line instead of cancelling the slide.
  if (!input.drift || offRoad || kart.speed < KART.driftMinSpeed * 0.65 || input.brake > 0.5) kart.drifting = false;
  if (wasDrifting && !input.drift && kart.driftCharge >= KART.driftChargeTime && !offRoad && input.brake < 0.5) {
    kart.boostRemaining = KART.boostDuration;
  }
  kart.driftHeld = input.drift;
  if (kart.drifting) kart.driftCharge = Math.min(KART.driftChargeTime, kart.driftCharge + dt);
  else { kart.driftCharge = 0; kart.driftDirection = 0; }
  kart.boostRemaining = Math.max(0, kart.boostRemaining - dt);

  const cap = KART.maxSpeed * (kart.boostRemaining > 0 ? KART.boostMultiplier : 1)
    * (offRoad ? 0.45 : 1) * Math.max(0.25, speedMultiplier);
  const reverseCap = KART.maxReverseSpeed * (offRoad ? 0.45 : 1) * Math.max(0.25, speedMultiplier);
  if (input.brake > 0) kart.boostRemaining = 0;
  if (kart.speed > cap) kart.speed = Math.max(0, kart.speed - Math.max(offRoad ? 30 : 12, input.brake * KART.brakeForce) * dt);
  else if (kart.speed < -reverseCap) kart.speed = Math.min(0, kart.speed + Math.max(12, input.throttle * KART.brakeForce) * dt);
  else if (input.brake > 0) {
    kart.speed = kart.speed > 0
      ? Math.max(0, kart.speed - KART.brakeForce * input.brake * dt)
      : Math.max(-reverseCap, kart.speed - KART.reverseAcceleration * input.brake * dt);
  } else if (input.throttle > 0) {
    // W/↑ releases reverse motion first, then accelerates forward on the next tick.
    if (kart.speed < 0) kart.speed = Math.min(0, kart.speed + KART.brakeForce * input.throttle * dt);
    else {
      const throttleRatio = Math.min(1, kart.speed / cap);
      const force = KART.acceleration * input.throttle * (1 - 0.3 * throttleRatio);
      kart.speed = clamp(kart.speed + (force + (kart.boostRemaining > 0 ? 20 : 0)) * dt, 0, cap);
    }
  } else {
    kart.speed = kart.speed > 0
      ? Math.max(0, kart.speed - KART.coastDrag * dt)
      : Math.min(0, kart.speed + KART.coastDrag * dt);
  }

  const speedRatio = clamp(Math.abs(kart.speed) / KART.maxSpeed, 0, 1);
  const steeringPower = lerp(KART.lowSpeedTurnRate, KART.highSpeedTurnRate, speedRatio);
  // A drift should widen the line slightly, not snap the kart into the barrier.
  // The held side adds a small arcade yaw while counter-steer still has authority.
  const steering = kart.drifting ? kart.driftDirection * 0.2 + kart.steering * 0.62 : kart.steering;
  // Positive yaw is LEFT when a chase camera looks along +Z. Positive steer means RIGHT.
  const travelDirection = kart.speed < -0.05 ? -1 : 1;
  const desiredYaw = -steering * steeringPower * Math.min(1, Math.abs(kart.speed) / 7) * travelDirection;
  kart.yawRate = lerp(kart.yawRate, desiredYaw, 1 - Math.exp(-KART.yawResponse * dt));
  if (Math.abs(kart.speed) < 0.05) kart.yawRate = 0;
  kart.heading += kart.yawRate * dt;
  // The kart's nose points into the turn while its rear slides toward the
  // inside of the bend; this keeps a charged drift usable on the road ribbon.
  const desiredSlip = kart.drifting ? -kart.driftDirection * KART.driftAngle : 0;
  kart.slipAngle = lerp(kart.slipAngle, desiredSlip, 1 - Math.exp(-(kart.drifting ? KART.driftGrip : KART.grip) * dt));
  const desiredHeading = kart.heading + kart.slipAngle;
  const oldHeading = Math.hypot(kart.velocity.x, kart.velocity.z) > 0.05
    ? Math.atan2(kart.velocity.x, kart.velocity.z) : desiredHeading;
  const travelHeading = oldHeading + angleDifference(desiredHeading, oldHeading) * (1 - Math.exp(-KART.grip * dt));
  kart.velocity = { x: Math.sin(travelHeading) * kart.speed, z: Math.cos(travelHeading) * kart.speed };
  kart.x += kart.velocity.x * dt;
  kart.z += kart.velocity.z * dt;
  resolveCollisions(kart, track);
  updateRace(game.race, before, kart, track);
  if (game.race.completedLaps >= game.race.totalLaps) { kart.speed = 0; kart.velocity = { x: 0, z: 0 }; }
}

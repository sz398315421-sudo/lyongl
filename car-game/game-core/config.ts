export const KART = {
  fixedDt: 1 / 60,
  maxSteps: 6,
  radius: 1.05,
  maxSpeed: 28,
  maxReverseSpeed: 9,
  acceleration: 19,
  reverseAcceleration: 13,
  brakeForce: 36,
  coastDrag: 3.8,
  steeringResponse: 9,
  steeringReturn: 12,
  yawResponse: 12,
  lowSpeedTurnRate: 1.65,
  highSpeedTurnRate: 1.42,
  grip: 15,
  driftGrip: 5.5,
  driftAngle: 0.18,
  driftMinSpeed: 8,
  driftChargeTime: 0.8,
  boostDuration: 1.0,
  boostMultiplier: 1.30,
  respawnDelay: 1.25,
} as const;

export const EMPTY_INPUT = {
  throttle: 0, brake: 0, steer: 0, drift: false, reset: false, useItem: false,
};

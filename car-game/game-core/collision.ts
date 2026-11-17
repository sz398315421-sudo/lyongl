import type { KartState, TrackDefinition, Vec2 } from '../shared/types';
import { KART } from './config';
import { clamp, closestOnSegment } from './math';

function pushOut(kart: KartState, contact: Vec2, fallback: Vec2): boolean {
  let dx = kart.x - contact.x, dz = kart.z - contact.z;
  const distance = Math.hypot(dx, dz);
  if (distance >= KART.radius) return false;
  if (distance < 0.00001) { dx = fallback.x; dz = fallback.z; }
  const n = Math.hypot(dx, dz) || 1;
  const nx = dx / n, nz = dz / n;
  kart.x = contact.x + nx * (KART.radius + 0.005);
  kart.z = contact.z + nz * (KART.radius + 0.005);
  const incoming = kart.velocity.x * nx + kart.velocity.z * nz;
  if (incoming < 0) {
    kart.velocity.x -= incoming * nx;
    kart.velocity.z -= incoming * nz;
    kart.velocity.x *= 0.65;
    kart.velocity.z *= 0.65;
  }
  return true;
}

export function resolveCollisions(kart: KartState, track: TrackDefinition): void {
  const directionBeforeCollision = kart.speed < 0 ? -1 : 1;
  let hit = false;
  for (const wall of track.walls) {
    hit = pushOut(kart, closestOnSegment(kart, wall.a, wall.b), {
      x: wall.b.z - wall.a.z, z: wall.a.x - wall.b.x,
    }) || hit;
  }
  for (const box of track.obstacles) {
    const contact = {
      x: clamp(kart.x, box.x - box.halfX, box.x + box.halfX),
      z: clamp(kart.z, box.z - box.halfZ, box.z + box.halfZ),
    };
    // A centre inside a box needs the nearest face, not a zero-length normal.
    if (contact.x === kart.x && contact.z === kart.z) {
      const horizontal = box.halfX - Math.abs(kart.x - box.x);
      const vertical = box.halfZ - Math.abs(kart.z - box.z);
      if (horizontal < vertical) {
        const sign = kart.x >= box.x ? 1 : -1;
        kart.x = box.x + sign * (box.halfX + KART.radius + 0.005);
      } else {
        const sign = kart.z >= box.z ? 1 : -1;
        kart.z = box.z + sign * (box.halfZ + KART.radius + 0.005);
      }
      kart.velocity = { x: 0, z: 0 };
      hit = true;
    } else {
      hit = pushOut(kart, contact, { x: 1, z: 0 }) || hit;
    }
  }
  if (hit) {
    kart.speed = directionBeforeCollision * Math.hypot(kart.velocity.x, kart.velocity.z);
    kart.collisionCount++;
    kart.driftCharge = 0;
  }
}

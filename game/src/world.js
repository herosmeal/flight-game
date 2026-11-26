// The game's rules and state, with no drawing and no browser in it: the aircraft's flight
// model, the seeded terrain (fields, river, hills, runways), the target rings, the three
// missions, fuel, score and the landing and crash rules. step() advances one fixed step and
// returns what happened as bit flags, so the caller can react without the world knowing about
// screens or sound. Nothing here allocates after createWorld returns.

import {
  FIELD,
  KT_TO_MS,
  LANDING,
  MISSIONS,
  PLANE,
  RING,
  SCALE,
  TERRAIN_HALF_WIDTH_M,
} from './config.js';
import { createRandom } from './random.js';

export const EVENT_RING = 1;
export const EVENT_RING_MISSED = 2;
export const EVENT_LANDED = 4;
export const EVENT_CRASHED = 8;
export const EVENT_OVER = 16;
export const EVENT_FUEL_LOW = 32;
export const EVENT_FUEL_EMPTY = 64;

const FIELD_COLORS = ['#5d8a4a', '#6fa055', '#c2a55a', '#b08d57', '#8a6b45', '#4c7440'];
const TWO_PI = Math.PI * 2;

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function wrapAngleDeg(degrees) {
  let wrapped = degrees % 360;
  if (wrapped > 180) wrapped -= 360;
  if (wrapped < -180) wrapped += 360;
  return wrapped;
}

export function createWorld(seed) {
  const plane = {
    x: 0, z: 0, altFt: 0, speedKt: 0, headingDeg: 0,
    bankDeg: 0, pitchDeg: 0, throttle: 0.6, fuel: 100,
    flaps: false, sinkFtPerSec: 0, onGround: true,
  };
  const state = {
    plane,
    missionIndex: 0,
    mission: MISSIONS[0],
    rings: [],
    fields: [],
    hills: [],
    clouds: [],
    river: { baseX: 0, phase1: 0, phase2: 0 },
    runwayStart: { x: 0, z0: -450, z1: 450 },
    runwayEnd: { x: 0, z0: 0, z1: 0 },
    score: 0,
    ringsPassed: 0,
    ringsMissed: 0,
    elapsed: 0,
    status: 'ready',
    crashReason: '',
    fuelLowAnnounced: false,
    landedEarly: false,
    ringFlashText: '',
    ringFlashUntil: 0,
  };

  function generateTerrain(random) {
    const mission = state.mission;
    const courseM = mission.courseM;
    // Patchwork fields: a grid of parcels with seeded crop colours.
    state.fields.length = 0;
    for (let z = -1200; z < courseM + 1800; z += 320) {
      for (let x = -TERRAIN_HALF_WIDTH_M; x < TERRAIN_HALF_WIDTH_M; x += 420) {
        const jitterX = (random() - 0.5) * 60;
        const jitterZ = (random() - 0.5) * 60;
        state.fields.push({
          x: x + jitterX,
          z: z + jitterZ,
          w: 400 + random() * 40,
          h: 300 + random() * 40,
          color: FIELD_COLORS[Math.floor(random() * FIELD_COLORS.length)],
        });
      }
    }
    // The river meanders down the valley beside the course.
    state.river.baseX = -900 + random() * 1800;
    state.river.phase1 = random() * TWO_PI;
    state.river.phase2 = random() * TWO_PI;
    // Hills: seeded bumps the terrain height function sums. They stay clear of both
    // runways, so every takeoff and every landing has flat ground beneath it.
    state.hills.length = 0;
    for (let index = 0; index < mission.hills; index += 1) {
      state.hills.push({
        x: (random() * 2 - 1) * 2100,
        z: 1500 + random() * (courseM - 2700),
        radiusM: 260 + random() * 340,
        heightFt: 350 + random() * mission.hillMaxFt,
      });
    }
    // The destination runway sits a little off the centreline.
    state.runwayEnd.x = (random() * 2 - 1) * 320;
    state.runwayEnd.z0 = courseM - 450;
    state.runwayEnd.z1 = courseM + 450;
    // Rings follow the course at seeded lateral offsets, the last one well short of
    // the runway so there is room to line up and descend for the landing.
    state.rings.length = 0;
    for (let index = 0; index < mission.rings; index += 1) {
      const z = 900 + (index * (courseM - 2900)) / Math.max(1, mission.rings - 1);
      state.rings.push({
        x: (random() * 2 - 1) * 850,
        z,
        radiusM: RING.radiusM,
        altFt: 700 + random() * 500,
        passed: false,
        missed: false,
        score: 0,
      });
    }
    // Clouds drift above the world.
    state.clouds.length = 0;
    for (let index = 0; index < 18; index += 1) {
      state.clouds.push({
        x: (random() * 2 - 1) * 2500,
        z: -600 + random() * (courseM + 1600),
        rxM: 130 + random() * 160,
        ryM: 60 + random() * 70,
        driftMPerSec: 6 + random() * 10,
        alpha: 0.35 + random() * 0.25,
      });
    }
  }

  /** The river's centreline x at a given distance along the course. */
  function riverXAt(z) {
    const river = state.river;
    return river.baseX
      + 320 * Math.sin(z * 0.0004 + river.phase1)
      + 150 * Math.sin(z * 0.0013 + river.phase2);
  }

  /** Terrain height in feet at a world position: the hills' gaussian bumps. */
  function terrainHeightFt(x, z) {
    let height = 0;
    for (let index = 0; index < state.hills.length; index += 1) {
      const hill = state.hills[index];
      const dx = x - hill.x;
      const dz = z - hill.z;
      const distSq = dx * dx + dz * dz;
      const radiusSq = hill.radiusM * hill.radiusM;
      if (distSq < radiusSq * 4) height += hill.heightFt * Math.exp(-distSq / radiusSq);
    }
    return height;
  }

  function onRunway(x, z) {
    const start = state.runwayStart;
    const end = state.runwayEnd;
    if (Math.abs(x - start.x) < 35 && z >= start.z0 && z <= start.z1) return start;
    if (Math.abs(x - end.x) < 35 && z >= end.z0 && z <= end.z1) return end;
    return null;
  }

  function nextRing() {
    for (let index = 0; index < state.rings.length; index += 1) {
      const ring = state.rings[index];
      if (!ring.passed && !ring.missed) return ring;
    }
    return null;
  }

  function reset(missionIndex) {
    state.missionIndex = clamp(missionIndex, 0, MISSIONS.length - 1);
    state.mission = MISSIONS[state.missionIndex];
    generateTerrain(createRandom(seed + state.missionIndex * 7919));
    plane.x = 0;
    plane.z = 0;
    plane.altFt = 0;
    plane.speedKt = 0;
    plane.headingDeg = 0;
    plane.bankDeg = 0;
    plane.pitchDeg = 0;
    plane.throttle = 0.6;
    plane.fuel = state.mission.fuel;
    plane.flaps = false;
    plane.sinkFtPerSec = 0;
    plane.onGround = true;
    state.score = 0;
    state.ringsPassed = 0;
    state.ringsMissed = 0;
    state.elapsed = 0;
    state.status = 'ready';
    state.crashReason = '';
    state.fuelLowAnnounced = false;
    state.landedEarly = false;
  }

  /**
   * One fixed step. `control` is { turn, pitch, throttleDelta, boost, steer } or null for the
   * title backdrop; `harmless` steps the world without scoring, crashing or landing, so the
   * title screen can show the valley alive behind the panel.
   */
  function step(dt, control, harmless) {
    let events = 0;
    if (state.status === 'crashed' || state.status === 'complete' || state.status === 'landed') return events;
    state.elapsed += dt;

    // The title backdrop keeps the aircraft parked on the runway; only the clouds move.
    if (harmless) {
      for (let index = 0; index < state.clouds.length; index += 1) {
        const cloud = state.clouds[index];
        cloud.x += cloud.driftMPerSec * dt;
        if (cloud.x > TERRAIN_HALF_WIDTH_M + 400) cloud.x = -TERRAIN_HALF_WIDTH_M - 400;
      }
      return events;
    }

    const boosting = control !== null && control.boost && plane.fuel > 0 && !plane.onGround;
    const maxSpeedKt = PLANE.cruiseKnots + (boosting ? PLANE.boostKnots : 0)
      - (plane.flaps ? 30 : 0);
    // A landed or finished aircraft rolls to a stop; anything else chases its throttle speed.
    const rollingOut = state.status === 'landed' || state.status === 'complete';
    const targetSpeedKt = rollingOut
      ? 0
      : PLANE.idleKnots + plane.throttle * (maxSpeedKt - PLANE.idleKnots);

    if (control !== null) {
      plane.throttle = clamp(plane.throttle + control.throttleDelta * 0.55 * dt, 0, 1);
      if (control.flaps !== undefined) plane.flaps = control.flaps;
      const targetBank = control.turn * PLANE.maxBankDeg;
      plane.bankDeg += clamp(targetBank - plane.bankDeg, -90 * dt, 90 * dt);
      const targetPitch = control.pitch * PLANE.maxPitchDeg;
      plane.pitchDeg += clamp(targetPitch - plane.pitchDeg, -60 * dt, 60 * dt);
      // A held pointer steers the nose toward the pointer's world position.
      if (control.steer) {
        const dx = control.steer.x - plane.x;
        const dz = control.steer.z - plane.z;
        const wantedHeading = (Math.atan2(dx, dz) * 180) / Math.PI;
        const error = wrapAngleDeg(wantedHeading - plane.headingDeg);
        const wantedBank = clamp(error * 1.2, -PLANE.maxBankDeg, PLANE.maxBankDeg);
        plane.bankDeg += clamp(wantedBank - plane.bankDeg, -90 * dt, 90 * dt);
        const dist = Math.sqrt(dx * dx + dz * dz);
        const wantedPitch = clamp((control.steer.altFt - plane.altFt) / 600, -1, 1) * PLANE.maxPitchDeg;
        if (dist > 200) plane.pitchDeg += clamp(wantedPitch - plane.pitchDeg, -60 * dt, 60 * dt);
      }
    }

    // Turn rate grows with bank and speed; the nose follows the bank.
    const turnRate = (plane.bankDeg / PLANE.maxBankDeg)
      * PLANE.turnRateDegPerSecAt100Kt * (plane.speedKt / 100);
    plane.headingDeg = (plane.headingDeg + turnRate * dt + 360) % 360;

    // Speed chases its target; climbing bleeds a little speed.
    const climbBleed = plane.pitchDeg > 0 ? plane.pitchDeg * 0.12 : 0;
    const speedTarget = Math.max(PLANE.idleKnots, targetSpeedKt - climbBleed);
    plane.speedKt += clamp(speedTarget - plane.speedKt, -PLANE.accelKnotsPerSec * dt, PLANE.accelKnotsPerSec * dt);

    // Fuel burns with throttle and boost; empty tanks mean a glide, then the ground.
    if (!plane.onGround && plane.fuel > 0) {
      const burn = PLANE.fuelBurnIdle + plane.throttle * PLANE.fuelBurnPerThrottle
        + (boosting ? PLANE.fuelBurnBoost : 0);
      plane.fuel = Math.max(0, plane.fuel - burn * dt);
      if (plane.fuel <= 0) events |= EVENT_FUEL_EMPTY;
      else if (plane.fuel < 20 && !state.fuelLowAnnounced) {
        state.fuelLowAnnounced = true;
        events |= EVENT_FUEL_LOW;
      }
    }
    if (plane.fuel <= 0 && !plane.onGround) {
      plane.speedKt = Math.max(0, plane.speedKt - 22 * dt);
    }

    // Move along the heading; climb or descend with the pitch.
    const speedMs = plane.speedKt * KT_TO_MS;
    const headingRad = (plane.headingDeg * Math.PI) / 180;
    const prevZ = plane.z;
    plane.x += Math.sin(headingRad) * speedMs * dt;
    plane.z += Math.cos(headingRad) * speedMs * dt;
    const climbFtPerSec = (plane.speedKt / 100) * PLANE.climbFtPerSecAt100Kt
      * Math.sin((plane.pitchDeg * Math.PI) / 180);
    const prevAltFt = plane.altFt;
    if (!plane.onGround) {
      plane.altFt += climbFtPerSec * dt;
      if (plane.fuel <= 0) plane.altFt -= 420 * dt;
      if (plane.altFt < 0) plane.altFt = 0;
    }
    plane.sinkFtPerSec = (prevAltFt - plane.altFt) / dt;

    // Takeoff roll: the aircraft lifts off once it is fast enough.
    if (plane.onGround && plane.speedKt > 70) {
      plane.onGround = false;
      plane.altFt = 5;
      plane.sinkFtPerSec = 0;
    }
    if (plane.onGround) plane.altFt = 0;

    // Clouds drift with the wind.
    for (let index = 0; index < state.clouds.length; index += 1) {
      const cloud = state.clouds[index];
      cloud.x += cloud.driftMPerSec * dt;
      if (cloud.x > TERRAIN_HALF_WIDTH_M + 400) cloud.x = -TERRAIN_HALF_WIDTH_M - 400;
    }

    if (harmless) return events;

    // Rings: crossing a ring's line scores when the aircraft is inside it.
    for (let index = 0; index < state.rings.length; index += 1) {
      const ring = state.rings[index];
      if (ring.passed || ring.missed) continue;
      if (prevZ < ring.z && plane.z >= ring.z) {
        const dist = Math.abs(plane.x - ring.x);
        if (dist < ring.radiusM) {
          ring.passed = true;
          ring.score = RING.points + Math.round(RING.accuracyBonus * (1 - dist / ring.radiusM));
          state.score += ring.score;
          state.ringsPassed += 1;
          state.ringFlashText = `RING +${ring.score}`;
          state.ringFlashUntil = state.elapsed + 1.6;
          events |= EVENT_RING;
        } else {
          ring.missed = true;
          state.ringsMissed += 1;
          events |= EVENT_RING_MISSED;
        }
      }
    }

    // The ground: hills and the valley floor end a flight that touches them. A runway is flat
    // ground, so its surface is sea level here; touching down only counts while descending.
    const groundFt = terrainHeightFt(plane.x, plane.z);
    const runway = onRunway(plane.x, plane.z);
    const surfaceFt = runway ? 0 : groundFt;
    const touching = plane.altFt <= surfaceFt;
    const settling = plane.sinkFtPerSec > 0 && plane.altFt <= surfaceFt + PLANE.groundClearanceFt;
    if (!plane.onGround && (touching || settling)) {
      if (runway && plane.speedKt <= (plane.flaps ? PLANE.maxLandingKnotsFlaps : PLANE.maxLandingKnots)
        && plane.sinkFtPerSec <= PLANE.maxSinkFtPerSec) {
        plane.onGround = true;
        plane.altFt = 0;
        plane.speedKt = Math.max(0, plane.speedKt - 40 * dt);
        const allRingsDone = state.ringsPassed + state.ringsMissed >= state.rings.length;
        state.landedEarly = !allRingsDone;
        if (allRingsDone) {
          state.status = 'complete';
          state.score += LANDING.points;
          state.score += Math.round(plane.fuel * LANDING.fuelBonusPerUnit);
          state.score += Math.max(0, Math.round((state.mission.parSeconds - state.elapsed) * LANDING.timeBonusPerSec));
        } else {
          state.status = 'landed';
        }
        events |= EVENT_LANDED | EVENT_OVER;
      } else if (runway && plane.speedKt > (plane.flaps ? PLANE.maxLandingKnotsFlaps : PLANE.maxLandingKnots)) {
        // Too fast to land: the aircraft bounces along the runway and stays airborne.
        plane.altFt = surfaceFt + PLANE.groundClearanceFt + 20;
        plane.pitchDeg = Math.max(plane.pitchDeg, 6);
      } else if (plane.sinkFtPerSec > PLANE.maxSinkFtPerSec) {
        state.status = 'crashed';
        state.crashReason = 'Hard landing — you came down too fast.';
        events |= EVENT_CRASHED | EVENT_OVER;
      } else {
        state.status = 'crashed';
        state.crashReason = groundFt > 200
          ? 'You flew into the hills.'
          : 'You flew into the ground.';
        events |= EVENT_CRASHED | EVENT_OVER;
      }
    }

    // Rolling out after landing: bleed speed until the aircraft stops.
    if (plane.onGround && state.status !== 'ready') {
      plane.speedKt = Math.max(0, plane.speedKt - 30 * dt);
    }
    return events;
  }

  reset(0);
  return {
    state,
    reset,
    step,
    terrainHeightFt,
    riverXAt,
    nextRing,
    /** Screen position of a world point, for the renderer and the pointer. */
    worldToScreen(wx, wz) {
      return [
        FIELD.width / 2 + (wx - plane.x) * SCALE,
        PLANE_SCREEN.y - (wz - plane.z) * SCALE,
      ];
    },
    screenToWorld(sx, sy) {
      return [
        plane.x + (sx - FIELD.width / 2) / SCALE,
        plane.z + (PLANE_SCREEN.y - sy) / SCALE,
      ];
    },
  };
}

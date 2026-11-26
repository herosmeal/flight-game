// The screenshot scenes behind ?shot=start|play|ring|land. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a small autopilot that
// flies the mission the way a player would — throttle up, take off, steer for the next ring,
// hold height, then line up with the runway and land — so every frame is what a short game
// really looks like, and the same seed always gives the same frame.
import { STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_COMPLETE, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 4;
const PLAY_SECONDS = 30;
const RING_LIMIT_SECONDS = 150;
const LAND_LIMIT_SECONDS = 300;

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function wrapAngleDeg(degrees) {
  let wrapped = degrees % 360;
  if (wrapped > 180) wrapped -= 360;
  if (wrapped < -180) wrapped += 360;
  return wrapped;
}

/**
 * The autopilot's control for one step: bank toward the next ring (or the runway once the
 * rings are done), pitch toward the target height, and hold a steady cruise throttle.
 */
function autopilotControl(world) {
  const state = world.state;
  const plane = state.plane;
  const ring = world.nextRing();
  // On final approach, aim for a touchdown point 300 m past the threshold, descending
  // along a shallow glidepath that starts well before the threshold. Past the
  // touchdown point the target height stays zero, so the aircraft keeps settling
  // onto the runway instead of levelling off and circling.
  const target = ring ?? {
    x: state.runwayEnd.x,
    z: state.runwayEnd.z0 + 300,
    altFt: 0,
  };
  const dx = target.x - plane.x;
  const dz = target.z - plane.z;
  const dist = Math.hypot(dx, dz);
  let wantedHeading = (Math.atan2(dx, dz) * 180) / Math.PI;
  // On short final, stop steering at the touchdown point and fly the runway
  // heading instead, correcting only the lateral offset: a diagonal crossing
  // drifts off the 70 m strip before the wheels touch.
  if (!ring && dist < 2000) {
    wantedHeading = clamp((state.runwayEnd.x - plane.x) * 0.1, -25, 25);
  }
  const headingError = wrapAngleDeg(wantedHeading - plane.headingDeg);
  const turn = clamp(headingError / 25, -1, 1);
  // On final approach, aim for a gentle descent onto the runway threshold.
  // En route, stay above the highest ground ahead, sampled along the nose so a
  // hill the turn is carrying the aircraft toward is climbed over in time.
  const headingRad = (plane.headingDeg * Math.PI) / 180;
  let groundAhead = world.terrainHeightFt(target.x, target.z);
  for (const aheadM of [200, 450, 700, 1000, 1400]) {
    const sampleX = plane.x + Math.sin(headingRad) * aheadM;
    const sampleZ = plane.z + Math.cos(headingRad) * aheadM;
    groundAhead = Math.max(groundAhead, world.terrainHeightFt(sampleX, sampleZ));
  }
  const targetAlt = ring
    ? Math.max(ring.altFt, groundAhead + 350)
    // The glidepath, never below the hills ahead: over a hill on the approach the
    // aircraft holds height, then descends once the ground ahead is flat again.
    // On flat ground there is no floor, so the glidepath can reach the runway.
    : Math.max(
      clamp(((target.z - plane.z) / 1000) * 300, 0, 900),
      groundAhead > 50 ? groundAhead + 300 : 0,
    );
  const pitch = clamp((targetAlt - plane.altFt) / 200, -1, 1);
  // Cruise at three-quarter throttle; on final approach, throttle back so the
  // aircraft is slow enough to land, and drop the flaps.
  const approach = !ring && dist < 3500;
  const throttleLow = approach ? 0.3 : 0.72;
  const throttleHigh = approach ? 0.35 : 0.78;
  const throttleDelta = plane.throttle < throttleLow ? 1 : plane.throttle > throttleHigh ? -1 : 0;
  return {
    turn,
    pitch,
    throttleDelta,
    boost: false,
    steer: null,
    flaps: approach,
  };
}

function flyAutopilot(world, seconds, stopWhen) {
  const steps = Math.floor(seconds / STEP);
  for (let index = 0; index < steps; index += 1) {
    const control = autopilotControl(world);
    const events = world.step(STEP, control, false);
    if (events & EVENT_OVER) break;
    if (stopWhen && stopWhen(world)) break;
  }
}

/**
 * Set `world` to the named scene (start, play, ring or land; any other name is start) and
 * return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  if (name !== 'play' && name !== 'ring' && name !== 'land') {
    world.reset(0);
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, null, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  world.reset(0);
  if (name === 'play') {
    flyAutopilot(world, PLAY_SECONDS, null);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'ring') {
    // Stop just before the next ring, low over the valley, with the ring in sight.
    flyAutopilot(world, RING_LIMIT_SECONDS, (w) => {
      const ring = w.nextRing();
      if (!ring) return false;
      const plane = w.state.plane;
      return ring.z - plane.z < 400 && ring.z - plane.z > 0 && plane.altFt > 350;
    });
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  // Land: fly the whole mission, then stop on final approach to the runway.
  flyAutopilot(world, LAND_LIMIT_SECONDS, (w) => {
    const plane = w.state.plane;
    const ring = w.nextRing();
    if (ring) return false;
    const dist = Math.hypot(w.state.runwayEnd.x - plane.x, w.state.runwayEnd.z0 - plane.z);
    return dist < 800 && plane.altFt < 550;
  });
  const over = world.state.status === 'crashed';
  const done = world.state.status === 'complete' || world.state.status === 'landed';
  return {
    screen: over ? SCREEN_OVER : done ? SCREEN_COMPLETE : SCREEN_PLAY,
    best: world.state.score,
  };
}

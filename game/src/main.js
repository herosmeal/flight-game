// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The
// game moves between five screens: title, play, paused, mission complete and over (crashed or
// landed early). Sounds start on the first gesture and follow the throttle.
//
// ?seed=N fixes the world. ?shot=start|play|ring|land (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CRASHED, EVENT_FUEL_EMPTY, EVENT_FUEL_LOW, EVENT_LANDED, EVENT_OVER, EVENT_RING } from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_FLAPS,
  ACTION_MISSION_1,
  ACTION_MISSION_2,
  ACTION_MISSION_3,
  ACTION_MUTE,
  ACTION_PAUSE,
  createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  createRenderer,
  SCREEN_COMPLETE,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, scene.best, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let muted = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and events.
  function announce(message) {
    status.textContent = message;
  }

  function startGame(missionIndex) {
    world.reset(missionIndex);
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.startEngine();
    announce(`Flying ${world.state.mission.name}. Fly the rings, then land on runway 09.`);
  }

  function endGame() {
    if (world.state.status === 'complete') {
      screen = SCREEN_COMPLETE;
      announce(`Mission complete. Score ${world.state.score}.`);
    } else if (world.state.status === 'landed') {
      screen = SCREEN_OVER;
      announce(`Landed early. Score ${world.state.score}.`);
    } else {
      screen = SCREEN_OVER;
      announce(`Crashed. ${world.state.crashReason} Score ${world.state.score}.`);
    }
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_FLAPS && screen === SCREEN_PLAY) {
      world.state.plane.flaps = !world.state.plane.flaps;
      announce(world.state.plane.flaps ? 'Flaps down.' : 'Flaps up.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_MISSION_1) startGame(0);
      else if (actions & ACTION_MISSION_2) startGame(1);
      else if (actions & ACTION_MISSION_3) startGame(2);
      else if (actions & ACTION_CONFIRM) startGame(world.state.missionIndex);
    } else if (screen === SCREEN_OVER || screen === SCREEN_COMPLETE) {
      if (actions & ACTION_CONFIRM) startGame(world.state.missionIndex);
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (actions & ACTION_CONFIRM) audio.startEngine();
  }

  /** The control the world steps with this frame, from the keys and the held pointer. */
  function readControl() {
    const steerTarget = input.steerTarget();
    let steer = null;
    if (steerTarget) {
      // The pointer is in CSS pixels; the view transform is in device pixels.
      const view = renderer.view();
      const [wx, wz] = world.screenToWorld(
        (steerTarget.x * view.ratio - view.x) / view.scale,
        (steerTarget.y * view.ratio - view.y) / view.scale,
      );
      steer = { x: wx, z: wz, altFt: world.state.plane.altFt };
    }
    return {
      turn: input.turn(),
      pitch: input.pitch(),
      throttleDelta: input.throttleDelta(),
      boost: input.boostHeld(),
      steer,
    };
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, null, true);
      return;
    }
    const events = world.step(STEP, readControl(), false);
    audio.updateEngine(world.state.plane.throttle, world.state.plane.speedKt, screen === SCREEN_PLAY);
    if (events & EVENT_RING) {
      audio.ringChime();
      announce(`Ring! Score ${world.state.score}.`);
    }
    if (events & EVENT_FUEL_LOW) announce('Low fuel. Find the runway.');
    if (events & EVENT_FUEL_EMPTY) announce('Out of fuel. Gliding.');
    if (events & EVENT_LANDED) audio.landingJingle();
    if (events & EVENT_CRASHED) audio.crashThud();
    if (events & EVENT_OVER) endGame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world, screen, best, muted);
  }

  // Leaving the tab pauses a running game rather than letting the fuel burn unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Sky Courier. Press Space or click to fly. Choose a mission with 1, 2 or 3.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

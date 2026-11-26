// Keyboard and pointer input. Held keys give steering, pitch and throttle; one-shot presses
// (start, pause, boost, flaps, mute, mission choice) are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost and never counted twice. While the
// pointer is held down the aircraft steers toward the pointer's world position.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_BOOST = 4;
export const ACTION_FLAPS = 8;
export const ACTION_MUTE = 16;
export const ACTION_MISSION_1 = 32;
export const ACTION_MISSION_2 = 64;
export const ACTION_MISSION_3 = 128;

const TURN_LEFT = new Set(['ArrowLeft', 'KeyA']);
const TURN_RIGHT = new Set(['ArrowRight', 'KeyD']);
const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const THROTTLE_UP = new Set(['PageUp', 'KeyE']);
const THROTTLE_DOWN = new Set(['PageDown', 'KeyQ']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const FLAPS = new Set(['KeyF']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  let turnLeft = false;
  let turnRight = false;
  let pitchUp = false;
  let pitchDown = false;
  let throttleUp = false;
  let throttleDown = false;
  let boostHeld = false;
  let actions = 0;
  let pointerDown = false;
  let pointerX = 0;
  let pointerY = 0;

  window.addEventListener('keydown', (event) => {
    if (TURN_LEFT.has(event.code)) turnLeft = true;
    else if (TURN_RIGHT.has(event.code)) turnRight = true;
    else if (PITCH_UP.has(event.code)) pitchUp = true;
    else if (PITCH_DOWN.has(event.code)) pitchDown = true;
    else if (THROTTLE_UP.has(event.code)) throttleUp = true;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      boostHeld = true;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (FLAPS.has(event.code)) {
      if (!event.repeat) actions |= ACTION_FLAPS;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (event.code === 'Digit1') {
      if (!event.repeat) actions |= ACTION_MISSION_1;
    } else if (event.code === 'Digit2') {
      if (!event.repeat) actions |= ACTION_MISSION_2;
    } else if (event.code === 'Digit3') {
      if (!event.repeat) actions |= ACTION_MISSION_3;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (TURN_LEFT.has(event.code)) turnLeft = false;
    else if (TURN_RIGHT.has(event.code)) turnRight = false;
    else if (PITCH_UP.has(event.code)) pitchUp = false;
    else if (PITCH_DOWN.has(event.code)) pitchDown = false;
    else if (THROTTLE_UP.has(event.code)) throttleUp = false;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = false;
    else if (CONFIRM.has(event.code)) boostHeld = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    turnLeft = false;
    turnRight = false;
    pitchUp = false;
    pitchDown = false;
    throttleUp = false;
    throttleDown = false;
    boostHeld = false;
    pointerDown = false;
  });

  function setPointer(event) {
    const rect = target.getBoundingClientRect();
    pointerX = event.clientX - rect.left;
    pointerY = event.clientY - rect.top;
  }
  target.addEventListener('pointerdown', (event) => {
    setPointer(event);
    pointerDown = true;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointermove', (event) => {
    if (pointerDown) setPointer(event);
  });
  window.addEventListener('pointerup', () => {
    pointerDown = false;
  });

  return {
    /** -1 for left, 1 for right, 0 for neither or both. */
    turn() {
      return (turnRight ? 1 : 0) - (turnLeft ? 1 : 0);
    },
    /** -1 for nose down, 1 for nose up, 0 for neither or both. */
    pitch() {
      return (pitchUp ? 1 : 0) - (pitchDown ? 1 : 0);
    },
    /** -1 for throttle down, 1 for throttle up, 0 for neither or both. */
    throttleDelta() {
      return (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0);
    },
    boostHeld() {
      return boostHeld;
    },
    /** The pointer's screen position while it is held, or null. */
    steerTarget() {
      return pointerDown ? { x: pointerX, y: pointerY } : null;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}

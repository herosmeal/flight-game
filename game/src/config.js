// Sky Courier: every tuning number and colour in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below depends on
// the screen size. Distances in the world are metres, altitude is feet, speed is knots.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Pixels per metre of world at the chase camera's zoom. */
export const SCALE = 0.22;

/** Where the aircraft sits on screen: the world scrolls around it. */
export const PLANE_SCREEN = { x: 640, y: 480 };

/** Knots to metres per second. */
export const KT_TO_MS = 0.51444;

export const PLANE = {
  /** Knots the engine holds at full throttle, before boost. */
  cruiseKnots: 200,
  /** Knots at idle throttle. */
  idleKnots: 55,
  /** Extra knots while the boost is held. */
  boostKnots: 45,
  /** Knots per second the speed chases its target. */
  accelKnotsPerSec: 14,
  /** Degrees of bank at full roll input. */
  maxBankDeg: 38,
  /** Degrees of pitch at full pitch input. */
  maxPitchDeg: 20,
  /** Degrees per second of turn at full bank and 100 knots. */
  turnRateDegPerSecAt100Kt: 26,
  /** Feet of climb per second at 100 knots and full pitch up. */
  climbFtPerSecAt100Kt: 200,
  /** Fuel units on board at the start of a mission. */
  fuel: 100,
  /** Fuel units burned per second at idle, plus this times throttle. */
  fuelBurnIdle: 0.22,
  fuelBurnPerThrottle: 0.45,
  /** Extra fuel burn per second while boosting. */
  fuelBurnBoost: 0.55,
  /** Feet above the terrain at which the ground starts to matter. */
  groundClearanceFt: 15,
  /** Knots above which a touchdown on the runway is too fast and bounces off. */
  maxLandingKnots: 130,
  /** Knots above which a touchdown is too fast even with flaps down. */
  maxLandingKnotsFlaps: 155,
  /** Feet per second of descent above which a touchdown is a hard landing. */
  maxSinkFtPerSec: 620,
};

export const RING = {
  /** Metres of lateral room around a ring's centre that still counts as flying through it. */
  radiusM: 150,
  /** Points for flying through a ring, plus up to this accuracy bonus for the centre. */
  points: 100,
  accuracyBonus: 50,
  /** Feet the autopilot and the HUD aim for when a ring is the target. */
  targetAltFt: 850,
};

export const LANDING = {
  points: 500,
  /** Points per unit of fuel left when the mission is completed. */
  fuelBonusPerUnit: 5,
  /** Points per second under the mission's par time. */
  timeBonusPerSec: 2,
};

/** The three missions, each with its own course, rings, fuel and par time. */
export const MISSIONS = [
  {
    id: 1,
    name: 'Harbour Hop',
    brief: 'Five rings over the valley, then land on runway 09.',
    courseM: 6000,
    rings: 5,
    fuel: 100,
    parSeconds: 240,
    hills: 10,
    hillMaxFt: 900,
  },
  {
    id: 2,
    name: 'River Run',
    brief: 'Eight rings following the river bend, then land on runway 09.',
    courseM: 9000,
    rings: 8,
    fuel: 100,
    parSeconds: 300,
    hills: 12,
    hillMaxFt: 1100,
  },
  {
    id: 3,
    name: 'High Pass',
    brief: 'Seven rings over the high hills on a tight tank. Fly low, fly true.',
    courseM: 8000,
    rings: 7,
    fuel: 88,
    parSeconds: 280,
    hills: 16,
    hillMaxFt: 1500,
  },
];

/** Metres either side of the course centreline the terrain is drawn for. */
export const TERRAIN_HALF_WIDTH_M = 2600;

export const PALETTE = {
  backdrop: '#0d1b2e',
  grass: '#5d8a4a',
  grassDark: '#4c7440',
  fieldGold: '#c2a55a',
  fieldTan: '#b08d57',
  fieldGreen: '#6fa055',
  fieldBrown: '#8a6b45',
  river: '#3f7fb8',
  riverLight: '#6fa8d4',
  road: '#6e6e6e',
  roadLine: '#e8e8e8',
  hill: '#3e6b38',
  hillTop: '#5d8a4a',
  runway: '#3a3f46',
  runwayMark: '#f2f2f2',
  ring: '#ff9f1c',
  ringNext: '#ffd23f',
  ringPassed: '#7ddb7d',
  planeBody: '#f4f6f8',
  planeTrim: '#0e7490',
  planeAccent: '#ff7a1a',
  canopy: '#1d4e6b',
  cloud: '#ffffff',
  hudPanel: 'rgba(8, 20, 32, 0.72)',
  hudText: '#dff3ff',
  hudAmber: '#ffd23f',
  hudGreen: '#7ddb7d',
  hudRed: '#ff6b5e',
  panel: '#101c2b',
  text: '#eef4f8',
  muted: '#9fb4c4',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'sky-courier.best';

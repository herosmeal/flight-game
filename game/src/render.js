// Drawing only: the world's state and the current screen in, pixels out. The chase camera
// looks straight down at the valley, the aircraft fixed near the bottom of the 1280x720
// playfield while the terrain scrolls past it. Fields, the river, hills, runways and rings are
// drawn from the world's seeded layout; the HUD carries lit instruments for altitude, speed
// and heading, plus fuel, score, time and the rings still to fly.

import {
  FIELD,
  FONT,
  PALETTE,
  PLANE_SCREEN,
  SCALE,
} from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_COMPLETE = 'complete';

const PANEL = { width: 640, top: 130, line: 30, bottom: 66 };
const TWO_PI = Math.PI * 2;

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const altLabel = cachedLabel('ALT ');
  const speedLabel = cachedLabel('SPD ');
  const headingLabel = cachedLabel('HDG ');
  const scoreLabel = cachedLabel('SCORE ');
  const timeLabel = cachedLabel('TIME ');
  const ringsLabel = cachedLabel('RINGS ');
  const bestLabel = cachedLabel('BEST ');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align ?? 'left';
    context.textBaseline = baseline ?? 'alphabetic';
    context.fillText(value, x, y);
  }

  /** World metres to playfield pixels, with the aircraft fixed at PLANE_SCREEN. */
  function toScreen(state, wx, wz) {
    return [
      PLANE_SCREEN.x + (wx - state.plane.x) * SCALE,
      PLANE_SCREEN.y - (wz - state.plane.z) * SCALE,
    ];
  }

  function drawFields(state) {
    const plane = state.plane;
    const minX = plane.x - FIELD.width / 2 / SCALE - 500;
    const maxX = plane.x + FIELD.width / 2 / SCALE + 500;
    const minZ = plane.z - (FIELD.height - PLANE_SCREEN.y) / SCALE - 500;
    const maxZ = plane.z + PLANE_SCREEN.y / SCALE + 500;
    for (let index = 0; index < state.fields.length; index += 1) {
      const field = state.fields[index];
      if (field.x + field.w < minX || field.x > maxX || field.z + field.h < minZ || field.z > maxZ) continue;
      const [sx, sy] = toScreen(state, field.x, field.z);
      context.fillStyle = field.color;
      context.fillRect(sx, sy - field.h * SCALE, field.w * SCALE, field.h * SCALE);
    }
  }

  function drawRiver(state, riverXAt) {
    const plane = state.plane;
    const topZ = plane.z + PLANE_SCREEN.y / SCALE + 300;
    const bottomZ = plane.z - (FIELD.height - PLANE_SCREEN.y) / SCALE - 300;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = PALETTE.river;
    context.lineWidth = 110 * SCALE;
    context.beginPath();
    for (let z = bottomZ; z <= topZ; z += 100) {
      const [sx, sy] = toScreen(state, riverXAt(z), z);
      if (z === bottomZ) context.moveTo(sx, sy);
      else context.lineTo(sx, sy);
    }
    context.stroke();
    context.strokeStyle = PALETTE.riverLight;
    context.lineWidth = 46 * SCALE;
    context.beginPath();
    for (let z = bottomZ; z <= topZ; z += 100) {
      const [sx, sy] = toScreen(state, riverXAt(z), z);
      if (z === bottomZ) context.moveTo(sx, sy);
      else context.lineTo(sx, sy);
    }
    context.stroke();
  }

  function drawRoads(state) {
    const plane = state.plane;
    const topZ = plane.z + PLANE_SCREEN.y / SCALE + 300;
    const bottomZ = plane.z - (FIELD.height - PLANE_SCREEN.y) / SCALE - 300;
    // A valley road runs beside the course; a cross road joins the two runways.
    context.strokeStyle = PALETTE.road;
    context.lineWidth = 26 * SCALE;
    context.beginPath();
    const [ax, ay] = toScreen(state, 1400, bottomZ);
    const [bx, by] = toScreen(state, 1400, topZ);
    context.moveTo(ax, ay);
    context.lineTo(bx, by);
    context.stroke();
    context.strokeStyle = PALETTE.roadLine;
    context.lineWidth = 2;
    context.setLineDash([14, 12]);
    context.beginPath();
    context.moveTo(ax, ay);
    context.lineTo(bx, by);
    context.stroke();
    context.setLineDash([]);
  }

  function drawHills(state) {
    for (let index = 0; index < state.hills.length; index += 1) {
      const hill = state.hills[index];
      const [sx, sy] = toScreen(state, hill.x, hill.z);
      const radius = hill.radiusM * SCALE;
      if (sx + radius < -100 || sx - radius > FIELD.width + 100 || sy + radius < -100 || sy - radius > FIELD.height + 100) continue;
      const gradient = context.createRadialGradient(sx, sy, radius * 0.1, sx, sy, radius);
      gradient.addColorStop(0, PALETTE.hillTop);
      gradient.addColorStop(0.7, PALETTE.hill);
      gradient.addColorStop(1, 'rgba(62, 107, 56, 0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(sx, sy, radius, 0, TWO_PI);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.10)';
      context.beginPath();
      context.arc(sx - radius * 0.25, sy - radius * 0.25, radius * 0.45, 0, TWO_PI);
      context.fill();
    }
  }

  function drawRunway(state, runway, label) {
    const [sx, syTop] = toScreen(state, runway.x - 35, runway.z1);
    const [ex, syBottom] = toScreen(state, runway.x + 35, runway.z0);
    const width = ex - sx;
    const height = syBottom - syTop;
    if (syTop > FIELD.height || syBottom < 0) return;
    context.fillStyle = PALETTE.runway;
    context.fillRect(sx, syTop, width, height);
    context.fillStyle = PALETTE.runwayMark;
    // Centreline dashes.
    const dashH = 26 * SCALE;
    const gapH = 34 * SCALE;
    for (let y = syTop + 12; y < syBottom - 12; y += dashH + gapH) {
      context.fillRect(sx + width / 2 - 1.5, y, 3, dashH);
    }
    // Threshold bars at both ends.
    context.fillRect(sx + 4, syTop + 8, width - 8, 4);
    context.fillRect(sx + 4, syBottom - 12, width - 8, 4);
    text(label, sx + width / 2, syTop + 34, 16, PALETTE.runwayMark, 'center');
  }

  function drawRings(state) {
    for (let index = 0; index < state.rings.length; index += 1) {
      const ring = state.rings[index];
      const [sx, sy] = toScreen(state, ring.x, ring.z);
      const radius = ring.radiusM * SCALE;
      if (sy + radius < -60 || sy - radius > FIELD.height + 60) continue;
      const isNext = index === nextRingIndex(state);
      const color = ring.passed ? PALETTE.ringPassed : isNext ? PALETTE.ringNext : PALETTE.ring;
      context.save();
      context.globalAlpha = ring.passed ? 0.55 : 1;
      context.strokeStyle = color;
      context.lineWidth = isNext ? 5 : 3.5;
      context.beginPath();
      context.arc(sx, sy, radius, 0, TWO_PI);
      context.stroke();
      context.lineWidth = 1.5;
      context.globalAlpha = ring.passed ? 0.3 : 0.65;
      context.beginPath();
      context.arc(sx, sy, radius * 0.62, 0, TWO_PI);
      context.stroke();
      context.restore();
      text(String(index + 1), sx, sy - radius - 8, 18, color, 'center');
      if (isNext) {
        const pulse = 1 + 0.12 * Math.sin(state.elapsed * 5);
        context.strokeStyle = color;
        context.lineWidth = 2;
        context.beginPath();
        context.arc(sx, sy, radius * pulse + 6, 0, TWO_PI);
        context.stroke();
      }
    }
  }

  function nextRingIndex(state) {
    for (let index = 0; index < state.rings.length; index += 1) {
      const ring = state.rings[index];
      if (!ring.passed && !ring.missed) return index;
    }
    return -1;
  }

  function drawPlaneShadow(state) {
    const plane = state.plane;
    const lift = plane.altFt * 0.012;
    context.fillStyle = `rgba(0, 0, 0, ${Math.max(0.05, 0.28 - plane.altFt * 0.00002)})`;
    context.beginPath();
    context.ellipse(PLANE_SCREEN.x + 14 + lift, PLANE_SCREEN.y + 10 + lift, 26, 10, 0, 0, TWO_PI);
    context.fill();
  }

  /** The courier aircraft, drawn from above with canvas paths, banked with its roll. */
  function drawPlane(state) {
    const plane = state.plane;
    drawPlaneShadow(state);
    context.save();
    context.translate(PLANE_SCREEN.x, PLANE_SCREEN.y);
    context.rotate(((plane.headingDeg + plane.bankDeg * 0.25) * Math.PI) / 180);
    // Main wings, swept slightly back.
    context.fillStyle = PALETTE.planeBody;
    context.beginPath();
    context.moveTo(-42, -2);
    context.lineTo(-10, -8);
    context.lineTo(-6, -2);
    context.lineTo(-6, 4);
    context.lineTo(-10, 8);
    context.lineTo(-42, 6);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(42, -2);
    context.lineTo(10, -8);
    context.lineTo(6, -2);
    context.lineTo(6, 4);
    context.lineTo(10, 8);
    context.lineTo(42, 6);
    context.closePath();
    context.fill();
    // Wingtip trim.
    context.fillStyle = PALETTE.planeTrim;
    context.fillRect(-42, -3, 6, 8);
    context.fillRect(36, -3, 6, 8);
    // Tailplane.
    context.fillStyle = PALETTE.planeBody;
    context.beginPath();
    context.moveTo(-14, 20);
    context.lineTo(-4, 16);
    context.lineTo(-4, 22);
    context.lineTo(-14, 26);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(14, 20);
    context.lineTo(4, 16);
    context.lineTo(4, 22);
    context.lineTo(14, 26);
    context.closePath();
    context.fill();
    // Fuselage: a tapered body with an orange courier stripe.
    context.fillStyle = PALETTE.planeBody;
    context.beginPath();
    context.moveTo(0, -30);
    context.quadraticCurveTo(7, -18, 6, 2);
    context.lineTo(5, 24);
    context.quadraticCurveTo(0, 28, -5, 24);
    context.lineTo(-6, 2);
    context.quadraticCurveTo(-7, -18, 0, -30);
    context.fill();
    context.fillStyle = PALETTE.planeAccent;
    context.fillRect(-6, -6, 12, 4);
    // Canopy.
    context.fillStyle = PALETTE.canopy;
    context.beginPath();
    context.ellipse(0, -14, 3.6, 8, 0, 0, TWO_PI);
    context.fill();
    // Spinning propeller at the nose.
    context.strokeStyle = 'rgba(20, 40, 60, 0.55)';
    context.lineWidth = 2;
    context.beginPath();
    context.ellipse(0, -31, 9, 2.5, 0, 0, TWO_PI);
    context.stroke();
    context.restore();
  }

  function drawClouds(state) {
    for (let index = 0; index < state.clouds.length; index += 1) {
      const cloud = state.clouds[index];
      const [sx, sy] = toScreen(state, cloud.x, cloud.z);
      const rx = cloud.rxM * SCALE;
      const ry = cloud.ryM * SCALE;
      if (sx + rx < -100 || sx - rx > FIELD.width + 100 || sy + ry < -100 || sy - ry > FIELD.height + 100) continue;
      context.fillStyle = `rgba(255, 255, 255, ${cloud.alpha * 0.55})`;
      context.beginPath();
      context.ellipse(sx, sy, rx, ry, 0, 0, TWO_PI);
      context.fill();
      context.beginPath();
      context.ellipse(sx + rx * 0.4, sy - ry * 0.3, rx * 0.6, ry * 0.7, 0, 0, TWO_PI);
      context.fill();
    }
  }

  function drawDial(cx, cy, radius, value, max, label) {
    context.fillStyle = 'rgba(6, 16, 26, 0.85)';
    context.beginPath();
    context.arc(cx, cy, radius, 0, TWO_PI);
    context.fill();
    context.strokeStyle = '#2e6b8a';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(cx, cy, radius, 0, TWO_PI);
    context.stroke();
    // Ticks.
    for (let tick = 0; tick <= 8; tick += 1) {
      const angle = -Math.PI * 0.75 + (tick / 8) * Math.PI * 1.5;
      const inner = radius - (tick % 2 === 0 ? 7 : 4);
      context.strokeStyle = '#9fd8ef';
      context.lineWidth = tick % 2 === 0 ? 2 : 1;
      context.beginPath();
      context.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      context.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      context.stroke();
    }
    // Needle.
    const angle = -Math.PI * 0.75 + (Math.min(value, max) / max) * Math.PI * 1.5;
    context.strokeStyle = PALETTE.hudAmber;
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(cx + Math.cos(angle) * (radius - 8), cy + Math.sin(angle) * (radius - 8));
    context.stroke();
    context.fillStyle = PALETTE.hudText;
    context.beginPath();
    context.arc(cx, cy, 3, 0, TWO_PI);
    context.fill();
    text(label, cx, cy + radius + 14, 12, '#9fd8ef', 'center');
    text(String(Math.round(value)), cx, cy + 5, 15, PALETTE.hudText, 'center');
  }

  function drawCompassTape(state, cx, width) {
    const heading = state.plane.headingDeg;
    const half = width / 2;
    context.fillStyle = 'rgba(6, 16, 26, 0.85)';
    context.fillRect(cx - half, 10, width, 44);
    context.strokeStyle = '#2e6b8a';
    context.lineWidth = 1.5;
    context.strokeRect(cx - half, 10, width, 44);
    const pxPerDeg = width / 120;
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    // Step over absolute compass positions, not offsets from the heading: the tape
    // must show its labels at every heading, not only when the heading is a
    // multiple of five.
    const startDeg = Math.floor((heading - 60) / 5) * 5;
    for (let tickDeg = startDeg; tickDeg <= heading + 60; tickDeg += 5) {
      const deg = ((tickDeg % 360) + 360) % 360;
      let offset = tickDeg - heading;
      if (offset > 180) offset -= 360;
      if (offset < -180) offset += 360;
      const x = cx + offset * pxPerDeg;
      const isCardinal = deg % 45 === 0;
      context.strokeStyle = isCardinal ? PALETTE.hudAmber : '#9fd8ef';
      context.lineWidth = isCardinal ? 2 : 1;
      context.beginPath();
      context.moveTo(x, 14);
      context.lineTo(x, isCardinal ? 26 : 20);
      context.stroke();
      if (isCardinal) text(labels[deg], x, 42, 13, PALETTE.hudText, 'center');
      else if (deg % 15 === 0) text(String(deg).padStart(3, '0'), x, 42, 10, '#9fd8ef', 'center');
    }
    // Centre lubber line and the digital heading.
    context.strokeStyle = PALETTE.hudAmber;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(cx, 10);
    context.lineTo(cx, 20);
    context.stroke();
    text(headingLabel(Math.round(heading)), cx, 72, 14, PALETTE.hudText, 'center');
  }

  function drawHud(state, muted) {
    const plane = state.plane;
    context.fillStyle = PALETTE.hudPanel;
    context.fillRect(0, 0, FIELD.width, 84);
    drawDial(52, 36, 24, plane.altFt, 12000, 'ALT FT');
    drawDial(138, 36, 24, plane.speedKt, 260, 'SPD KT');
    drawCompassTape(state, 640, 300);
    // Right block: fuel, time and rings, then score and the mission name.
    const rx = 1000;
    text('FUEL', rx, 26, 13, '#9fd8ef', 'left');
    context.fillStyle = 'rgba(255,255,255,0.15)';
    context.fillRect(rx + 48, 18, 130, 12);
    const fuelColor = plane.fuel < 20 ? PALETTE.hudRed : plane.fuel < 45 ? PALETTE.hudAmber : PALETTE.hudGreen;
    context.fillStyle = fuelColor;
    context.fillRect(rx + 48, 18, 130 * (plane.fuel / 100), 12);
    text(`${Math.round(plane.fuel)}%`, rx + 186, 26, 13, fuelColor, 'left');
    text(timeLabel(formatTime(state.elapsed)), rx, 48, 13, PALETTE.hudText, 'left');
    text(ringsLabel(`${state.ringsPassed}/${state.rings.length}`), 1260, 48, 13, PALETTE.hudText, 'right');
    text(scoreLabel(state.score), rx, 70, 15, PALETTE.hudText, 'left');
    text(state.mission.name, 1260, 70, 13, PALETTE.hudAmber, 'right');

    // Bottom strip: throttle, flaps, boost and hints.
    context.fillStyle = PALETTE.hudPanel;
    context.fillRect(0, FIELD.height - 34, FIELD.width, 34);
    const thrX = 24;
    text('THR', thrX, FIELD.height - 11, 13, '#9fd8ef', 'left');
    context.fillStyle = 'rgba(255,255,255,0.15)';
    context.fillRect(thrX + 44, FIELD.height - 24, 120, 10);
    context.fillStyle = PALETTE.hudGreen;
    context.fillRect(thrX + 44, FIELD.height - 24, 120 * plane.throttle, 10);
    text(`${Math.round(plane.throttle * 100)}%`, thrX + 172, FIELD.height - 11, 13, PALETTE.hudText, 'left');
    const flags = [];
    if (plane.flaps) flags.push('FLAPS');
    if (muted) flags.push('MUTED');
    if (plane.onGround) flags.push('ON GROUND');
    text(flags.join('  ·  ') || 'SPACE boost  ·  F flaps  ·  P pause  ·  M mute', 640, FIELD.height - 11, 13, '#9fd8ef', 'center');

    // Low fuel warning.
    if (plane.fuel < 20 && !plane.onGround && Math.floor(state.elapsed * 2) % 2 === 0) {
      text('LOW FUEL', FIELD.width / 2, 120, 26, PALETTE.hudRed, 'center');
    }
    // Ring flash.
    if (state.ringFlashText && state.elapsed < state.ringFlashUntil) {
      text(state.ringFlashText, FIELD.width / 2, 160, 30, PALETTE.hudAmber, 'center');
    }
    // Next ring: an arrow and distance when it is off the top of the screen.
    const nextIndex = nextRingIndex(state);
    if (nextIndex !== -1) {
      const ring = state.rings[nextIndex];
      const [, ringY] = toScreen(state, ring.x, ring.z);
      if (ringY < 90) {
        const distM = Math.round(Math.hypot(ring.x - plane.x, ring.z - plane.z));
        const arrowX = Math.max(80, Math.min(FIELD.width - 80, 640 + (ring.x - plane.x) * SCALE));
        context.fillStyle = PALETTE.ringNext;
        context.beginPath();
        context.moveTo(arrowX, 96);
        context.lineTo(arrowX - 12, 116);
        context.lineTo(arrowX + 12, 116);
        context.closePath();
        context.fill();
        text(`RING ${nextIndex + 1} · ${distM}m`, arrowX, 136, 15, PALETTE.ringNext, 'center');
      }
    }
  }

  function formatTime(seconds) {
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes}:${String(rest).padStart(2, '0')}`;
  }

  function drawPanel(title, lines, prompt, accent, centerY) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (centerY ?? FIELD.height / 2) - height / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = '#2e6b8a';
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 46, accent ?? PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 22, PALETTE.hudAmber, 'center');
  }

  function drawTitleLines(state, best) {
    return [
      'Rings to fly, fuel to mind, a runway to find.',
      '1 · Harbour Hop — 5 rings, gentle hills',
      '2 · River Run — 8 rings along the river',
      '3 · High Pass — 7 rings, tight fuel, high hills',
      '← → / A D turn · ↑ ↓ / W S pitch · PgUp/PgDn throttle',
      'Hold Space for boost · F flaps · click and hold to steer',
      bestLabel(best),
    ];
  }

  /** Paint one frame: the valley, the aircraft, the HUD and the panel for the screen. */
  function draw(world, screen, best, muted) {
    const state = world.state;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    // The valley floor.
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    drawFields(state);
    drawRiver(state, world.riverXAt);
    drawRoads(state);
    drawHills(state);
    drawRunway(state, state.runwayStart, '09');
    drawRunway(state, state.runwayEnd, '09');
    drawRings(state);
    drawPlane(state);
    drawClouds(state);

    if (screen === SCREEN_TITLE) {
      // The title panel sits high, so the courier aircraft on the runway below it stays in frame.
      drawPanel('SKY COURIER', drawTitleLines(state, best), 'Press Space, click, or press 1 / 2 / 3 to fly', undefined, 235);
      return;
    }
    drawHud(state, muted);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The valley will wait for you.'], 'Press P to resume');
    } else if (screen === SCREEN_COMPLETE) {
      const ringsScore = state.rings.reduce((sum, ring) => sum + ring.score, 0);
      const fuelBonus = Math.round(state.plane.fuel * 5);
      const timeBonus = Math.max(0, Math.round((state.mission.parSeconds - state.elapsed) * 2));
      const lines = [
        `${state.mission.name} — all rings flown, wheels down on runway 09.`,
        '',
        `Rings: ${ringsScore}  ·  Landing: 500`,
        `Fuel bonus: ${fuelBonus}  ·  Time bonus: ${timeBonus}`,
        '',
        `Total score: ${state.score}`,
        bestLabel(best),
      ];
      drawPanel('Mission complete!', lines, 'Press Space or click to fly again', PALETTE.hudGreen);
    } else if (screen === SCREEN_OVER) {
      const lines = state.status === 'landed'
        ? [
          `You landed early with ${state.rings.length - state.ringsPassed - state.ringsMissed} rings still to fly.`,
          '',
          `Score: ${state.score}`,
          bestLabel(best),
        ]
        : [
          state.crashReason || 'Your flight ended.',
          '',
          `Score: ${state.score}`,
          bestLabel(best),
        ];
      const title = state.status === 'landed' ? 'Landed early' : 'Crashed';
      drawPanel(title, lines, 'Press Space or click to fly again', state.status === 'landed' ? PALETTE.hudAmber : PALETTE.hudRed);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    /** The current view transform, so pointer pixels become playfield pixels. */
    view() {
      return { x: view.x, y: view.y, scale: view.scale, ratio: window.devicePixelRatio || 1 };
    },
  };
}

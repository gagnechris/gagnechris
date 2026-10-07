import type { Season } from '../facts';
import {
  CAMP_FOOD_SIZE,
  FOOD_SIZE,
  GROUND_Y,
  WORLD_HEIGHT,
  type CampFoodKind,
  type Decor,
  type NaturalFoodKind,
} from './wildLevels';
import {
  MAPLE_H,
  MAPLE_W,
  carOnRoad,
  dogAwake,
  personWatching,
  currentLevel,
  isRevealed,
  isSniffing,
  type WildState,
} from './wildLogic';
import { PALETTE } from '../shared/palette';

type Palette = {
  sky: string;
  sun: string;
  far: string;
  near: string;
  grass: string;
  dirt: string;
};

const PALETTES: Readonly<Record<Season, Palette>> = {
  spring: {
    sky: '#e3f0f4',
    sun: '#ffe7a3',
    far: '#a9c7b0',
    near: '#7aa58a',
    grass: '#6f9a4a',
    dirt: PALETTE.dirt,
  },
  summer: {
    sky: PALETTE.skySummer,
    sun: '#ffe7a3',
    far: '#a9c7b0',
    near: '#6f9c86',
    grass: '#5b8a3a',
    dirt: PALETTE.dirt,
  },
  fall: {
    sky: PALETTE.skyAutumn,
    sun: PALETTE.gold,
    far: PALETTE.autumnFar,
    near: PALETTE.autumnNear,
    grass: PALETTE.moss,
    dirt: PALETTE.earth,
  },
};

/** Floating "+3%" over where Maple just ate. */
export type EatPopup = {
  text: string;
  x: number;
  y: number;
  bornAt: number;
  tone: 'good' | 'bad';
};

export type CrumbBurst = {
  x: number;
  y: number;
  bornAt: number;
  color: string;
};

export type Effects = {
  popups: EatPopup[];
  crumbs: CrumbBurst[];
  munchUntil: number;
};

export const POPUP_MS = 1_100;
export const CRUMBS_MS = 450;
export const MUNCH_MS = 260;

export type RenderOptions = {
  /** Logical view width (height is always WORLD_HEIGHT). */
  viewWidth: number;
  cameraX: number;
  /** ms, for idle/walk cycles and effects; same clock as Effects.bornAt. */
  time: number;
  reducedMotion: boolean;
  effects?: Effects;
};

export function cameraTarget(state: WildState, viewWidth: number): number {
  const level = currentLevel(state);
  const target = state.maple.x - viewWidth * 0.35;
  return Math.max(0, Math.min(Math.max(0, level.length - viewWidth), target));
}

function mountains(
  ctx: CanvasRenderingContext2D,
  color: string,
  baseY: number,
  peak: number,
  spacing: number,
  offset: number,
  width: number,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  const start = -((offset % spacing) + spacing);
  for (let x = start; x <= width + spacing; x += spacing) {
    ctx.lineTo(x, baseY);
    ctx.lineTo(x + spacing / 2, baseY - peak);
  }
  ctx.lineTo(width, GROUND_Y);
  ctx.closePath();
  ctx.fill();
}

function tree(ctx: CanvasRenderingContext2D, d: Decor) {
  const x = d.x;
  switch (d.kind) {
    case 'pine':
      ctx.fillStyle = PALETTE.pine;
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y);
      ctx.lineTo(x + 45, GROUND_Y - 150);
      ctx.lineTo(x + 90, GROUND_Y);
      ctx.fill();
      return;
    case 'beech':
    case 'oak':
    case 'apple': {
      ctx.fillStyle = '#9b9488';
      ctx.fillRect(x + 36, GROUND_Y - 230, 18, 230);
      const leaf =
        d.kind === 'beech'
          ? '#c98a2c'
          : d.kind === 'oak'
            ? PALETTE.acorn
            : PALETTE.moss;
      ctx.fillStyle = leaf;
      for (const [cx, cy, r] of [
        [45, -260, 70],
        [-5, -220, 50],
        [95, -220, 50],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x + cx, GROUND_Y + cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (d.kind === 'apple') {
        ctx.fillStyle = PALETTE.rust;
        for (const [ax, ay] of [
          [20, -250],
          [70, -270],
          [50, -215],
        ] as const) {
          ctx.beginPath();
          ctx.arc(x + ax, GROUND_Y + ay, 8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return;
    }
    case 'tent':
      ctx.fillStyle = PALETTE.rust;
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y);
      ctx.lineTo(x + 70, GROUND_Y - 100);
      ctx.lineTo(x + 140, GROUND_Y);
      ctx.fill();
      ctx.fillStyle = PALETTE.rustDark;
      ctx.beginPath();
      ctx.moveTo(x + 55, GROUND_Y);
      ctx.lineTo(x + 70, GROUND_Y - 50);
      ctx.lineTo(x + 85, GROUND_Y);
      ctx.fill();
      return;
    case 'table':
      ctx.fillStyle = PALETTE.beechnut;
      ctx.fillRect(x, GROUND_Y - 44, 120, 10);
      ctx.fillRect(x + 12, GROUND_Y - 34, 8, 34);
      ctx.fillRect(x + 100, GROUND_Y - 34, 8, 34);
      return;
    case 'den':
      ctx.fillStyle = PALETTE.earth;
      ctx.beginPath();
      ctx.ellipse(x + 90, GROUND_Y, 110, 80, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = PALETTE.soil;
      ctx.beginPath();
      ctx.ellipse(x + 90, GROUND_Y, 45, 38, 0, Math.PI, 0);
      ctx.fill();
      return;
    case 'cattails':
      ctx.strokeStyle = PALETTE.moss;
      ctx.lineWidth = 4;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * 18, GROUND_Y);
        ctx.lineTo(x + i * 18 + 4, GROUND_Y - 80 - (i % 3) * 14);
        ctx.stroke();
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(x + i * 18, GROUND_Y - 96 - (i % 3) * 14, 9, 22);
      }
      return;
  }
}

function food(
  ctx: CanvasRenderingContext2D,
  kind: NaturalFoodKind,
  x: number,
  bottom: number,
  glow: boolean,
) {
  const { w, h } = FOOD_SIZE[kind];
  const top = bottom - h;
  if (glow) {
    ctx.fillStyle = 'rgba(244, 185, 66, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, top + h / 2, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  switch (kind) {
    case 'berries':
      ctx.fillStyle = PALETTE.pine;
      for (const [cx, cy, r] of [
        [12, 22, 13],
        [30, 14, 15],
        [46, 24, 12],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x + cx, top + cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = PALETTE.berry;
      for (const [cx, cy] of [
        [14, 18],
        [30, 10],
        [44, 20],
        [24, 26],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x + cx, top + cy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    case 'greens':
      ctx.strokeStyle = PALETTE.leaf;
      ctx.lineWidth = 5;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 6 + i * 9, bottom);
        ctx.quadraticCurveTo(x + i * 9, top + 8, x + 10 + i * 9, top);
        ctx.stroke();
      }
      return;
    case 'roots':
      ctx.fillStyle = PALETTE.leaf;
      ctx.fillRect(x + 16, top, 4, h - 8);
      ctx.fillStyle = PALETTE.muzzle;
      ctx.beginPath();
      ctx.ellipse(x + 18, bottom - 6, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'beechnuts':
    case 'acorns':
      ctx.fillStyle = kind === 'beechnuts' ? PALETTE.beechnut : PALETTE.acorn;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, top);
      ctx.lineTo(x + w, bottom);
      ctx.lineTo(x, bottom);
      ctx.closePath();
      ctx.fill();
      return;
    case 'apples':
      ctx.fillStyle = PALETTE.rust;
      ctx.beginPath();
      ctx.arc(x + w / 2, top + h / 2 + 2, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.moss;
      ctx.fillRect(x + w / 2 - 1, top - 4, 3, 8);
      return;
    case 'insects':
      ctx.fillStyle = PALETTE.soil;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(x + 4 + i * 6, bottom - 6 - (i % 2) * 5, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
  }
}

function campFood(
  ctx: CanvasRenderingContext2D,
  kind: CampFoodKind,
  x: number,
  time: number,
  reducedMotion: boolean,
) {
  const { w, h } = CAMP_FOOD_SIZE;
  const top = GROUND_Y - h;
  const pulse = reducedMotion ? 0.5 : 0.5 + 0.25 * Math.sin(time / 300);
  ctx.fillStyle = `rgba(244, 185, 66, ${0.35 * pulse + 0.15})`;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, top + h / 2, w, h * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  switch (kind) {
    case 'trash':
      ctx.fillStyle = PALETTE.steel;
      ctx.fillRect(x + 4, top + 12, w - 8, h - 12);
      ctx.fillStyle = PALETTE.charcoal;
      ctx.save();
      ctx.translate(x, top + 10);
      ctx.rotate(-0.25);
      ctx.fillRect(0, -6, w, 8);
      ctx.restore();
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(x + 12, top + 4, 14, 10);
      return;
    case 'feeder':
      ctx.fillStyle = PALETTE.earth;
      ctx.fillRect(x + w / 2 - 3, top, 6, h);
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(x + 8, top, w - 16, 26);
      ctx.fillStyle = PALETTE.pine;
      ctx.fillRect(x + 4, top - 6, w - 8, 8);
      return;
    case 'cooler':
      ctx.fillStyle = PALETTE.water;
      ctx.fillRect(x, top + 22, w, h - 22);
      ctx.fillStyle = PALETTE.waterDark;
      ctx.fillRect(x, top + 10, w, 10);
      return;
  }
}

function cueBubble(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = PALETTE.white;
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 6, y + 18);
  ctx.lineTo(x, y + 30);
  ctx.lineTo(x + 6, y + 18);
  ctx.fill();
}

/** Watching: facing the path with an eye cue. Busy: turned away with a pan and "…". */
function person(
  ctx: CanvasRenderingContext2D,
  x: number,
  watching: boolean,
  clapping: boolean,
) {
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(x - 8, GROUND_Y - 40, 6, 40);
  ctx.fillRect(x + 2, GROUND_Y - 40, 6, 40);
  ctx.fillStyle = watching ? PALETTE.rust : '#9a4323';
  ctx.fillRect(x - 12, GROUND_Y - 90, 24, 52);
  ctx.fillStyle = watching ? PALETTE.skin : PALETTE.earth;
  ctx.beginPath();
  ctx.arc(x, GROUND_Y - 104, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.skin;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (clapping) {
    ctx.moveTo(x - 10, GROUND_Y - 84);
    ctx.lineTo(x - 26, GROUND_Y - 112);
    ctx.moveTo(x + 10, GROUND_Y - 84);
    ctx.lineTo(x + 26, GROUND_Y - 112);
  } else if (watching) {
    ctx.moveTo(x - 12, GROUND_Y - 84);
    ctx.lineTo(x - 16, GROUND_Y - 56);
    ctx.moveTo(x + 12, GROUND_Y - 84);
    ctx.lineTo(x + 16, GROUND_Y - 56);
  } else {
    ctx.moveTo(x + 10, GROUND_Y - 80);
    ctx.lineTo(x + 30, GROUND_Y - 70);
  }
  ctx.stroke();
  if (!watching && !clapping) {
    ctx.fillStyle = PALETTE.charcoal;
    ctx.beginPath();
    ctx.ellipse(x + 42, GROUND_Y - 70, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x + 28, GROUND_Y - 72, 6, 4);
  }

  const cy = GROUND_Y - 160;
  cueBubble(ctx, x, cy);
  if (watching) {
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.ellipse(x, cy, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.white;
    ctx.beginPath();
    ctx.arc(x, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(x - 1, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#667085';
    for (const dx of [-9, 0, 9]) {
      ctx.beginPath();
      ctx.arc(x + dx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Awake: standing, ears up, "!". Napping: lying down with "z z". */
function dog(ctx: CanvasRenderingContext2D, x: number, awake: boolean) {
  ctx.fillStyle = '#d9b98a';
  if (awake) {
    ctx.beginPath();
    ctx.ellipse(x, GROUND_Y - 22, 26, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 24, GROUND_Y - 32, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 18, GROUND_Y - 40);
    ctx.lineTo(x + 20, GROUND_Y - 54);
    ctx.lineTo(x + 26, GROUND_Y - 42);
    ctx.fill();
    ctx.fillRect(x - 18, GROUND_Y - 14, 6, 14);
    ctx.fillRect(x + 12, GROUND_Y - 14, 6, 14);
  } else {
    ctx.beginPath();
    ctx.ellipse(x, GROUND_Y - 10, 30, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 26, GROUND_Y - 12, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  const cy = GROUND_Y - 90;
  cueBubble(ctx, x + 10, cy);
  ctx.fillStyle = awake ? PALETTE.alert : '#667085';
  ctx.font = '800 22px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(awake ? '!' : 'z z', x + 10, cy + 1);
}

function highLog(
  ctx: CanvasRenderingContext2D,
  p: { x: number; w: number; top: number },
) {
  const y = GROUND_Y - p.top;
  ctx.strokeStyle = '#5a3a20';
  ctx.lineWidth = 8;
  for (const f of [0.12, 0.5, 0.88]) {
    ctx.beginPath();
    ctx.moveTo(p.x + p.w * f, y + 20);
    ctx.lineTo(p.x + p.w * f + 10, GROUND_Y);
    ctx.stroke();
  }
  ctx.fillStyle = '#7a4b2a';
  ctx.beginPath();
  ctx.roundRect(p.x, y, p.w, 24, 12);
  ctx.fill();
  ctx.fillStyle = '#b07a4f';
  ctx.beginPath();
  ctx.ellipse(p.x + p.w - 12, y + 12, 9, 9, 0, 0, Math.PI * 2);
  ctx.fill();
}

function car(ctx: CanvasRenderingContext2D, x: number) {
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(x, GROUND_Y - 58, 170, 40);
  ctx.fillRect(x + 36, GROUND_Y - 88, 96, 32);
  ctx.fillStyle = PALETTE.ink;
  for (const cx of [36, 134]) {
    ctx.beginPath();
    ctx.arc(x + cx, GROUND_Y - 16, 16, 0, Math.PI * 2);
    ctx.fill();
  }
}

function maple(
  ctx: CanvasRenderingContext2D,
  state: WildState,
  opts: RenderOptions,
) {
  const m = state.maple;
  const moving = Math.abs(m.vx) > 1 && m.onGround;
  const bob = moving && !opts.reducedMotion ? Math.sin(opts.time / 70) * 3 : 0;
  const sniffing = isSniffing(state);
  const munching = opts.time < (opts.effects?.munchUntil ?? 0);
  ctx.save();
  ctx.translate(m.x + MAPLE_W / 2, m.y + bob);
  ctx.scale(m.facing, 1);
  ctx.translate(-MAPLE_W / 2, 0);
  const fur = PALETTE.bearFur;
  ctx.fillStyle = fur;
  // legs
  const stride =
    moving && !opts.reducedMotion ? Math.sin(opts.time / 70) * 6 : 0;
  ctx.fillRect(18 + stride, 38, 16, 26);
  ctx.fillRect(66 - stride, 38, 16, 26);
  // body
  ctx.beginPath();
  ctx.ellipse(48, 30, 46, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  // head (lower when sniffing)
  const headY = sniffing || munching ? 30 : 16;
  ctx.beginPath();
  ctx.arc(92, headY, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(82, headY - 16, 7, 0, Math.PI * 2);
  ctx.arc(99, headY - 17, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.muzzle;
  ctx.beginPath();
  ctx.ellipse(106, headY + 5, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.arc(113, headY + 2, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.white;
  ctx.beginPath();
  ctx.arc(96, headY - 5, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.arc(97, headY - 4.5, 1.5, 0, Math.PI * 2);
  ctx.fill();
  if (sniffing) {
    ctx.strokeStyle = 'rgba(22, 25, 29, 0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(124 + i * 10, headY + 4, 6 + i * 4, -0.6, 0.6);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function crumbs(
  ctx: CanvasRenderingContext2D,
  burst: CrumbBurst,
  time: number,
) {
  const t = (time - burst.bornAt) / CRUMBS_MS;
  if (t < 0 || t >= 1) return;
  ctx.fillStyle = burst.color;
  ctx.globalAlpha = 1 - t;
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 - Math.PI / 2;
    const dist = 10 + t * 34;
    ctx.beginPath();
    ctx.arc(
      burst.x + Math.cos(angle) * dist,
      burst.y + Math.sin(angle) * dist - t * 10,
      4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function popup(
  ctx: CanvasRenderingContext2D,
  p: EatPopup,
  time: number,
  reducedMotion: boolean,
) {
  const t = (time - p.bornAt) / POPUP_MS;
  if (t < 0 || t >= 1) return;
  const rise = reducedMotion ? 0 : 56 * t;
  ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
  ctx.font = '800 30px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 7;
  ctx.strokeStyle = PALETTE.white;
  ctx.lineJoin = 'round';
  ctx.strokeText(p.text, p.x, p.y - rise);
  ctx.fillStyle = p.tone === 'good' ? '#2f6f4f' : PALETTE.alert;
  ctx.fillText(p.text, p.x, p.y - rise);
  ctx.globalAlpha = 1;
}

function bubble(ctx: CanvasRenderingContext2D, text: string, x: number) {
  ctx.font = '700 20px Inter, system-ui, sans-serif';
  const w = Math.min(320, ctx.measureText(text).width + 28);
  const y = GROUND_Y - 190;
  ctx.fillStyle = PALETTE.white;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y, w, 40, 14);
  ctx.fill();
  ctx.fillStyle = PALETTE.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 20, w - 20);
}

export function renderWild(
  ctx: CanvasRenderingContext2D,
  state: WildState,
  opts: RenderOptions,
) {
  const level = currentLevel(state);
  const pal = PALETTES[level.season];
  const { viewWidth: W, cameraX } = opts;
  const parallax = opts.reducedMotion ? 0 : cameraX;

  ctx.fillStyle = pal.sky;
  ctx.fillRect(0, 0, W, WORLD_HEIGHT);
  ctx.fillStyle = pal.sun;
  ctx.beginPath();
  ctx.arc(W * 0.82, 250, 48, 0, Math.PI * 2);
  ctx.fill();
  mountains(ctx, pal.far, 470, 200, 520, parallax * 0.2, W);
  mountains(ctx, pal.near, 520, 130, 380, parallax * 0.45, W);

  ctx.save();
  ctx.translate(-cameraX, 0);

  const inView = (x: number, w = 300) =>
    x + w > cameraX - 50 && x < cameraX + W + 50;

  for (const d of level.decor) if (inView(d.x)) tree(ctx, d);

  ctx.fillStyle = pal.grass;
  ctx.fillRect(cameraX - 10, GROUND_Y, W + 20, 16);
  ctx.fillStyle = pal.dirt;
  ctx.fillRect(cameraX - 10, GROUND_Y + 16, W + 20, WORLD_HEIGHT - GROUND_Y);

  for (const road of level.roads) {
    if (!inView(road.x, road.w)) continue;
    ctx.fillStyle = PALETTE.slate;
    ctx.fillRect(road.x, GROUND_Y, road.w, 24);
    ctx.fillStyle = PALETTE.gold;
    for (let x = road.x + 10; x < road.x + road.w - 20; x += 40) {
      ctx.fillRect(x, GROUND_Y + 10, 20, 4);
    }
    if (carOnRoad(state.levelT, road)) car(ctx, road.x + road.w / 2 - 85);
  }

  for (const p of level.platforms) if (inView(p.x, p.w)) highLog(ctx, p);

  for (const s of level.solids) {
    if (!inView(s.x, s.w)) continue;
    const top = GROUND_Y - s.h;
    if (s.kind === 'log') {
      ctx.fillStyle = '#7a4b2a';
      ctx.beginPath();
      ctx.roundRect(s.x, top, s.w, s.h, s.h / 2);
      ctx.fill();
      ctx.fillStyle = '#b07a4f';
      ctx.beginPath();
      ctx.ellipse(
        s.x + s.w - s.h / 2,
        top + s.h / 2,
        s.h / 2 - 4,
        s.h / 2 - 4,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    } else {
      ctx.fillStyle = '#8c8f94';
      ctx.beginPath();
      ctx.moveTo(s.x, GROUND_Y);
      ctx.lineTo(s.x + 18, top);
      ctx.lineTo(s.x + s.w - 18, top);
      ctx.lineTo(s.x + s.w, GROUND_Y);
      ctx.closePath();
      ctx.fill();
    }
  }

  const eaten = new Set(state.eaten);
  for (const f of level.foods) {
    if (eaten.has(f.id) || !inView(f.x, 60)) continue;
    if (f.hidden && !isRevealed(state, f.x)) continue;
    food(ctx, f.kind, f.x, f.bottom, Boolean(f.hidden));
  }
  for (const c of level.camp) {
    if (eaten.has(c.id) || !inView(c.x, 60)) continue;
    campFood(ctx, c.kind, c.x, opts.time, opts.reducedMotion);
  }

  const clappingAt = state.bubble?.x;
  for (const p of level.people) {
    if (!inView(p.x - 40, 120)) continue;
    person(
      ctx,
      p.x,
      personWatching(state.levelT, p.offsetMs),
      clappingAt === p.x,
    );
  }
  for (const d of level.dogs) {
    if (inView(d.x - 40, 80)) dog(ctx, d.x, dogAwake(state.levelT, d.offsetMs));
  }

  if (isSniffing(state)) {
    ctx.strokeStyle = 'rgba(244, 185, 66, 0.5)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.ellipse(
      state.maple.x + MAPLE_W / 2,
      GROUND_Y - MAPLE_H / 2,
      450,
      120,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (opts.effects && !opts.reducedMotion) {
    for (const burst of opts.effects.crumbs) crumbs(ctx, burst, opts.time);
  }

  maple(ctx, state, opts);

  if (opts.effects) {
    for (const p of opts.effects.popups)
      popup(ctx, p, opts.time, opts.reducedMotion);
  }

  if (state.bubble) bubble(ctx, state.bubble.text, state.bubble.x);

  ctx.restore();
}

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
  currentLevel,
  isRevealed,
  isSniffing,
  type WildState,
} from './wildLogic';

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
    dirt: '#8b6a4c',
  },
  summer: {
    sky: '#dbecf2',
    sun: '#ffe7a3',
    far: '#a9c7b0',
    near: '#6f9c86',
    grass: '#5b8a3a',
    dirt: '#8b6a4c',
  },
  fall: {
    sky: '#f6e3c8',
    sun: '#f4b942',
    far: '#b5652f',
    near: '#8a4b25',
    grass: '#5b7f3a',
    dirt: '#6b4f3a',
  },
};

export type RenderOptions = {
  /** Logical view width (height is always WORLD_HEIGHT). */
  viewWidth: number;
  cameraX: number;
  /** ms, for idle/walk cycles. */
  time: number;
  reducedMotion: boolean;
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
      ctx.fillStyle = '#2f5d50';
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
            ? '#a8552a'
            : '#5b7f3a';
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
        ctx.fillStyle = '#c2552d';
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
      ctx.fillStyle = '#c2552d';
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y);
      ctx.lineTo(x + 70, GROUND_Y - 100);
      ctx.lineTo(x + 140, GROUND_Y);
      ctx.fill();
      ctx.fillStyle = '#7a2e17';
      ctx.beginPath();
      ctx.moveTo(x + 55, GROUND_Y);
      ctx.lineTo(x + 70, GROUND_Y - 50);
      ctx.lineTo(x + 85, GROUND_Y);
      ctx.fill();
      return;
    case 'table':
      ctx.fillStyle = '#8a5a35';
      ctx.fillRect(x, GROUND_Y - 44, 120, 10);
      ctx.fillRect(x + 12, GROUND_Y - 34, 8, 34);
      ctx.fillRect(x + 100, GROUND_Y - 34, 8, 34);
      return;
    case 'den':
      ctx.fillStyle = '#6b4f3a';
      ctx.beginPath();
      ctx.ellipse(x + 90, GROUND_Y, 110, 80, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#2b2018';
      ctx.beginPath();
      ctx.ellipse(x + 90, GROUND_Y, 45, 38, 0, Math.PI, 0);
      ctx.fill();
      return;
    case 'cattails':
      ctx.strokeStyle = '#5b7f3a';
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
      ctx.fillStyle = '#2f5d50';
      for (const [cx, cy, r] of [
        [12, 22, 13],
        [30, 14, 15],
        [46, 24, 12],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x + cx, top + cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#6b2a4a';
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
      ctx.strokeStyle = '#4f8a3a';
      ctx.lineWidth = 5;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 6 + i * 9, bottom);
        ctx.quadraticCurveTo(x + i * 9, top + 8, x + 10 + i * 9, top);
        ctx.stroke();
      }
      return;
    case 'roots':
      ctx.fillStyle = '#4f8a3a';
      ctx.fillRect(x + 16, top, 4, h - 8);
      ctx.fillStyle = '#c9a27a';
      ctx.beginPath();
      ctx.ellipse(x + 18, bottom - 6, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'beechnuts':
    case 'acorns':
      ctx.fillStyle = kind === 'beechnuts' ? '#8a5a35' : '#a8552a';
      ctx.beginPath();
      ctx.moveTo(x + w / 2, top);
      ctx.lineTo(x + w, bottom);
      ctx.lineTo(x, bottom);
      ctx.closePath();
      ctx.fill();
      return;
    case 'apples':
      ctx.fillStyle = '#c2552d';
      ctx.beginPath();
      ctx.arc(x + w / 2, top + h / 2 + 2, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5b7f3a';
      ctx.fillRect(x + w / 2 - 1, top - 4, 3, 8);
      return;
    case 'insects':
      ctx.fillStyle = '#2b2018';
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
      ctx.fillStyle = '#4d5871';
      ctx.fillRect(x + 4, top + 12, w - 8, h - 12);
      ctx.fillStyle = '#2b3138';
      ctx.save();
      ctx.translate(x, top + 10);
      ctx.rotate(-0.25);
      ctx.fillRect(0, -6, w, 8);
      ctx.restore();
      ctx.fillStyle = '#f4b942';
      ctx.fillRect(x + 12, top + 4, 14, 10);
      return;
    case 'feeder':
      ctx.fillStyle = '#6b4f3a';
      ctx.fillRect(x + w / 2 - 3, top, 6, h);
      ctx.fillStyle = '#f4b942';
      ctx.fillRect(x + 8, top, w - 16, 26);
      ctx.fillStyle = '#2f5d50';
      ctx.fillRect(x + 4, top - 6, w - 8, 8);
      return;
    case 'cooler':
      ctx.fillStyle = '#4ea5d9';
      ctx.fillRect(x, top + 22, w, h - 22);
      ctx.fillStyle = '#2b6f97';
      ctx.fillRect(x, top + 10, w, 10);
      return;
  }
}

function person(ctx: CanvasRenderingContext2D, x: number, clapping: boolean) {
  ctx.fillStyle = '#16191d';
  ctx.fillRect(x - 8, GROUND_Y - 40, 6, 40);
  ctx.fillRect(x + 2, GROUND_Y - 40, 6, 40);
  ctx.fillStyle = '#c2552d';
  ctx.fillRect(x - 12, GROUND_Y - 90, 24, 52);
  ctx.fillStyle = '#f2c9a0';
  ctx.beginPath();
  ctx.arc(x, GROUND_Y - 104, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f2c9a0';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (clapping) {
    ctx.moveTo(x - 10, GROUND_Y - 84);
    ctx.lineTo(x - 26, GROUND_Y - 112);
    ctx.moveTo(x + 10, GROUND_Y - 84);
    ctx.lineTo(x + 26, GROUND_Y - 112);
  } else {
    ctx.moveTo(x - 12, GROUND_Y - 84);
    ctx.lineTo(x - 16, GROUND_Y - 56);
    ctx.moveTo(x + 12, GROUND_Y - 84);
    ctx.lineTo(x + 16, GROUND_Y - 56);
  }
  ctx.stroke();
}

function dog(ctx: CanvasRenderingContext2D, x: number) {
  ctx.fillStyle = '#d9b98a';
  ctx.beginPath();
  ctx.ellipse(x, GROUND_Y - 22, 26, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 24, GROUND_Y - 32, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - 18, GROUND_Y - 14, 6, 14);
  ctx.fillRect(x + 12, GROUND_Y - 14, 6, 14);
}

function car(ctx: CanvasRenderingContext2D, x: number) {
  ctx.fillStyle = '#4ea5d9';
  ctx.fillRect(x, GROUND_Y - 58, 170, 40);
  ctx.fillRect(x + 36, GROUND_Y - 88, 96, 32);
  ctx.fillStyle = '#16191d';
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
  ctx.save();
  ctx.translate(m.x + MAPLE_W / 2, m.y + bob);
  ctx.scale(m.facing, 1);
  ctx.translate(-MAPLE_W / 2, 0);
  const fur = '#1d1a19';
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
  const headY = sniffing ? 30 : 16;
  ctx.beginPath();
  ctx.arc(92, headY, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(82, headY - 16, 7, 0, Math.PI * 2);
  ctx.arc(99, headY - 17, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c9a27a';
  ctx.beginPath();
  ctx.ellipse(106, headY + 5, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.arc(113, headY + 2, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
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

function bubble(ctx: CanvasRenderingContext2D, text: string, x: number) {
  ctx.font = '700 20px Inter, system-ui, sans-serif';
  const w = Math.min(320, ctx.measureText(text).width + 28);
  const y = GROUND_Y - 190;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y, w, 40, 14);
  ctx.fill();
  ctx.fillStyle = '#16191d';
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
    ctx.fillStyle = '#4a515a';
    ctx.fillRect(road.x, GROUND_Y, road.w, 24);
    ctx.fillStyle = '#f4b942';
    for (let x = road.x + 10; x < road.x + road.w - 20; x += 40) {
      ctx.fillRect(x, GROUND_Y + 10, 20, 4);
    }
    if (carOnRoad(state.levelT, road)) car(ctx, road.x + road.w / 2 - 85);
  }

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
  for (const p of level.people)
    if (inView(p.x - 40, 80)) person(ctx, p.x, clappingAt === p.x);
  for (const d of level.dogs) if (inView(d.x - 40, 80)) dog(ctx, d.x);

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

  maple(ctx, state, opts);

  if (state.bubble) bubble(ctx, state.bubble.text, state.bubble.x);

  ctx.restore();
}

import { tipAtIndex, type BearTip } from './tips'

/** Attractants a Vermont camp visitor should secure before bears arrive. */
export type AttractantKind =
  | 'trash'
  | 'birdFeeder'
  | 'cooler'
  | 'grill'
  | 'petFood'

export type AttractantStatus = 'unsecured' | 'secured'

export type RoundOutcome = 'playing' | 'success' | 'habituated'

export type Rect = {
  x: number
  y: number
  w: number
  h: number
}

export type Attractant = {
  id: string
  kind: AttractantKind
  status: AttractantStatus
  label: string
  /** World-space AABB (y is up from ground). */
  x: number
  y: number
  w: number
  h: number
}

export type Bear = {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** Horizontal velocity (negative = left toward camp). */
  vx: number
  /** Attractant this bear is hunting, if any. */
  targetId: string | null
}

export type Player = {
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  onGround: boolean
  facing: 1 | -1
}

export type Platform = {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export type InputState = {
  left: boolean
  right: boolean
  jump: boolean
}

export type GameState = {
  phase: RoundOutcome
  player: Player
  platforms: Platform[]
  attractants: Attractant[]
  bears: Bear[]
  score: number
  elapsedMs: number
  tipIndex: number
  nextBearSeq: number
  nextSpawnAtMs: number
  habituatedAttractantId: string | null
  /** World width in game units. */
  worldWidth: number
  /** Camera left edge in world units (derived each tick). */
  cameraX: number
}

export type Rng = () => number

export const WORLD_WIDTH = 2200
export const VIEW_WIDTH = 640
export const VIEW_HEIGHT = 360
export const GROUND_Y = 0
export const GRAVITY = 2200
export const MOVE_SPEED = 220
export const JUMP_VELOCITY = 620
export const PLAYER_W = 28
export const PLAYER_H = 40
export const BEAR_W = 44
export const BEAR_H = 36
export const BEAR_BASE_SPEED = 70
export const BEAR_MAX_SPEED = 140
export const INITIAL_SPAWN_MS = 2800
export const MIN_SPAWN_MS = 1400
export const SECURE_SCORE = 100
export const TIME_BONUS_PER_SEC = 2

const ATTRACTANT_LAYOUT: ReadonlyArray<{
  kind: AttractantKind
  id: string
  label: string
  x: number
  y: number
}> = [
  { kind: 'trash', id: 'attract-trash', label: 'Trash', x: 320, y: 0 },
  { kind: 'birdFeeder', id: 'attract-bird', label: 'Bird feeder', x: 620, y: 72 },
  { kind: 'cooler', id: 'attract-cooler', label: 'Cooler', x: 980, y: 0 },
  { kind: 'grill', id: 'attract-grill', label: 'Grill', x: 1380, y: 0 },
  { kind: 'petFood', id: 'attract-pet', label: 'Pet food', x: 1750, y: 0 },
]

const PLATFORM_LAYOUT: ReadonlyArray<Platform> = [
  { id: 'ground', x: 0, y: -16, w: WORLD_WIDTH, h: 16 },
  { id: 'stump', x: 560, y: 56, w: 120, h: 16 },
  { id: 'picnic', x: 1100, y: 64, w: 160, h: 16 },
  { id: 'shed-roof', x: 1580, y: 80, w: 140, h: 16 },
]

export function defaultRng(): Rng {
  return Math.random
}

export function createSeededRng(seed: number): Rng {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function aabbOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  )
}

export function progress(elapsedMs: number): number {
  // Soft difficulty ramp over ~60s of play.
  return clamp(elapsedMs / 60_000, 0, 1)
}

export function bearSpeedForProgress(p: number, speedScale = 1): number {
  const eased = p * p
  return (BEAR_BASE_SPEED + (BEAR_MAX_SPEED - BEAR_BASE_SPEED) * eased) * speedScale
}

export function spawnIntervalForProgress(p: number): number {
  return INITIAL_SPAWN_MS - (INITIAL_SPAWN_MS - MIN_SPAWN_MS) * p
}

export type CreateInitialStateOptions = {
  tipIndex?: number
}

export function createInitialState(
  opts: CreateInitialStateOptions = {},
): GameState {
  const tipIndex = opts.tipIndex ?? 0
  const attractants: Attractant[] = ATTRACTANT_LAYOUT.map((a) => ({
    id: a.id,
    kind: a.kind,
    label: a.label,
    status: 'unsecured',
    x: a.x,
    y: a.y,
    w: 36,
    h: a.kind === 'birdFeeder' ? 48 : 32,
  }))

  return {
    phase: 'playing',
    player: {
      x: 48,
      y: 0,
      w: PLAYER_W,
      h: PLAYER_H,
      vx: 0,
      vy: 0,
      onGround: true,
      facing: 1,
    },
    platforms: PLATFORM_LAYOUT.map((p) => ({ ...p })),
    attractants,
    bears: [],
    score: 0,
    elapsedMs: 0,
    tipIndex,
    nextBearSeq: 1,
    nextSpawnAtMs: INITIAL_SPAWN_MS,
    habituatedAttractantId: null,
    worldWidth: WORLD_WIDTH,
    cameraX: 0,
  }
}

export function unsecuredAttractants(state: GameState): Attractant[] {
  return state.attractants.filter((a) => a.status === 'unsecured')
}

export function securedCount(state: GameState): number {
  return state.attractants.filter((a) => a.status === 'secured').length
}

export function totalAttractants(state: GameState): number {
  return state.attractants.length
}

export function allAttractantsSecured(state: GameState): boolean {
  return state.attractants.every((a) => a.status === 'secured')
}

export function selectTip(state: GameState): BearTip {
  return tipAtIndex(state.tipIndex)
}

export function selectTipByRound(round: number): BearTip {
  return tipAtIndex(round)
}

export function cameraForPlayer(playerX: number, worldWidth: number): number {
  const half = VIEW_WIDTH / 2
  return clamp(playerX - half + PLAYER_W / 2, 0, Math.max(0, worldWidth - VIEW_WIDTH))
}

function solidPlatforms(state: GameState): Platform[] {
  return state.platforms
}

function resolvePlayerPhysics(
  player: Player,
  platforms: Platform[],
  input: InputState,
  dt: number,
  speedScale: number,
): Player {
  const move = MOVE_SPEED * speedScale
  let vx = 0
  if (input.left) vx -= move
  if (input.right) vx += move
  let facing: 1 | -1 = player.facing
  if (vx > 0) facing = 1
  if (vx < 0) facing = -1

  let vy = player.vy - GRAVITY * dt
  let onGround = false
  if (input.jump && player.onGround) {
    vy = JUMP_VELOCITY * (0.85 + 0.15 * speedScale)
  }

  let x = player.x + vx * dt
  let y = player.y + vy * dt
  x = clamp(x, 0, WORLD_WIDTH - player.w)

  // Vertical resolve against platforms (from above).
  for (const p of platforms) {
    const wasAbove = player.y >= p.y + p.h - 0.1
    const overlappingX =
      x + player.w > p.x + 2 && x < p.x + p.w - 2
    if (wasAbove && overlappingX && y <= p.y + p.h && player.y >= p.y + p.h) {
      y = p.y + p.h
      vy = 0
      onGround = true
    }
  }

  // Ground floor
  if (y <= GROUND_Y) {
    y = GROUND_Y
    vy = 0
    onGround = true
  }

  return { ...player, x, y, vx, vy, onGround, facing }
}

function trySecureAttractants(
  state: GameState,
  player: Player,
): { attractants: Attractant[]; score: number; securedIds: string[] } {
  const securedIds: string[] = []
  let score = state.score
  const playerRect: Rect = {
    x: player.x,
    y: player.y,
    w: player.w,
    h: player.h,
  }
  const attractants = state.attractants.map((a) => {
    if (a.status === 'secured') return a
    if (!aabbOverlap(playerRect, a)) return a
    securedIds.push(a.id)
    score += SECURE_SCORE
    return { ...a, status: 'secured' as const }
  })
  return { attractants, score, securedIds }
}

function spawnBear(
  state: GameState,
  rng: Rng,
  speedScale: number,
): Bear | null {
  const targets = unsecuredAttractants(state)
  if (targets.length === 0) return null
  const target = targets[Math.floor(rng() * targets.length)]!
  const p = progress(state.elapsedMs)
  const speed = bearSpeedForProgress(p, speedScale)
  // Enter from the right edge ahead of the camera, or beyond world if needed.
  const spawnX = Math.min(
    state.worldWidth - BEAR_W,
    Math.max(state.cameraX + VIEW_WIDTH + 20, target.x + 180),
  )
  return {
    id: `bear-${state.nextBearSeq}`,
    x: spawnX,
    y: GROUND_Y,
    w: BEAR_W,
    h: BEAR_H,
    vx: -speed,
    targetId: target.id,
  }
}

function moveBears(state: GameState, dt: number): Bear[] {
  return state.bears.map((b) => {
    const target = state.attractants.find((a) => a.id === b.targetId)
    // If target already secured, wander left slowly toward player area.
    let vx = b.vx
    if (!target || target.status === 'secured') {
      vx = Math.min(vx, -BEAR_BASE_SPEED * 0.6)
    } else {
      // Home in on target x.
      const center = target.x + target.w / 2
      const bearCenter = b.x + b.w / 2
      if (bearCenter > center) vx = -Math.abs(b.vx)
      else vx = Math.abs(b.vx) * 0.35
    }
    return {
      ...b,
      x: clamp(b.x + vx * dt, 0, state.worldWidth - b.w),
      vx,
    }
  })
}

export type TickOptions = {
  rng?: Rng
  speedScale?: number
  input?: InputState
}

/**
 * Advance the side-scroller simulation by `deltaMs`.
 * Pure: returns a new state. UI owns the rAF/interval loop.
 */
export function tick(
  state: GameState,
  deltaMs: number,
  opts: TickOptions = {},
): GameState {
  if (state.phase !== 'playing') return state

  const rng = opts.rng ?? defaultRng()
  const speedScale = opts.speedScale ?? 1
  const input = opts.input ?? { left: false, right: false, jump: false }
  const dt = Math.min(deltaMs, 50) / 1000
  const elapsedMs = state.elapsedMs + deltaMs

  const player = resolvePlayerPhysics(
    state.player,
    solidPlatforms(state),
    input,
    dt,
    speedScale,
  )

  const secured = trySecureAttractants(state, player)
  const next: GameState = {
    ...state,
    elapsedMs,
    player,
    attractants: secured.attractants,
    score: secured.score,
    cameraX: cameraForPlayer(player.x, state.worldWidth),
  }

  if (allAttractantsSecured(next)) {
    const timeBonus = Math.floor((elapsedMs / 1000) * TIME_BONUS_PER_SEC)
    return {
      ...next,
      phase: 'success',
      score: next.score + Math.max(0, 200 - timeBonus),
      bears: [],
    }
  }

  let bears = moveBears(next, dt)
  let nextSpawnAtMs = next.nextSpawnAtMs
  let nextBearSeq = next.nextBearSeq

  if (elapsedMs >= nextSpawnAtMs) {
    const spawned = spawnBear(
      { ...next, bears, cameraX: next.cameraX },
      rng,
      speedScale,
    )
    if (spawned) {
      bears = [...bears, spawned]
      nextBearSeq += 1
    }
    const p = progress(elapsedMs)
    nextSpawnAtMs = elapsedMs + spawnIntervalForProgress(p)
  }

  // Player ↔ bear collision → habituated
  const playerRect: Rect = {
    x: player.x + 4,
    y: player.y + 4,
    w: player.w - 8,
    h: player.h - 8,
  }
  for (const b of bears) {
    if (
      aabbOverlap(playerRect, {
        x: b.x + 4,
        y: b.y,
        w: b.w - 8,
        h: b.h,
      })
    ) {
      return {
        ...next,
        phase: 'habituated',
        bears,
        nextBearSeq,
        nextSpawnAtMs,
        habituatedAttractantId: b.targetId,
      }
    }
  }

  // Bear reaches unsecured attractant → habituated
  for (const b of bears) {
    const target = next.attractants.find((a) => a.id === b.targetId)
    if (!target || target.status === 'secured') continue
    if (
      aabbOverlap(
        { x: b.x, y: b.y, w: b.w, h: b.h },
        { x: target.x, y: target.y, w: target.w, h: target.h },
      )
    ) {
      return {
        ...next,
        phase: 'habituated',
        bears,
        nextBearSeq,
        nextSpawnAtMs,
        habituatedAttractantId: target.id,
      }
    }
  }

  return {
    ...next,
    bears,
    nextBearSeq,
    nextSpawnAtMs,
  }
}

/** True when this tick newly secured at least one attractant (for SFX). */
export function newlySecuredIds(
  prev: GameState,
  next: GameState,
): string[] {
  const prevSecured = new Set(
    prev.attractants.filter((a) => a.status === 'secured').map((a) => a.id),
  )
  return next.attractants
    .filter((a) => a.status === 'secured' && !prevSecured.has(a.id))
    .map((a) => a.id)
}

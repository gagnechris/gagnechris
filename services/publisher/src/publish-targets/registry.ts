import type { PublishTarget } from './types.js';

const targets: PublishTarget[] = [];

/** Register a publish target (bootstrap glob or explicit demo modules). */
export function definePublishTarget(target: PublishTarget): PublishTarget {
  const existing = targets.findIndex((t) => t.id === target.id);
  if (existing >= 0) {
    targets[existing] = target;
  } else {
    targets.push(target);
  }
  return target;
}

export function getPublishTargets(): readonly PublishTarget[] {
  return targets;
}

/** Vitest isolation — production loads targets once via bootstrap. */
export function resetPublishTargetsForTest(): void {
  targets.length = 0;
}

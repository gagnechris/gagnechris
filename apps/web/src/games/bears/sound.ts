/** Tiny Web Audio blips for Don't Feed the Bears (off until the player toggles). */

type Tone = {
  freq: number;
  durationMs: number;
  type?: OscillatorType;
  gain?: number;
};

let sharedCtx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return null;
    sharedCtx ??= new Ctx();
    return sharedCtx;
  } catch {
    return null;
  }
}

async function resumeIfNeeded(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* autoplay policy — stay silent */
    }
  }
}

function playTones(tones: Tone[]): void {
  const ctx = audioContext();
  if (!ctx) return;
  void resumeIfNeeded(ctx).then(() => {
    const now = ctx.currentTime;
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type ?? 'sine';
      osc.frequency.value = tone.freq;
      const peak = tone.gain ?? 0.08;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + tone.durationMs / 1000,
      );
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + tone.durationMs / 1000 + 0.02);
    }
  });
}

/** Short bright blip when an attractant is secured. */
export function playSecureSound(): void {
  playTones([
    { freq: 520, durationMs: 70, type: 'triangle', gain: 0.07 },
    { freq: 780, durationMs: 90, type: 'triangle', gain: 0.05 },
  ]);
}

/** Soft low thud when a bear gets a snack. */
export function playFailSound(): void {
  playTones([
    { freq: 110, durationMs: 180, type: 'sine', gain: 0.1 },
    { freq: 80, durationMs: 220, type: 'triangle', gain: 0.06 },
  ]);
}

/** Light success chime when the camp is fully secured. */
export function playSuccessSound(): void {
  playTones([
    { freq: 440, durationMs: 90, type: 'sine', gain: 0.06 },
    { freq: 554, durationMs: 110, type: 'sine', gain: 0.06 },
    { freq: 659, durationMs: 140, type: 'sine', gain: 0.05 },
  ]);
}

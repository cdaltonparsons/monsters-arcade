/**
 * Sound effects made by the browser's built-in synthesiser, so there are no
 * audio files to find or license yet.
 */
let audio: AudioContext | undefined;

function beep(frequency: number, startIn: number, duration: number, volume = 0.2, endFrequency = frequency): void {
  // Browsers only allow sound after a tap. Every sound here follows a tap.
  audio ??= new AudioContext();
  if (audio.state === 'suspended') void audio.resume();

  const start = audio.currentTime + startIn;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

export const sfx = {
  tap: () => beep(520, 0, 0.08, 0.12),
  /** Rises in pitch with `combo`, so chain reactions sound more exciting. */
  pop: (combo = 0) => {
    const base = 440 * 2 ** (Math.min(combo, 8) / 6);
    beep(base, 0, 0.16, 0.22, base * 2);
  },
  boing: () => beep(300, 0, 0.18, 0.12, 170),
  /** A baby monster joins the line. */
  chirp: () => {
    beep(700, 0, 0.1, 0.18, 1100);
    beep(900, 0.11, 0.14, 0.18, 1500);
  },
  star: () => beep(990, 0, 0.12, 0.14, 1400),
  coin: () => {
    beep(1320, 0, 0.07, 0.14);
    beep(1760, 0.07, 0.14, 0.14);
  },
  /** Something moving in the leaves. Quiet, so it's a clue and not an alarm. */
  rustle: () => {
    beep(240, 0, 0.07, 0.07, 170);
    beep(280, 0.08, 0.07, 0.07, 200);
  },
  thud: () => beep(170, 0, 0.1, 0.14, 110),
  /** A little jump, rising then landing. */
  hop: () => beep(380, 0, 0.12, 0.1, 640),
  /** Two falling notes, for "watch out!" moments. Gentle, never scary. */
  uhOh: () => {
    beep(660, 0, 0.16, 0.16, 620);
    beep(500, 0.18, 0.24, 0.16, 440);
  },
  party: () => [523, 659, 784, 1047].forEach((note, i) => beep(note, i * 0.11, 0.25)),
};

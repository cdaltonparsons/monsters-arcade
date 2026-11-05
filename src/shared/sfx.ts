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
  party: () => [523, 659, 784, 1047].forEach((note, i) => beep(note, i * 0.11, 0.25)),
};

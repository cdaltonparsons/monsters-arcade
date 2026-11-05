import { describe, expect, it } from 'vitest';
import { avatarSvg, cleanAvatar, DEFAULT_AVATAR, OPTIONS, PARTS, randomAvatar } from './avatar';

describe('avatarSvg', () => {
  it('draws every choice of every part', () => {
    for (const part of PARTS) {
      for (const choice of OPTIONS[part]) {
        const svg = avatarSvg({ ...DEFAULT_AVATAR, [part]: choice }, 1, 100);
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg.trim().endsWith('</svg>')).toBe(true);
        expect(svg).not.toMatch(/undefined|NaN/);
      }
    }
  });

  it('gives each choice its own look', () => {
    for (const part of PARTS) {
      const pictures = OPTIONS[part].map((choice) => avatarSvg({ ...DEFAULT_AVATAR, [part]: choice }, 1, 100));
      expect(new Set(pictures).size).toBe(OPTIONS[part].length);
    }
  });

  it('moves the feet between frames', () => {
    expect(avatarSvg(DEFAULT_AVATAR, 1, 100)).not.toBe(avatarSvg(DEFAULT_AVATAR, 2, 100));
  });
});

describe('cleanAvatar', () => {
  it('keeps good choices and replaces bad ones', () => {
    const avatar = cleanAvatar({ body: 'ghost', eyes: 'nine', top: 7 });
    expect(avatar.body).toBe('ghost');
    expect(avatar.eyes).toBe(DEFAULT_AVATAR.eyes);
    expect(avatar.top).toBe(DEFAULT_AVATAR.top);
  });

  it('copes with junk', () => {
    expect(cleanAvatar(null)).toEqual(DEFAULT_AVATAR);
    expect(cleanAvatar('monster')).toEqual(DEFAULT_AVATAR);
  });
});

describe('randomAvatar', () => {
  it('only picks real choices, even at the ends of the range', () => {
    for (const value of [0, 0.5, 0.999]) {
      const avatar = randomAvatar(() => value);
      expect(cleanAvatar(avatar)).toEqual(avatar);
    }
  });
});

import Phaser from 'phaser';
import { avatarSvg, buddyFor, cleanAvatar, type Avatar } from './avatar';

const SAVE_KEY = 'monster-avatar';

export function loadAvatar(): Avatar {
  try {
    return cleanAvatar(JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null'));
  } catch {
    return cleanAvatar(null);
  }
}

export function saveAvatar(avatar: Avatar): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(avatar));
}

/** Turns an SVG string into a texture Phaser can draw, by way of a normal <img>. */
export async function addSvgTexture(game: Phaser.Game, key: string, svg: string): Promise<void> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  if (game.textures.exists(key)) game.textures.remove(key);
  game.textures.addImage(key, image);
}

/**
 * Makes the pictures that Hero.ts and the menu use: `hero-1`, `hero-2` and
 * `hero-big`, plus `buddy-1` and `buddy-2` for player 2's monster. Anything still showing the old pictures must be gone first, so this
 * runs while moving between scenes.
 */
export async function applyAvatar(game: Phaser.Game, avatar: Avatar): Promise<void> {
  // The animation remembers the old pictures, so Hero.ts builds a new one.
  game.anims.remove('hero-walk');
  game.anims.remove('buddy-walk');
  const buddy = buddyFor(avatar);
  await Promise.all([
    addSvgTexture(game, 'buddy-1', avatarSvg(buddy, 1, 180)),
    addSvgTexture(game, 'buddy-2', avatarSvg(buddy, 2, 180)),
    addSvgTexture(game, 'hero-1', avatarSvg(avatar, 1, 180)),
    addSvgTexture(game, 'hero-2', avatarSvg(avatar, 2, 180)),
    addSvgTexture(game, 'hero-big', avatarSvg(avatar, 1, 320)),
  ]);
}

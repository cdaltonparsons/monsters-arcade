import type Phaser from 'phaser';
import { farm } from './games/farm';
import { match3 } from './games/match3';
import { quest } from './games/quest';

/** Everything the arcade needs to know about a game. */
export interface GameEntry {
  /** The Phaser scene key that starts this game. */
  sceneKey: string;
  title: string;
  /** Texture key of the picture on the menu button. */
  icon: string;
  scene: typeof Phaser.Scene;
}

/** To add a game: make a folder in src/games, then add it to this list. */
export const games: GameEntry[] = [match3, quest, farm];

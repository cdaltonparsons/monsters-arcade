import type Phaser from 'phaser';
import { chess } from './games/chess';
import { farm } from './games/farm';
import { hideSeek } from './games/hideseek';
import { maker } from './games/maker';
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
export const games: GameEntry[] = [maker, quest, hideSeek, farm, chess, match3];

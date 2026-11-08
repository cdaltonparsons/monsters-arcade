import type { GameEntry } from '../../games';
import { ChessScene } from './ChessScene';

export const chess: GameEntry = {
  sceneKey: ChessScene.KEY,
  title: 'Monster Chess',
  icon: 'icon-chess',
  scene: ChessScene,
};

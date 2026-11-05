/**
 * The game draws on a "stage" that is always 1080 wide. Phaser scales the stage
 * to fit the screen, so game code never has to think about phone sizes (the
 * opposite of responsive CSS). The height follows the phone's shape when the app
 * opens, so tall phones don't get empty bars at the top and bottom.
 */
export const GAME_WIDTH = 1080;
export const GAME_HEIGHT = Math.round(
  GAME_WIDTH * Math.min(Math.max(window.innerHeight / window.innerWidth, 16 / 9), 21 / 9),
);

/** Matches the page background in index.html. */
export const BACKGROUND = '#fff4d6';
export const INK = '#4a3470';
export const FONT = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';

/** Screen-fixed things draw above the world, whose depth is its y position. */
export const HUD_DEPTH = 100000;

# monsters-arcade

Ad-free games for the monsters, ages 2 and 5. One app, with a game picker and a
folder per game. Built with [Phaser](https://phaser.io), Vite and TypeScript.
It runs in a browser for now, and Capacitor will wrap it into an Android APK later.

## Run it

```bash
npm install
npm run dev
```

`npm run dev` also prints a Network URL. Open that on your phone, on the same
Wi-Fi, to play on a real touchscreen.

```bash
npm test
```

Runs the rules tests. `npm run build` type-checks and builds to `dist/`.

## Where things live

```
src/
  main.ts         Starts Phaser
  games.ts        The list of games. The menu builds itself from this
  menu/           The game picker
  shared/         Monster art, sounds and buttons that any game can use
  games/
    match3/
      board.ts    The rules, as plain functions over a grid of numbers
      Match3Scene.ts   Drawing, input and animation
```

To add a game, make a folder in `src/games/` with a scene in it, then add it to
`src/games.ts`.

## Coming from Angular

| In Angular | In Phaser |
| --- | --- |
| Route | Scene (`this.scene.start('menu')`) |
| Template and change detection | You create objects and change them directly, then Phaser redraws every frame |
| CSS transition | Tween (`this.tweens.add(...)`) |
| Responsive layout | A fixed 1080x1920 stage that Phaser scales to fit the screen |
| z-index | `setDepth()` |
| Wrapper `div` | Container |

The habit worth keeping is separating rules from drawing. `board.ts` knows nothing
about Phaser, so it can be unit tested like any service.

## House rules for toddler games

- Big targets, and forgiving input. Sloppy taps should still land somewhere.
- No timers, no lives, no way to lose. A wrong move just hops back.
- Every tap gets a reaction.
- No ads, no network, no in-app purchases.

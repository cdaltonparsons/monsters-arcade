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
  shared/         Art, sounds, the walking hero, joystick and arrow, for any game
  games/
    match3/
      board.ts    The rules, as plain functions over a grid of numbers
      Match3Scene.ts   Drawing, input and animation
    quest/
      world.ts    Decides where everything goes in the world
      QuestScene.ts    The babies, the stars and the game loop
    maker/
      MakerScene.ts    Build your own monster, from the parts in shared/avatar.ts
    farm/
      farm.ts     The rules: carrying, machines, money and upgrades
      FarmScene.ts     The fields, machines, stand and customers
    hideseek/
      rules.ts    The rules: hiding spots, hints and where the seeker looks
      HideSeekScene.ts  The field and the "who's hiding?" cards
      SeekMode.ts      You find the friends
      HideMode.ts      You hide, and a monster comes looking
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

Monster Match waits for taps, a lot like a web app. Monster Quest shows the other
style, the game loop: Phaser calls `update()` about 60 times a second, and each call
reads the controls, sets the hero's speed, and checks what the hero has reached.
Physics does the moving and the bumping. On a computer, the arrow keys also work.

Monster Quest and Hide and Seek also have two players on one screen. Tap the
button with both monsters under the home button. The screen splits down the middle:
each half has its own joystick (each one tracks its own finger by `pointer.id`), and
on a laptop the first monster uses WASD and the second uses the arrow keys, and the
joysticks stay hidden. It's
co-op: one shared star pile, and if the second player lets go, their monster trots
back to the first, so a toddler can never get lost. Neither monster can walk off the
shared screen. In "You hide", the seeker waits until both are hidden.
`shared/Team.ts` runs the one-or-two monsters for any walking game, and the plain
rules it uses are in `shared/coop.ts`.

The habit worth keeping is separating rules from drawing. `board.ts`, `world.ts`,
`farm.ts` and `rules.ts` know nothing about Phaser, so they can be unit tested like
any service.

## House rules for toddler games

- Big targets, and forgiving input. Sloppy taps should still land somewhere.
- No timers, no lives, no way to lose. A wrong move just hops back.
- Every tap gets a reaction.
- No ads, no network, no in-app purchases.

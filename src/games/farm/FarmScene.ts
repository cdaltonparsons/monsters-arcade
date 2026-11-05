import Phaser from 'phaser';
import { MONSTERS } from '../../shared/assets';
import { FONT, HUD_DEPTH } from '../../shared/constants';
import { GoalArrow } from '../../shared/GoalArrow';
import { drawGrass } from '../../shared/ground';
import { Hero } from '../../shared/Hero';
import { Joystick } from '../../shared/Joystick';
import { sfx } from '../../shared/sfx';
import { addHomeButton, burstStars } from '../../shared/ui';
import appleItem from './art/apple-item.svg?url';
import applePlant from './art/apple-plant.svg?url';
import backpack from './art/backpack.svg?url';
import bread from './art/bread.svg?url';
import coin from './art/coin.svg?url';
import machine from './art/machine.svg?url';
import pie from './art/pie.svg?url';
import sauce from './art/sauce.svg?url';
import stand from './art/stand.svg?url';
import tomatoItem from './art/tomato-item.svg?url';
import tomatoPlant from './art/tomato-plant.svg?url';
import wheatItem from './art/wheat-item.svg?url';
import wheat from './art/wheat.svg?url';
import {
  buy,
  carryLimit,
  collect,
  createFarm,
  CROPS,
  dropOff,
  harvest,
  hasCrop,
  isFull,
  nextJob,
  processOne,
  RECIPES,
  sellOne,
  UPGRADES,
  type Crop,
  type Farm,
  type Item,
  type SavedFarm,
  type UpgradeId,
} from './farm';

// Tweak these to change how the game feels.
const WORLD_WIDTH = 1800;
const WORLD_HEIGHT = 3400;
const REGROW_MS = 3500;
const MACHINE_MS = 700; // How long a machine takes per item.
const TRANSFER_MS = 110; // The gap between items moving on and off the hero.
const HARVEST_REACH = 110;
const MAT_RADIUS = 130;
const SAVE_KEY = 'monster-farm-save';

// The map reads top to bottom: field, machine, then the stand at the bottom.
const COLUMN: Record<Crop, number> = { tomato: 330, wheat: 900, apple: 1470 };
const FIELD_Y = 520;
const INPUT_Y = 1010;
const MACHINE_Y = 1520;
const TRAY_Y = 1760;
const SELL = { x: 900, y: 2640 };
const STAND = { x: 900, y: 3020 };
const START = { x: 900, y: 2200 };
const BACKPACK_PADS: Partial<Record<UpgradeId, { x: number; y: number }>> = {
  backpack: { x: 300, y: 2640 },
  'big-backpack': { x: 1500, y: 2640 },
};

const ITEM_TEXTURE: Record<Item, string> = {
  wheat: 'farm-wheat-item',
  tomato: 'farm-tomato-item',
  apple: 'farm-apple-item',
  bread: 'farm-bread',
  sauce: 'farm-sauce',
  pie: 'farm-pie',
};
const PLANT_TEXTURE: Record<Crop, string> = {
  wheat: 'farm-wheat',
  tomato: 'farm-tomato-plant',
  apple: 'farm-apple-plant',
};
const MACHINE_TINT: Record<Crop, number> = { wheat: 0xffe9b0, tomato: 0xffc4c0, apple: 0xfff27a };

interface Plant {
  image: Phaser.GameObjects.Image;
  crop: Crop;
  ripe: boolean;
}

interface Pad {
  id: UpgradeId;
  x: number;
  y: number;
  parts: Phaser.GameObjects.GameObject[];
  ring: Phaser.GameObjects.Arc;
}

/**
 * A farm you walk around. Like Monster Quest, everything runs from update(), about
 * 60 times a second. The rules are in farm.ts: this class draws them, and works
 * out what the hero is standing on.
 */
export class FarmScene extends Phaser.Scene {
  static readonly KEY = 'farm';

  private farm!: Farm;
  private hero!: Hero;
  private joystick!: Joystick;
  private arrow!: GoalArrow;

  private plants!: Plant[];
  private pads!: Pad[];
  private machines!: Partial<Record<Crop, Phaser.GameObjects.Image>>;
  private mats!: Partial<Record<Crop, Phaser.GameObjects.GameObject[]>>;
  private blockers!: Phaser.Physics.Arcade.StaticGroup;
  private customers!: Phaser.GameObjects.Image[];

  private stack!: Phaser.GameObjects.Image[];
  private piles!: Phaser.GameObjects.Image[];
  private coinLabel!: Phaser.GameObjects.Text;

  private nextTransferAt!: number;
  private machineReadyAt!: Record<Crop, number>;
  private lastFullBuzzAt!: number;

  constructor() {
    super({ key: FarmScene.KEY, physics: { arcade: {} } });
  }

  preload(): void {
    const art = (key: string, url: string, width: number, height = width) =>
      this.load.svg(`farm-${key}`, url, { width, height });
    art('wheat', wheat, 150);
    art('tomato-plant', tomatoPlant, 150);
    art('apple-plant', applePlant, 150);
    art('wheat-item', wheatItem, 90);
    art('tomato-item', tomatoItem, 90);
    art('apple-item', appleItem, 90);
    art('bread', bread, 90);
    art('sauce', sauce, 90);
    art('pie', pie, 90);
    art('machine', machine, 320, 340);
    art('stand', stand, 520, 420);
    art('coin', coin, 90);
    art('backpack', backpack, 110);
  }

  create(): void {
    this.farm = createFarm(this.loadSave());
    this.plants = [];
    this.pads = [];
    this.machines = {};
    this.mats = {};
    this.customers = [];
    this.stack = [];
    this.piles = [];
    this.nextTransferAt = 0;
    this.lastFullBuzzAt = 0;
    this.machineReadyAt = { wheat: 0, tomato: 0, apple: 0 };

    drawGrass(this, WORLD_WIDTH, WORLD_HEIGHT);
    this.blockers = this.physics.add.staticGroup();
    this.addScenery();
    this.addStand();
    for (const crop of CROPS) {
      if (hasCrop(this.farm, crop)) this.addCropColumn(crop);
    }
    this.addPads();

    this.hero = new Hero(this, START.x, START.y);
    this.physics.add.collider(this.hero.sprite, this.blockers);
    this.cameras.main.startFollow(this.hero.sprite, true, 0.12, 0.12);

    this.addHud();
    this.joystick = new Joystick(this);
    this.arrow = new GoalArrow(this);
  }

  // ---------------------------------------------------------------- Building the farm

  private addScenery(): void {
    // Trees along the edges, just for looks. You can walk behind these.
    for (let y = 150; y < WORLD_HEIGHT; y += 420) {
      for (const x of [20, WORLD_WIDTH - 20]) {
        this.add.image(x, y, 'scenery-tree').setOrigin(0.5, 0.9).setDepth(y);
      }
    }
  }

  /** Adds an invisible solid circle: the part of a building you bump into. */
  private addBlocker(x: number, y: number, radius: number): void {
    const blocker = this.add.circle(x, y, radius).setVisible(false);
    this.blockers.add(blocker);
    (blocker.body as Phaser.Physics.Arcade.StaticBody).setCircle(radius);
  }

  /** A crop's whole line: its field, its drop-off mat, its machine, and its tray. */
  private addCropColumn(crop: Crop): void {
    const x = COLUMN[crop];
    const product = RECIPES[crop].product;

    this.add.rectangle(x, FIELD_Y, 500, 500, 0x9c6b3f).setDepth(-0.5).setStrokeStyle(14, 0x7d5230);
    for (let row = -1; row <= 1; row++) {
      for (let col = -1; col <= 1; col++) {
        const y = FIELD_Y + row * 155;
        const image = this.add
          .image(x + col * 155, y, PLANT_TEXTURE[crop])
          .setOrigin(0.5, 0.75)
          .setDepth(y);
        this.plants.push({ image, crop, ripe: true });
      }
    }

    const parts = [
      ...this.addMat(x, INPUT_Y, 0xffd23f, ITEM_TEXTURE[crop]),
      ...this.addMat(x, TRAY_Y, 0x6fe08c, ITEM_TEXTURE[product]),
    ];
    this.mats[crop] = parts;

    const machineImage = this.add
      .image(x, MACHINE_Y, 'farm-machine')
      .setOrigin(0.5, 0.9)
      .setDepth(MACHINE_Y)
      .setTint(MACHINE_TINT[crop]);
    this.machines[crop] = machineImage;
    this.addBlocker(x, MACHINE_Y, 110);
    // A picture on top says what the machine makes.
    this.add.image(x, MACHINE_Y - 330, ITEM_TEXTURE[product]).setDepth(MACHINE_Y + 1).setScale(1.2);
  }

  /** A coloured circle on the ground. A faint picture says what goes here. */
  private addMat(x: number, y: number, colour: number, itemTexture: string): Phaser.GameObjects.GameObject[] {
    const mat = this.add.circle(x, y, MAT_RADIUS, colour, 0.55).setDepth(-0.4).setStrokeStyle(12, colour);
    this.tweens.add({ targets: mat, scale: 1.06, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const icon = this.add.image(x, y, itemTexture).setAlpha(0.45).setDepth(-0.3).setScale(1.4);
    return [mat, icon];
  }

  private addStand(): void {
    this.addMat(SELL.x, SELL.y, 0xffc928, 'farm-coin');
    this.add.image(STAND.x, STAND.y, 'farm-stand').setOrigin(0.5, 0.75).setDepth(STAND.y);
    this.addBlocker(STAND.x, STAND.y, 190);
    for (let i = 0; i < 3; i++) this.addCustomer(i, false);
  }

  private customerSpot(place: number): { x: number; y: number } {
    return { x: SELL.x + 340 + place * 170, y: SELL.y + 260 };
  }

  private addCustomer(place: number, walkIn: boolean): void {
    const texture = Phaser.Utils.Array.GetRandom(MONSTERS) as string;
    const { x, y } = this.customerSpot(place);
    const image = this.add.image(walkIn ? x + 300 : x, y, texture).setDisplaySize(130, 130).setDepth(y);
    this.customers.push(image);
    if (walkIn) this.tweens.add({ targets: image, x, duration: 400 });
  }

  /** The front customer takes the item and skips off, and everyone shuffles along. */
  private serveCustomer(item: Item): void {
    const served = this.customers.shift()!;
    this.flyItem(item, this.hero.sprite, served);
    this.tweens.killTweensOf(served);
    this.tweens.add({
      targets: served,
      y: served.y + 500,
      x: served.x - 200,
      alpha: 0,
      duration: 700,
      delay: 150,
      onComplete: () => served.destroy(),
    });
    this.customers.forEach((customer, place) => {
      this.tweens.killTweensOf(customer);
      this.tweens.add({ targets: customer, x: this.customerSpot(place).x, duration: 200 });
    });
    this.addCustomer(this.customers.length, true);
  }

  /** Things to buy: stand on one with enough coins and it's yours. */
  private addPads(): void {
    for (const { id, crop, cost } of UPGRADES) {
      if (this.farm.bought.includes(id)) continue;
      const spot = crop ? { x: COLUMN[crop], y: FIELD_Y } : BACKPACK_PADS[id]!;
      const ring = this.add
        .circle(spot.x, spot.y, MAT_RADIUS + 20, 0xffffff, 0.45)
        .setStrokeStyle(12, 0xffffff)
        .setDepth(-0.4);
      const icon = this.add
        .image(spot.x, spot.y - 45, crop ? PLANT_TEXTURE[crop] : 'farm-backpack')
        .setDepth(-0.3);
      const price = this.add.image(spot.x - 45, spot.y + 70, 'farm-coin').setScale(0.7).setDepth(-0.3);
      const label = this.add
        .text(spot.x - 5, spot.y + 70, String(cost), {
          fontFamily: FONT,
          fontSize: '64px',
          color: '#ffffff',
          stroke: '#4a3470',
          strokeThickness: 10,
        })
        .setOrigin(0, 0.5)
        .setDepth(-0.3);
      this.pads.push({ id, ...spot, ring, parts: [ring, icon, price, label] });
    }
  }

  private addHud(): void {
    addHomeButton(this).setScrollFactor(0).setDepth(HUD_DEPTH);
    this.add.image(770, 100, 'farm-coin').setScrollFactor(0).setDepth(HUD_DEPTH);
    this.coinLabel = this.add
      .text(830, 100, String(this.farm.coins), {
        fontFamily: FONT,
        fontSize: '80px',
        color: '#ffffff',
        stroke: '#4a3470',
        strokeThickness: 12,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
  }

  // ---------------------------------------------------------------- The game loop

  update(time: number): void {
    this.hero.walk(this.joystick.read());
    this.harvestPlants();
    if (time >= this.nextTransferAt) this.workMats(time);
    this.runMachines(time);
    this.drawStack();
    this.arrow.point(this.hero.sprite, this.goalPoint());
  }

  private isStandingOn(spot: { x: number; y: number }, reach = MAT_RADIUS + 30): boolean {
    const { x, y } = this.hero.feet;
    return Math.hypot(x - spot.x, y - spot.y) < reach;
  }

  /** Walk through a ripe plant to pick it. It grows back after a little while. */
  private harvestPlants(): void {
    for (const plant of this.plants) {
      if (!plant.ripe || !this.isStandingOn(plant.image, HARVEST_REACH)) continue;
      if (!harvest(this.farm, plant.crop)) {
        this.buzzFull();
        return;
      }
      plant.ripe = false;
      sfx.tap();
      this.refreshStack();
      plant.image.setScale(0.2).setAlpha(0.7);
      this.tweens.add({
        targets: plant.image,
        scale: 1,
        alpha: 1,
        duration: REGROW_MS,
        ease: 'Sine.easeIn',
        onComplete: () => {
          plant.ripe = true;
        },
      });
    }
  }

  /** Full hands: the stack wobbles, so a child can see why nothing is happening. */
  private buzzFull(): void {
    if (this.time.now - this.lastFullBuzzAt < 900) return;
    this.lastFullBuzzAt = this.time.now;
    sfx.boing();
    this.tweens.add({ targets: this.stack, angle: { from: -12, to: 12 }, duration: 80, yoyo: true, repeat: 2 });
  }

  /** Whatever mat the hero is on, move one item on or off, then wait a moment. */
  private workMats(time: number): void {
    const moved = this.workCropMats() || this.workStand() || this.workPads();
    if (moved) this.nextTransferAt = time + TRANSFER_MS;
  }

  private workCropMats(): boolean {
    for (const crop of CROPS) {
      if (!hasCrop(this.farm, crop)) continue;
      const x = COLUMN[crop];

      if (this.isStandingOn({ x, y: INPUT_Y }) && dropOff(this.farm, crop)) {
        this.flyItem(crop, this.hero.sprite, { x, y: INPUT_Y });
        sfx.tap();
        this.refreshStack();
        this.drawPiles();
        return true;
      }
      if (this.isStandingOn({ x, y: TRAY_Y })) {
        if (collect(this.farm, crop)) {
          this.flyItem(RECIPES[crop].product, { x, y: TRAY_Y }, this.hero.sprite);
          sfx.tap();
          this.refreshStack();
          this.drawPiles();
          return true;
        }
        if (this.farm.stations[crop].ready > 0 && isFull(this.farm)) this.buzzFull();
      }
    }
    return false;
  }

  private workStand(): boolean {
    if (!this.isStandingOn(SELL)) return false;
    const sold = sellOne(this.farm);
    if (!sold) return false;
    this.serveCustomer(sold);
    sfx.coin();
    burstStars(this, SELL.x, SELL.y, 4);
    this.refreshStack();
    this.showCoins();
    this.save();
    return true;
  }

  private workPads(): boolean {
    const pad = this.pads.find((candidate) => this.isStandingOn(candidate, MAT_RADIUS));
    if (!pad || !buy(this.farm, pad.id)) return false;

    this.pads = this.pads.filter((candidate) => candidate !== pad);
    pad.parts.forEach((part) => part.destroy());
    sfx.party();
    burstStars(this, pad.x, pad.y, 20);
    this.showCoins();
    this.save();

    const crop = UPGRADES.find((upgrade) => upgrade.id === pad.id)!.crop;
    if (crop) this.addCropColumn(crop);
    return true;
  }

  /** Each machine takes one crop at a time, and wobbles while it works. */
  private runMachines(time: number): void {
    for (const crop of CROPS) {
      const machineImage = this.machines[crop];
      if (!machineImage || time < this.machineReadyAt[crop]) continue;
      if (this.farm.stations[crop].waiting === 0) continue;

      if (this.machineReadyAt[crop] === 0) {
        this.startMachine(crop, machineImage, time);
        continue;
      }
      processOne(this.farm, crop);
      this.machineReadyAt[crop] = 0;
      burstStars(this, COLUMN[crop], MACHINE_Y - 100, 3);
      sfx.pop(2);
      this.drawPiles();
      if (this.farm.stations[crop].waiting > 0) this.startMachine(crop, machineImage, time);
    }
  }

  private startMachine(crop: Crop, machineImage: Phaser.GameObjects.Image, time: number): void {
    this.machineReadyAt[crop] = time + MACHINE_MS;
    this.tweens.add({
      targets: machineImage,
      scaleY: 1.08,
      scaleX: 0.95,
      duration: MACHINE_MS / 4,
      yoyo: true,
      repeat: 1,
      onComplete: () => machineImage.setScale(1),
    });
  }

  // ---------------------------------------------------------------- Drawing

  /** Sends a picture of an item through the air, purely for show. */
  private flyItem(item: Item, from: { x: number; y: number }, to: { x: number; y: number }): void {
    const image = this.add.image(from.x, from.y - 60, ITEM_TEXTURE[item]).setDepth(HUD_DEPTH - 2);
    this.tweens.add({
      targets: image,
      x: to.x,
      y: to.y,
      scale: 0.7,
      duration: 200,
      ease: 'Sine.easeIn',
      onComplete: () => image.destroy(),
    });
  }

  /** Rebuilds the pile on the hero's head. Call it whenever `carried` changes. */
  private refreshStack(): void {
    this.tweens.killTweensOf(this.stack);
    this.stack.forEach((image) => image.destroy());
    this.stack = this.farm.carried.map((item) => this.add.image(0, 0, ITEM_TEXTURE[item]).setScale(0.85));
  }

  /** Runs every frame, so the pile sways along behind the hero. */
  private drawStack(): void {
    const { x, y } = this.hero.sprite;
    const velocity = this.hero.sprite.body!.velocity.x;
    const spacing = Math.min(46, 460 / Math.max(carryLimit(this.farm), 1));
    this.stack.forEach((image, index) => {
      const lean = (velocity / 560) * -7 * index;
      image.setPosition(x + lean, y - 110 - index * spacing).setDepth(y + 70 + index);
    });
  }

  /** Redraws what's waiting at each machine and sitting on each tray. */
  private drawPiles(): void {
    this.piles.forEach((image) => image.destroy());
    this.piles = [];
    for (const crop of CROPS) {
      const { waiting, ready } = this.farm.stations[crop];
      this.addPile(COLUMN[crop], INPUT_Y, ITEM_TEXTURE[crop], waiting);
      this.addPile(COLUMN[crop], TRAY_Y, ITEM_TEXTURE[RECIPES[crop].product], ready);
    }
  }

  private addPile(x: number, y: number, texture: string, count: number): void {
    const shown = Math.min(count, 12);
    for (let i = 0; i < shown; i++) {
      const column = i % 4;
      const row = Math.floor(i / 4);
      const image = this.add
        .image(x - 90 + column * 60, y - 45 + row * 45, texture)
        .setScale(0.7)
        .setDepth(y + row);
      this.piles.push(image);
    }
  }

  private showCoins(): void {
    this.coinLabel.setText(String(this.farm.coins));
    this.tweens.add({ targets: this.coinLabel, scale: 1.25, duration: 70, yoyo: true });
  }

  private goalPoint(): { x: number; y: number } {
    const job = nextJob(this.farm);
    switch (job.kind) {
      case 'machine':
        return { x: COLUMN[job.crop], y: INPUT_Y };
      case 'tray':
        return { x: COLUMN[job.crop], y: TRAY_Y };
      case 'field':
        return { x: COLUMN[job.crop], y: FIELD_Y };
      case 'stand':
        return SELL;
      case 'buy':
        return this.pads.find((pad) => pad.id === job.id) ?? SELL;
    }
  }

  // ---------------------------------------------------------------- Saving

  /** Coins and purchases stay on the phone, so the farm is there next time. */
  private loadSave(): Partial<SavedFarm> | null {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
    } catch {
      return null;
    }
  }

  private save(): void {
    const { coins, bought } = this.farm;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ coins, bought }));
  }
}

/**
 * The rules of the farm, with no graphics: what's being carried, what's in the
 * machines, and how much money there is. farm.test.ts plays it without a screen.
 */
export type Crop = 'wheat' | 'tomato' | 'apple';
export type Product = 'bread' | 'sauce' | 'pie';
export type Item = Crop | Product;

/** What each crop turns into, and what that sells for. */
export const RECIPES: Record<Crop, { product: Product; price: number }> = {
  wheat: { product: 'bread', price: 2 },
  tomato: { product: 'sauce', price: 3 },
  apple: { product: 'pie', price: 5 },
};

export const CROPS = Object.keys(RECIPES) as Crop[];

export type UpgradeId = 'tomato' | 'apple' | 'backpack' | 'big-backpack';

/** Things you can buy. `carry` is how much the hero can hold after buying it. */
export const UPGRADES: { id: UpgradeId; cost: number; crop?: Crop; carry?: number }[] = [
  { id: 'tomato', cost: 20, crop: 'tomato' },
  { id: 'backpack', cost: 40, carry: 10 },
  { id: 'apple', cost: 80, crop: 'apple' },
  { id: 'big-backpack', cost: 150, carry: 15 },
];

const STARTING_CARRY = 6;

export interface Station {
  /** Crops waiting to go in the machine. */
  waiting: number;
  /** Finished products on the tray. */
  ready: number;
}

export interface Farm {
  coins: number;
  carried: Item[];
  bought: UpgradeId[];
  stations: Record<Crop, Station>;
}

/** The only parts worth keeping between visits. */
export type SavedFarm = Pick<Farm, 'coins' | 'bought'>;

export function createFarm(saved?: Partial<SavedFarm> | null): Farm {
  const known = (id: UpgradeId) => UPGRADES.some((upgrade) => upgrade.id === id);
  return {
    coins: typeof saved?.coins === 'number' && saved.coins >= 0 ? saved.coins : 0,
    carried: [],
    bought: Array.isArray(saved?.bought) ? saved.bought.filter(known) : [],
    stations: {
      wheat: { waiting: 0, ready: 0 },
      tomato: { waiting: 0, ready: 0 },
      apple: { waiting: 0, ready: 0 },
    },
  };
}

export const isCrop = (item: Item): item is Crop => item in RECIPES;

/** Wheat is free. The others have to be bought. */
export const hasCrop = (farm: Farm, crop: Crop): boolean =>
  crop === 'wheat' || farm.bought.includes(crop);

export function carryLimit(farm: Farm): number {
  return UPGRADES.reduce(
    (limit, upgrade) => (upgrade.carry && farm.bought.includes(upgrade.id) ? Math.max(limit, upgrade.carry) : limit),
    STARTING_CARRY,
  );
}

export const isFull = (farm: Farm): boolean => farm.carried.length >= carryLimit(farm);

export function harvest(farm: Farm, crop: Crop): boolean {
  if (isFull(farm) || !hasCrop(farm, crop)) return false;
  farm.carried.push(crop);
  return true;
}

/** Hands one crop to its machine. False means there's none left to hand over. */
export function dropOff(farm: Farm, crop: Crop): boolean {
  const index = farm.carried.lastIndexOf(crop);
  if (index < 0) return false;
  farm.carried.splice(index, 1);
  farm.stations[crop].waiting++;
  return true;
}

/** The machine turns one waiting crop into one product. */
export function processOne(farm: Farm, crop: Crop): boolean {
  const station = farm.stations[crop];
  if (station.waiting === 0) return false;
  station.waiting--;
  station.ready++;
  return true;
}

/** Picks one product up off the tray. */
export function collect(farm: Farm, crop: Crop): boolean {
  const station = farm.stations[crop];
  if (station.ready === 0 || isFull(farm)) return false;
  station.ready--;
  farm.carried.push(RECIPES[crop].product);
  return true;
}

/** Sells one carried product, and returns it. Null means nothing to sell. */
export function sellOne(farm: Farm): Product | null {
  for (let i = farm.carried.length - 1; i >= 0; i--) {
    const item = farm.carried[i];
    if (isCrop(item)) continue;
    farm.carried.splice(i, 1);
    const recipe = CROPS.map((crop) => RECIPES[crop]).find((candidate) => candidate.product === item)!;
    farm.coins += recipe.price;
    return item;
  }
  return null;
}

export function buy(farm: Farm, id: UpgradeId): boolean {
  const upgrade = UPGRADES.find((candidate) => candidate.id === id)!;
  if (farm.bought.includes(id) || farm.coins < upgrade.cost) return false;
  // A big backpack only makes sense after the first one.
  if (id === 'big-backpack' && !farm.bought.includes('backpack')) return false;
  farm.coins -= upgrade.cost;
  farm.bought.push(id);
  return true;
}

export type Job =
  | { kind: 'machine' | 'tray' | 'field'; crop: Crop }
  | { kind: 'stand' }
  | { kind: 'buy'; id: UpgradeId };

/** What the arrow should point at: always one obvious next thing to do. */
export function nextJob(farm: Farm): Job {
  const carriedCrop = farm.carried.find(isCrop);
  if (carriedCrop) return { kind: 'machine', crop: carriedCrop };
  if (farm.carried.length > 0) return { kind: 'stand' };

  const owned = CROPS.filter((crop) => hasCrop(farm, crop));
  const waitingAt = owned.find((crop) => farm.stations[crop].ready > 0 || farm.stations[crop].waiting > 0);
  if (waitingAt) return { kind: 'tray', crop: waitingAt };

  const affordable = UPGRADES.find(
    (upgrade) =>
      !farm.bought.includes(upgrade.id) &&
      farm.coins >= upgrade.cost &&
      (upgrade.id !== 'big-backpack' || farm.bought.includes('backpack')),
  );
  if (affordable) return { kind: 'buy', id: affordable.id };

  // The most valuable crop owned. Each new crop is worth trying out.
  return { kind: 'field', crop: owned[owned.length - 1] };
}

import { describe, expect, it } from 'vitest';
import {
  buy,
  carryLimit,
  collect,
  createFarm,
  dropOff,
  harvest,
  nextJob,
  processOne,
  sellOne,
} from './farm';

describe('the farm loop', () => {
  it('turns a harvested crop into money', () => {
    const farm = createFarm();
    expect(harvest(farm, 'wheat')).toBe(true);
    expect(farm.carried).toEqual(['wheat']);

    expect(dropOff(farm, 'wheat')).toBe(true);
    expect(farm.stations.wheat.waiting).toBe(1);
    expect(processOne(farm, 'wheat')).toBe(true);
    expect(farm.stations.wheat.ready).toBe(1);

    expect(collect(farm, 'wheat')).toBe(true);
    expect(farm.carried).toEqual(['bread']);
    expect(sellOne(farm)).toBe('bread');
    expect(farm.coins).toBe(2);
    expect(farm.carried).toEqual([]);
  });

  it('stops harvesting when full', () => {
    const farm = createFarm();
    for (let i = 0; i < carryLimit(farm); i++) expect(harvest(farm, 'wheat')).toBe(true);
    expect(harvest(farm, 'wheat')).toBe(false);
    expect(farm.carried).toHaveLength(6);
  });

  it('leaves other crops alone at a machine', () => {
    const farm = createFarm({ bought: ['tomato'] });
    harvest(farm, 'tomato');
    expect(dropOff(farm, 'wheat')).toBe(false);
    expect(farm.carried).toEqual(['tomato']);
  });

  it('never sells raw crops', () => {
    const farm = createFarm();
    harvest(farm, 'wheat');
    expect(sellOne(farm)).toBeNull();
    expect(farm.coins).toBe(0);
  });

  it('only harvests crops you own', () => {
    expect(harvest(createFarm(), 'apple')).toBe(false);
  });
});

describe('buying', () => {
  it('needs enough coins, and takes them', () => {
    const farm = createFarm({ coins: 19 });
    expect(buy(farm, 'tomato')).toBe(false);
    farm.coins = 25;
    expect(buy(farm, 'tomato')).toBe(true);
    expect(farm.coins).toBe(5);
    expect(buy(farm, 'tomato')).toBe(false);
  });

  it('lets you carry more with a backpack', () => {
    const farm = createFarm({ coins: 200 });
    expect(buy(farm, 'big-backpack')).toBe(false);
    expect(buy(farm, 'backpack')).toBe(true);
    expect(carryLimit(farm)).toBe(10);
    expect(buy(farm, 'big-backpack')).toBe(true);
    expect(carryLimit(farm)).toBe(15);
  });
});

describe('saved games', () => {
  it('restores coins and purchases', () => {
    const farm = createFarm({ coins: 12, bought: ['tomato'] });
    expect(farm.coins).toBe(12);
    expect(farm.bought).toEqual(['tomato']);
  });

  it('ignores junk', () => {
    const farm = createFarm(JSON.parse('{"coins":"lots","bought":["rocket"]}'));
    expect(farm.coins).toBe(0);
    expect(farm.bought).toEqual([]);
  });
});

describe('nextJob', () => {
  it('always knows what to do next, through the whole loop', () => {
    const farm = createFarm();
    expect(nextJob(farm)).toEqual({ kind: 'field', crop: 'wheat' });
    harvest(farm, 'wheat');
    expect(nextJob(farm)).toEqual({ kind: 'machine', crop: 'wheat' });
    dropOff(farm, 'wheat');
    expect(nextJob(farm)).toEqual({ kind: 'tray', crop: 'wheat' });
    processOne(farm, 'wheat');
    collect(farm, 'wheat');
    expect(nextJob(farm)).toEqual({ kind: 'stand' });
    sellOne(farm);
    farm.coins = 20;
    expect(nextJob(farm)).toEqual({ kind: 'buy', id: 'tomato' });
  });
});

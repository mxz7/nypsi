const { readFileSync } = require("fs");

const items = JSON.parse(readFileSync("data/items.json"));
const lootPools = JSON.parse(readFileSync("data/loot_pools.json"));

for (const poolId in lootPools) {
  test(poolId, () => {
    const pool = lootPools[poolId];
    if(pool.nothing) {
      expect(Number(pool.nothing)).toBeGreaterThan(0);
    }
    for (const amount in pool.money) {
      expect(Number(amount)).toBeGreaterThan(0);
      expect(Number(pool.money[amount])).toBeGreaterThan(0);
    }
    for (const amount in pool.xp) {
      expect(Number(amount)).toBeGreaterThan(0);
      expect(Number(pool.xp[amount])).toBeGreaterThan(0);
    }
    for (const amount in pool.karma) {
      expect(Number(amount)).toBeGreaterThan(0);
      expect(Number(pool.karma[amount])).toBeGreaterThan(0);
    }
    for (const itemKey in pool.items) {
      const itemValue = pool.items[itemKey];
      expect(items[itemKey]).toBeDefined();
      if(typeof itemValue === "number") {
        expect(Number(itemValue)).toBeGreaterThan(0);
      }
      if(typeof itemValue === "object" && itemValue.weight) {
        expect(Number(itemValue.weight)).toBeGreaterThan(0);
      }
    }
  });
}

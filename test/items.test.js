const { readFileSync } = require("fs");
const { exp } = require("mathjs");

const items = JSON.parse(readFileSync("data/items.json"));

for (const item of Object.values(items)) {
  test(item.id, () => {
    expect(typeof item.id).toBe("string");
    expect(typeof item.name).toBe("string");
    expect(typeof item.emoji).toBe("string");
    expect(typeof item.longDesc).toBe("string");
    expect(typeof item.article).toBe("string");
    expect(typeof item.in_crates).toBe("boolean");
    expect(typeof item.role).toBe("string");

    if (item.role === "booster") {
      expect(typeof item.stackable).toBe("boolean");
      if (item.stackable) expect(typeof item.max).toBe("number");
      expect(typeof item.boosterEffect).toBe("object");
      expect(typeof item.boosterEffect.effect).toBe("number");
      expect(typeof item.boosterEffect.time).toBe("number");

      expect(Array.isArray(item.boosterEffect.effect)).toBe(true);

      for (const effect of item.boosterEffect.effect) {
        expect(typeof effect).toBe("string");
      }
    }

    if (item.role === "scratch-card") {
      expect(typeof item.clicks).toBe("number");

      for (const reward of item.items) {
        if (reward.startsWith("money") || reward.startsWith("xp")) {
          expect(Number(reward.split(":")[1])).toBeGreaterThan(0);
        } else {
          expect(Boolean(items[reward.split(":")[1]])).toBe(true);
          expect(Number(reward.split(":")[2])).toBeGreaterThan(0);
          expect(Number(reward.split(":")[2])).toBeLessThanOrEqual(100);
        }
      }
    }

    if (item.role === "crate") {
      expect(Number(item.crate_runs)).toBeGreaterThan(0);
    }

    if (item.role === "car") expect(typeof item.speed).toBe("number");
    if (item.role === "ore") expect(typeof item.ingot).toBe("string");
    if (item.role === "worker-upgrade") expect(typeof item.worker_upgrade_id).toBe("string");

    if (item.rarity) expect(typeof item.rarity).toBe("number");
    if (item.booster_desc) expect(typeof item.booster_desc).toBe("string");
    if (item.shortDesc) expect(typeof item.shortDesc).toBe("string");
    if (item.buy) expect(typeof item.buy).toBe("number");
    if (item.sell) expect(typeof item.sell).toBe("number");
    if (item.aliases) expect(Array.isArray(item.aliases)).toBe(true);
    if (item.plural) expect(typeof item.plural).toBe("string");
    if (item.random_drop_chance) expect(typeof item.random_drop_chance).toBe("number");

    if (item.craft) {
      expect(typeof item.craft).toBe("object");
      expect(typeof item.craft.time).toBe("number");
      expect(Array.isArray(item.craft.ingredients)).toBe(true);

      for (const ingredient of item.craft.ingredients) {
        expect(Boolean(items[ingredient.split(":")[0]])).toBe(true);
        expect(Number(ingredient.split(":")[1])).toBeGreaterThan(0);
      }
    }
  });
}

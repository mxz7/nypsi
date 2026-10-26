import assert from "node:assert/strict";
import { test } from "vitest";
import { cacheWithSharedEmpty } from "../../src/utils/discord-cache";
import { fixture, message } from "../patches/discord.js/fixtures";
import { patched } from "../patches/discord.js/libraries";

test("shared zero cache stays empty across managers and returns independent output collections", () => {
  const { channels, guild, empty } = fixture(patched, true);
  assert.strictEqual(channels[0].messages.cache, channels[1].messages.cache);
  assert.strictEqual(channels[0].threads.cache, empty);
  assert.strictEqual(guild.bans.cache, empty);
  channels[0].messages._add(message(channels[0]));
  empty.set("fake", {});
  empty.delete("fake");
  empty.clear();
  assert.equal(empty.size, 0);
  const clone = empty.clone();
  assert.notStrictEqual(clone, empty);
  clone.set("local", 1);
  assert.equal(clone.size, 1);
  assert.equal(empty.size, 0);
  assert.throws(() => {
    empty.maxSize = 1;
  }, TypeError);
});
test("nonzero caches remain private and retain their own entries", () => {
  const { channels, empty } = fixture(patched, true);
  const one = channels[0].permissionOverwrites.cache,
    two = channels[1].permissionOverwrites.cache;
  assert.notStrictEqual(one, two);
  assert.notStrictEqual(one, empty);
  one.set("test", { allow: new patched.PermissionsBitField(1024n).freeze() });
  assert.equal(two.size, 0);
  assert.equal(one.size, 1);
});
test("zero-limit caches with retention callbacks stay independent", () => {
  const factory = cacheWithSharedEmpty({
    GuildBanManager: { maxSize: 0, keepOverLimit: () => true },
  });
  const a = factory(patched.GuildBanManager, patched.GuildBan, patched.GuildBanManager);
  const b = factory(patched.GuildBanManager, patched.GuildBan, patched.GuildBanManager);
  assert.notStrictEqual(a, b);
  a.set("retained", {});
  assert.equal(a.size, 1);
  assert.equal(b.size, 0);
});

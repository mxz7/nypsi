import assert from "node:assert/strict";
import { test } from "vitest";
import { cacheWithSharedEmpty } from "../../src/utils/discord-cache";
import { patched, baseline } from "./libraries";

const settings = { MessageManager: 0, ThreadManager: 0, GuildBanManager: 0 };
function fixture(lib = patched, shared = false) {
  const fallback = lib.Options.cacheWithLimits(settings);
  const sharedFactory = cacheWithSharedEmpty(settings);
  const empty = sharedFactory(lib.GuildBanManager, lib.GuildBan, lib.GuildBanManager);
  const counts = {};
  const client = new lib.Client({
    intents: [],
    makeCache: (type, holds, manager) => {
      counts[manager.name] = (counts[manager.name] || 0) + 1;
      return shared ? sharedFactory(type, holds, manager) : fallback(type, holds, manager);
    },
  });
  const guild = client.guilds._add({
    id: "100000000000000001",
    name: "fixture",
    roles: [{ id: "100000000000000001", name: "@everyone", permissions: "1024", position: 0 }],
    channels: [],
  });
  const channels = [];
  for (const type of [0, 2, 15])
    channels.push(
      client.channels._add(
        {
          id: String(100000000000000100n + BigInt(type)),
          guild_id: guild.id,
          name: "fixture",
          type,
          position: 0,
          flags: 0,
          permission_overwrites: [],
          available_tags: [],
          bitrate: 64000,
        },
        guild,
      ),
    );
  return { client, guild, channels, counts, empty };
}
function message(channel, id = "100000000000000090") {
  return {
    id,
    channel_id: channel.id,
    guild_id: channel.guild.id,
    content: "fixture",
    author: { id: "100000000000000002", username: "fixture", discriminator: "0" },
    timestamp: "2026-01-01T00:00:00Z",
    attachments: [],
    embeds: [],
    mentions: [],
    mention_roles: [],
    pinned: false,
    type: 0,
    flags: 0,
  };
}
test("channel capabilities and own keys match before manager materialization", () => {
  const first = fixture();
  const second = fixture(baseline);
  for (let i = 0; i < 3; i++) {
    const a = first.channels[i],
      b = second.channels[i];
    assert.equal(a.isTextBased(), b.isTextBased());
    assert.equal(a.isVoiceBased(), b.isVoiceBased());
    assert.equal(a.isThreadOnly(), b.isThreadOnly());
    assert.equal(a.isSendable(), b.isSendable());
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  }
  assert.equal(first.counts.GuildMessageManager, undefined);
  assert.equal(first.counts.GuildTextThreadManager, undefined);
  assert.equal(first.counts.GuildForumThreadManager, undefined);
});
test("first access materializes each manager once and binds it to the right channel", () => {
  const { channels, counts } = fixture();
  for (const channel of channels)
    for (const name of ["messages", "threads"]) {
      if (!(name in channel)) continue;
      const first = channel[name];
      assert.strictEqual(channel[name], first);
      assert.strictEqual(first.channel, channel);
      assert.strictEqual(first.client, channel.client);
      assert.equal(Object.getOwnPropertyDescriptor(channel, name).writable, true);
    }
  assert.equal(counts.GuildMessageManager, 2);
  assert.equal(counts.GuildTextThreadManager, 1);
  assert.equal(counts.GuildForumThreadManager, 1);
});
test("manager assignment before first access remains supported", () => {
  const { channels, counts } = fixture();
  const replacement = { custom: true };
  channels[0].messages = replacement;
  assert.strictEqual(channels[0].messages, replacement);
  assert.equal(counts.GuildMessageManager, undefined);
});
test("message insertion with zero cache returns a real message without retaining it", () => {
  const { channels, counts } = fixture();
  const channel = channels[0];
  const entry = channel.messages._add(message(channel));
  assert.equal(entry.content, "fixture");
  assert.equal(channel.messages.cache.size, 0);
  assert.equal(counts.GuildMessageManager, 1);
});
test("thread creation populates global/guild caches while zero parent cache stays empty", () => {
  const { client, guild, channels } = fixture();
  const parent = channels[0];
  const thread = client.channels._add(
    {
      id: "100000000000000099",
      guild_id: guild.id,
      parent_id: parent.id,
      name: "thread",
      type: 11,
      thread_metadata: {
        archived: false,
        archive_timestamp: "2026-01-01T00:00:00Z",
        auto_archive_duration: 1440,
      },
    },
    guild,
  );
  assert.strictEqual(client.channels.cache.get(thread.id), thread);
  assert.strictEqual(guild.channels.cache.get(thread.id), thread);
  assert.equal(parent.threads.cache.size, 0);
});
test("lazy manager cache:false message cloning matches normal semantics", () => {
  const { channels } = fixture();
  const channel = channels[0];
  const original = channel.messages._add(message(channel));
  const other = channel.messages._add({ ...message(channel), content: "changed" }, false);
  assert.notStrictEqual(original, other);
  assert.equal(original.content, "fixture");
  assert.equal(other.content, "changed");
  assert.equal(channel.messages.cache.size, 0);
});
test("channel type changes can read lazy message managers without losing capabilities", () => {
  const { client, channels } = fixture();
  const channel = channels[0];
  const result = client.actions.ChannelUpdate.handle({
    id: channel.id,
    guild_id: channel.guild.id,
    type: 5,
    name: "announcement",
    permission_overwrites: [],
  });
  assert.equal(result.updated.type, 5);
  assert.equal(result.updated.isTextBased(), true);
  assert.equal(result.updated.messages.cache.size, 0);
  assert.notStrictEqual(result.updated, channel);
});
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
test("materialized channel serialization and permission checks match baseline", () => {
  const one = fixture();
  const two = fixture(baseline);
  for (let i = 0; i < 3; i++) {
    const a = one.channels[i],
      b = two.channels[i];
    assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
    assert.equal(
      a.permissionsFor(one.guild.roles.everyone).bitfield,
      b.permissionsFor(two.guild.roles.everyone).bitfield,
    );
  }
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

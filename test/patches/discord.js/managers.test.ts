import assert from "node:assert/strict";
import { test } from "vitest";
import { fixture, message } from "./fixtures";
import { baseline } from "./libraries";

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

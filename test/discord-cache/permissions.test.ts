import assert from "node:assert/strict";
import { test } from "vitest";
import {
  patched,
  baseline,
  getFrozenPermissions,
  channelUpdate,
  freshPermissionsPool,
} from "./libraries";

const ids = {
  guild: "100000000000000001",
  role: "100000000000000002",
  adminRole: "100000000000000003",
  member: "100000000000000004",
  admin: "100000000000000005",
  owner: "100000000000000006",
  category: "100000000000000007",
  channel: "100000000000000008",
  sibling: "100000000000000009",
};
const flags = patched.PermissionFlagsBits;

function overwrites() {
  return [
    { id: ids.guild, type: 0, allow: String(flags.ViewChannel), deny: "0" },
    { id: ids.role, type: 0, allow: "0", deny: String(flags.SendMessages) },
    { id: ids.member, type: 1, allow: String(flags.SendMessages), deny: String(flags.EmbedLinks) },
  ];
}

function channelData(id = ids.channel, entries = overwrites(), type = 0) {
  return {
    id,
    guild_id: ids.guild,
    name: "fixture",
    type,
    parent_id: type === 4 ? null : ids.category,
    position: 0,
    permission_overwrites: entries,
  };
}

function fixture(library = patched) {
  const client = new library.Client({ intents: [] });
  const base = flags.ViewChannel | flags.SendMessages | flags.EmbedLinks | flags.ReadMessageHistory;
  const guild = client.guilds._add({
    id: ids.guild,
    name: "fixture",
    owner_id: ids.owner,
    roles: [
      { id: ids.guild, name: "@everyone", permissions: String(base), position: 0 },
      { id: ids.role, name: "member", permissions: "0", position: 1 },
      { id: ids.adminRole, name: "admin", permissions: String(flags.Administrator), position: 2 },
    ],
    channels: [channelData(ids.category, overwrites(), 4), channelData(), channelData(ids.sibling)],
  });
  for (const [id, roles] of [
    [ids.member, [ids.role]],
    [ids.admin, [ids.adminRole]],
    [ids.owner, []],
  ]) {
    guild.members._add({
      user: { id, username: id, discriminator: "0" },
      roles,
      joined_at: "2026-01-01T00:00:00Z",
    });
  }
  return {
    client,
    guild,
    channel: guild.channels.cache.get(ids.channel),
    sibling: guild.channels.cache.get(ids.sibling),
  };
}

test("identical frozen values are shared, public mutable bitfields remain independent", () => {
  const first = getFrozenPermissions(1024n);
  assert.strictEqual(first, getFrozenPermissions(1024n));
  assert(first instanceof patched.PermissionsBitField);
  assert(Object.isFrozen(first));
  const one = new patched.PermissionsBitField(1024n);
  const two = new patched.PermissionsBitField(1024n);
  one.add(2048n);
  assert.equal(two.bitfield, 1024n);
  assert.notStrictEqual(one, first);
});

test("the bounded pool preserves known values and bypasses new values once full", () => {
  const freshPool = freshPermissionsPool();
  const held = freshPool(0n);
  for (let i = 1n; i <= 10000n; i++) freshPool(i);
  assert.strictEqual(freshPool(0n), held);
  assert.strictEqual(freshPool(1023n), freshPool(1023n));
  assert.notStrictEqual(freshPool(1024n), freshPool(1024n));
  assert.equal(held.bitfield, 0n);
  assert.equal(held.add(1024n).bitfield, 1024n);
  assert.equal(held.bitfield, 0n);
});

test("all permission flags preserve frozen add/remove, checks, and serialization", () => {
  for (const bit of Object.values(flags)) {
    const shared = getFrozenPermissions(bit);
    const original = new baseline.PermissionsBitField(bit).freeze();
    assert.equal(
      shared.add(flags.Administrator).bitfield,
      original.add(flags.Administrator).bitfield,
    );
    assert.equal(shared.remove(bit).bitfield, original.remove(bit).bitfield);
    assert.equal(shared.has(flags.SendMessages), original.has(flags.SendMessages));
    assert.equal(shared.has(flags.SendMessages, false), original.has(flags.SendMessages, false));
    assert.deepEqual(shared.toArray(), original.toArray());
    assert.equal(shared.toJSON(), original.toJSON());
    assert.equal(shared.bitfield, bit);
  }
});

test("partial overwrite updates and serialization preserve other shared entries", () => {
  const { channel, sibling } = fixture();
  const first = channel.permissionOverwrites.cache.get(ids.member);
  const other = sibling.permissionOverwrites.cache.get(ids.member);
  assert.strictEqual(first.allow, other.allow);
  const previous = first.allow;
  first._patch({ id: ids.member, allow: "0" });
  assert.equal(first.deny.bitfield, flags.EmbedLinks);
  assert.strictEqual(other.allow, previous);
  assert.equal(other.allow.bitfield, flags.SendMessages);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), {
    id: ids.member,
    type: 1,
    allow: "0",
    deny: String(flags.EmbedLinks),
  });
});

test("creation keeps channel/overwrite identities and parent permission locking correct", () => {
  const { client, guild, channel, sibling } = fixture();
  assert.strictEqual(client.channels.cache.get(channel.id), guild.channels.cache.get(channel.id));
  assert.notStrictEqual(channel.permissionOverwrites, sibling.permissionOverwrites);
  const first = channel.permissionOverwrites.cache.get(ids.member);
  const second = sibling.permissionOverwrites.cache.get(ids.member);
  assert.notStrictEqual(first, second);
  assert.strictEqual(first.channel, channel);
  assert.strictEqual(second.channel, sibling);
  assert.strictEqual(first.allow, second.allow);
  assert.equal(channel.permissionsLocked, true);
});

test("gateway channel updates preserve old snapshots and sibling permissions", () => {
  const { client, channel, sibling } = fixture();
  let event;
  client.once("channelUpdate", (old, updated) => {
    event = { old, updated };
  });
  const changed = overwrites();
  changed[2].allow = "0";
  channelUpdate(client, { d: channelData(ids.channel, changed) });
  assert.strictEqual(event.updated, channel);
  assert.equal(
    event.old.permissionOverwrites.cache.get(ids.member).allow.bitfield,
    flags.SendMessages,
  );
  assert.equal(channel.permissionOverwrites.cache.get(ids.member).allow.bitfield, 0n);
  assert.equal(
    sibling.permissionOverwrites.cache.get(ids.member).allow.bitfield,
    flags.SendMessages,
  );
  assert.strictEqual(event.old.permissionOverwrites.cache.get(ids.member).channel, event.old);
  assert.equal(channel.permissionsLocked, false);
});

test("REST channel fetches use shared bitfields and preserve other channel state", async () => {
  const { client, channel, sibling } = fixture();
  const changed = overwrites();
  changed[2].allow = "0";
  client.rest.get = async () => channelData(ids.channel, changed);
  const fetched = await client.channels.fetch(ids.channel, { force: true });
  assert.strictEqual(fetched, channel);
  assert.equal(fetched.permissionOverwrites.cache.get(ids.member).allow.bitfield, 0n);
  assert.equal(
    sibling.permissionOverwrites.cache.get(ids.member).allow.bitfield,
    flags.SendMessages,
  );
});

test("overwrite REST edits merge existing bits without mutating any cached bitfield", async () => {
  const { client, channel, sibling } = fixture();
  const original = channel.permissionOverwrites.cache.get(ids.member);
  const beforeAllow = original.allow;
  const beforeDeny = original.deny;
  let request;
  client.rest.put = async (route, options) => {
    request = { route, options };
  };
  await original.edit({ SendMessages: false, EmbedLinks: null, AttachFiles: true }, "fixture");
  assert.equal(request.route, `/channels/${ids.channel}/permissions/${ids.member}`);
  assert.equal(request.options.body.allow.bitfield, flags.AttachFiles);
  assert.equal(request.options.body.deny.bitfield, flags.SendMessages);
  assert.equal(request.options.body.type, 1);
  assert.strictEqual(original.allow, beforeAllow);
  assert.strictEqual(original.deny, beforeDeny);
  assert.strictEqual(sibling.permissionOverwrites.cache.get(ids.member).allow, beforeAllow);
});

test("replacing overwrites through REST preserves unrelated channel collections", async () => {
  const { client, channel, sibling } = fixture();
  client.rest.patch = async () => channelData(ids.channel, []);
  await channel.permissionOverwrites.set([]);
  assert.equal(channel.permissionOverwrites.cache.size, 0);
  assert.equal(sibling.permissionOverwrites.cache.size, 3);
});

test("cache:false preserves an existing cached channel without applying fetched changes", async () => {
  const { client, channel } = fixture();
  const changed = overwrites();
  changed[2].allow = "0";
  client.rest.get = async () => channelData(ids.channel, changed);
  const fetched = await client.channels.fetch(ids.channel, { force: true, cache: false });
  assert.strictEqual(fetched, channel);
  assert.strictEqual(client.channels.cache.get(ids.channel), channel);
  assert.equal(
    fetched.permissionOverwrites.cache.get(ids.member).allow.bitfield,
    flags.SendMessages,
  );
});

test("uncached overwrite manager adds preserve the original entry and channel ownership", () => {
  const { channel } = fixture();
  const original = channel.permissionOverwrites.cache.get(ids.member);
  const fetched = channel.permissionOverwrites._add({ id: ids.member, allow: "0" }, false);
  assert.notStrictEqual(fetched, original);
  assert.strictEqual(channel.permissionOverwrites.cache.get(ids.member), original);
  assert.equal(fetched.allow.bitfield, 0n);
  assert.equal(original.allow.bitfield, flags.SendMessages);
  assert.strictEqual(fetched.channel, channel);
});

test("permission precedence, administrator and owner behavior match unpatched 14.27.0", () => {
  const one = fixture();
  const two = fixture(baseline);
  let state = 0x12345678;
  const randomBits = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const candidates = [
      flags.ViewChannel,
      flags.SendMessages,
      flags.EmbedLinks,
      flags.AttachFiles,
      flags.ReadMessageHistory,
      flags.ManageMessages,
      flags.Administrator,
      flags.ManageChannels,
      flags.SendMessagesInThreads,
      flags.UseExternalApps,
    ];
    return candidates.reduce((value, bit, i) => value | (state & (1 << i) ? bit : 0n), 0n);
  };
  for (let iteration = 0; iteration < 2000; iteration++) {
    const entries = overwrites().map((entry) => ({
      ...entry,
      allow: String(randomBits()),
      deny: String(randomBits()),
    }));
    const rolePermissions = String(randomBits());
    for (const fixture of [one, two]) {
      fixture.client.actions.GuildRoleUpdate.handle({
        guild_id: ids.guild,
        role: { id: ids.role, permissions: rolePermissions },
      });
      fixture.channel._patch(channelData(ids.channel, entries));
    }
    for (const id of [ids.member, ids.admin, ids.owner]) {
      for (const checkAdmin of [true, false]) {
        assert.equal(
          one.channel.permissionsFor(one.guild.members.cache.get(id), checkAdmin).bitfield,
          two.channel.permissionsFor(two.guild.members.cache.get(id), checkAdmin).bitfield,
        );
      }
    }
    for (const id of [ids.guild, ids.role, ids.adminRole]) {
      for (const checkAdmin of [true, false]) {
        assert.equal(
          one.channel.permissionsFor(one.guild.roles.cache.get(id), checkAdmin).bitfield,
          two.channel.permissionsFor(two.guild.roles.cache.get(id), checkAdmin).bitfield,
        );
      }
    }
    assert.equal(one.channel.permissionsLocked, two.channel.permissionsLocked);
  }
});

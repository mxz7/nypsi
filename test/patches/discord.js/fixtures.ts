import { cacheWithSharedEmpty } from "../../../src/utils/discord-cache";
import { patched } from "./libraries";

const settings = { MessageManager: 0, ThreadManager: 0, GuildBanManager: 0 };
export function fixture(lib = patched, shared = false) {
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
export function message(channel, id = "100000000000000090") {
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

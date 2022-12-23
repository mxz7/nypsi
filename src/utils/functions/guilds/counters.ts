import { GuildCounter, TrackingType } from "@prisma/client";
import { ChannelType, Guild, PermissionFlagsBits } from "discord.js";
import prisma from "../../../init/database";

export async function updateChannel(data: GuildCounter) {
  // update channel name init.
}

export async function createGuildCounter(guild: Guild, mode: TrackingType, item?: string, format?: string) {
  let fail = false;

  const everyone = guild.roles.cache.find((r) => r.name == "@everyone");

  const channel = await guild.channels
    .create({
      name: "creating...",
      type: ChannelType.GuildVoice,
      permissionOverwrites: [
        {
          id: everyone.id,
          deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages],
        },
      ],
      reason: `creating counter with type: ${TrackingType}`,
    })
    .catch(() => {
      fail = true;
    });

  if (fail || !channel) return false;

  const res = await prisma.guildCounter.create({
    data: {
      channel: channel.id,
      format,
      guildId: guild.id,
      tracks: mode,
      totalItem: item,
    },
  });

  await updateChannel(res);

  return true;
}

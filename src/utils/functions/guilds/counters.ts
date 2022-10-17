import { Collection, Guild, GuildMember } from "discord.js";
import prisma from "../../../init/database";
import { NypsiClient } from "../../../models/Client";
import { logger } from "../../logger";
import { addCooldown, getPeaks, inCooldown } from "./utils";

export async function createGuildCounter(guild: Guild) {
  await prisma.guildCounter.create({
    data: {
      guildId: guild.id,
    },
  });
}

export async function setGuildCounter(guild: Guild, profile: any) {
  await prisma.guildCounter.update({
    where: {
      guildId: guild.id,
    },
    data: {
      enabled: profile.enabled,
      format: profile.format,
      filterBots: profile.filterBots,
      channel: profile.channel,
    },
  });
}

export function updateCounters(client: NypsiClient) {
  setInterval(async () => {
    for (const guildId of client.guilds.cache.keys()) {
      const guild = await client.guilds.fetch(guildId);

      if (!guild) continue;

      const profile = await prisma.guildCounter
        .findMany({
          where: {
            AND: [
              {
                guildId: guildId,
              },
              {
                enabled: true,
              },
            ],
          },
        })
        .then((res) => res[0]);

      if (!profile) continue;

      let memberCount: number;

      if (profile.filterBots && guild.memberCount >= 500) {
        profile.filterBots = false;
        await setGuildCounter(guild, profile);
        memberCount = guild.memberCount;
      } else if (profile.filterBots) {
        let members: Collection<string, GuildMember> | void;

        if (inCooldown(guild) || guild.memberCount == guild.members.cache.size) {
          members = guild.members.cache;
        } else {
          members = await guild.members.fetch().catch(() => {});
          addCooldown(guild, 3600);
        }

        if (!members) return;

        if (members.size == guild.memberCount) {
          members = members.filter((m) => !m.user.bot);

          memberCount = members.size;
        } else {
          memberCount = guild.memberCount;
        }
      } else {
        memberCount = guild.memberCount;
      }

      if (!memberCount) memberCount = guild.memberCount;

      const channel = guild.channels.cache.find((c) => c.id == profile.channel);

      if (!channel) {
        continue;
      }

      let format = profile.format;
      format = format.split("%count%").join(memberCount.toLocaleString());
      format = format.split("%peak%").join((await getPeaks(guild)).toLocaleString());

      if (channel.name != format) {
        const old = channel.name;

        await channel
          .edit({ name: format })
          .then(() => {
            logger.log({
              level: "auto",
              message: "counter updated for '" + guild.name + "' ~ '" + old + "' -> '" + format + "'",
            });
          })
          .catch(async () => {
            logger.warn("error updating counter in " + guild.name);
            profile.enabled = false;
            profile.channel = "none";
            await setGuildCounter(guild, profile);
          });
      }
    }
  }, 600000);
}

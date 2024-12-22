import { flavors } from "@catppuccin/palette";
import { ColorResolvable, EmbedBuilder, WebhookClient } from "discord.js";
import { inPlaceSort } from "fast-sort";
import redis from "../../init/redis";
import { Job } from "../../types/Jobs";
import Constants from "../../utils/Constants";
import { getPreferences } from "../../utils/functions/users/notifications";
import { getLastKnownUsername } from "../../utils/functions/users/tag";

export default {
  name: "top commands",
  cron: "0 0 * * *",
  async run(log) {
    const [topCommands, topUsers] = await Promise.all([
      redis.hgetall(Constants.redis.nypsi.TOP_COMMANDS),
      redis.hgetall(Constants.redis.nypsi.TOP_COMMANDS_USER),
    ]);
    await redis.del(Constants.redis.nypsi.TOP_COMMANDS);
    await redis.del(Constants.redis.nypsi.TOP_COMMANDS_USER);

    const commands: string[] = [];

    for (const cmd of Object.keys(topCommands)) {
      commands.push(cmd);
    }

    const users: string[] = [];

    for (const user of Object.keys(topUsers)) {
      users.push(user);
    }

    inPlaceSort(commands).desc((i) => parseInt(topCommands[i]));
    inPlaceSort(users).desc((i) => parseInt(topUsers[i]));

    const msg: string[] = [];

    let count = 0;
    for (const cmd of commands) {
      if (count >= 10) break;

      let pos: number | string = count + 1;

      if (pos == 1) {
        pos = "🥇";
      } else if (pos == 2) {
        pos = "🥈";
      } else if (pos == 3) {
        pos = "🥉";
      }

      msg.push(`${pos} \`$${cmd}\` used **${parseInt(topCommands[cmd]).toLocaleString()}** times`);
      count++;
    }

    const embed = new EmbedBuilder();

    embed.setTitle("top 10 commands");
    embed.setDescription(msg.join("\n"));
    embed.setColor(flavors.latte.colors.base.hex as ColorResolvable);

    if ((await getPreferences(users[0]))?.leaderboards || false) {
      embed.setFooter({
        text: `${await getLastKnownUsername(users[0])} has no life (${parseInt(
          topUsers[users[0]],
        ).toLocaleString()} commands)`,
      });
    }

    const hook = new WebhookClient({ url: process.env.TOPCOMMANDS_HOOK });

    await hook
      .send({ embeds: [embed] })
      .then(() => {
        log("sent top commands");
      })
      .catch(() => {
        log("failed to send top commands");
      });

    hook.destroy();
  },
} satisfies Job;

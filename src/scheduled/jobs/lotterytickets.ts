import { flavors } from "@catppuccin/palette";
import { ColorResolvable, EmbedBuilder, WebhookClient } from "discord.js";
import redis from "../../init/redis";
import { Job } from "../../types/Jobs";

export default {
  name: "lottery tickets",
  cron: "*/30 * * * *",
  async run() {
    const hook = new WebhookClient({
      url: process.env.LOTTERY_HOOK,
    });

    const tickets = await redis.hgetall("lotterytickets:queue");

    if (Object.keys(tickets).length == 0) return;

    const desc = [];

    for (const username of Object.keys(tickets)) {
      const amount = parseInt(tickets[username]);

      desc.push(`**${username}** has bought **${amount}** lottery ticket${amount > 1 ? "s" : ""}`);

      await redis.hdel("lotterytickets:queue", username);

      if (desc.join("\n").length >= 500) break;
    }

    const embed = new EmbedBuilder();

    embed.setColor(flavors.latte.colors.base.hex as ColorResolvable);
    embed.setDescription(desc.join("\n"));
    embed.setTimestamp();

    await hook.send({ embeds: [embed] });

    hook.destroy();
  },
} satisfies Job;

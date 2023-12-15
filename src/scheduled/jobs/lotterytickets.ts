import { variants } from "@catppuccin/palette";
import { ColorResolvable, EmbedBuilder, WebhookClient } from "discord.js";
import redis from "../../init/redis";
import { getVersion } from "../../utils/functions/version";

(async () => {
  process.title = `nypsi v${getVersion()}: lottery tickets job`;

  const hook = new WebhookClient({
    url: process.env.LOTTERY_HOOK,
  });

  const tickets = await redis.hgetall("lotterytickets:queue");

  if (Object.keys(tickets).length == 0) {
    process.exit(0);
    return;
  }

  const desc = [];

  for (const username of Object.keys(tickets)) {
    const amount = parseInt(tickets[username]);

    desc.push(`**${username}** has bought **${amount}** lottery ticket${amount > 1 ? "s" : ""}`);

    await redis.hdel("lotterytickets:queue", username);

    if (desc.join("\n").length >= 500) break;
  }

  const embed = new EmbedBuilder();

  embed.setColor(variants.latte.base.hex as ColorResolvable);
  embed.setDescription(desc.join("\n"));
  embed.setTimestamp();

  await hook.send({ embeds: [embed] });

  hook.destroy();

  process.exit(0);
})();

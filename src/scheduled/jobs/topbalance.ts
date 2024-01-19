import { flavors } from "@catppuccin/palette";
import { ColorResolvable, EmbedBuilder, WebhookClient } from "discord.js";
import { Job } from "../../types/Jobs";
import { topBalanceGlobal } from "../../utils/functions/economy/top";

export default {
  name: "top balance",
  cron: "0 0 * * *",
  async run(log) {
    const baltop = await topBalanceGlobal(10);

    const embed = new EmbedBuilder();

    embed.setTitle("top 10 richest users");
    embed.setDescription(baltop.join("\n"));
    embed.setColor(flavors.latte.colors.base.hex as ColorResolvable);

    const hook = new WebhookClient({ url: process.env.TOPGLOBAL_HOOK });

    await hook.send({ embeds: [embed] });

    log("sent global baltop");

    hook.destroy();
  },
} satisfies Job;

import { flavors } from "@catppuccin/palette";
import { ColorResolvable, WebhookClient } from "discord.js";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import { topBalanceGlobal, topGuilds } from "../../utils/functions/economy/top";

export default {
  name: "top balance",
  cron: "0 0 * * *",
  async run(log) {
    const baltop = await topBalanceGlobal(10);
    const guilds = await topGuilds();

    const embed = new CustomEmbed();

    embed.setHeader(
      "top",
      "https://cdn.discordapp.com/avatars/678711738845102087/cb2dcd61010f2b89ceb1cd5ff15816cf.png?size=256",
    );

    embed.setColor(flavors.latte.colors.base.hex as ColorResolvable);

    embed.addField("balance", baltop.join("\n"), true);
    embed.addField("guild", guilds.pages.get(1).join("\n"), true);

    const hook = new WebhookClient({ url: process.env.TOPGLOBAL_HOOK });

    await hook.send({ embeds: [embed] });

    log("sent global baltop");

    hook.destroy();
  },
} satisfies Job;

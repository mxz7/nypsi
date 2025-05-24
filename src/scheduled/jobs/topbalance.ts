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

    const balance = new CustomEmbed();
    const guild = new CustomEmbed();

    balance.setHeader(
      "top balance",
      "https://cdn.discordapp.com/avatars/678711738845102087/cb2dcd61010f2b89ceb1cd5ff15816cf.png?size=256",
      "https://nypsi.xyz/leaderboard/balance?ref=bot-lb",
    );
    guild.setHeader(
      "top guilds",
      "https://cdn.discordapp.com/avatars/678711738845102087/cb2dcd61010f2b89ceb1cd5ff15816cf.png?size=256",
      "https://nypsi.xyz/leaderboard/guilds?ref=bot-lb",
    );

    balance.setColor(flavors.latte.colors.base.hex as ColorResolvable);
    guild.setColor(flavors.latte.colors.base.hex as ColorResolvable);

    balance.setDescription(baltop.join("\n"));
    guild.setDescription(guilds.pages.get(1).join("\n"));

    const hook = new WebhookClient({ url: process.env.TOPGLOBAL_HOOK });

    await hook.send({ embeds: [balance, guild] });

    log("sent global baltop");

    hook.destroy();
  },
} satisfies Job;

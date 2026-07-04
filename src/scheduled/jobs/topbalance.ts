import { flavors } from "@catppuccin/palette";
import { Routes } from "discord-api-types/v10";
import { ColorResolvable } from "discord.js";
import { CustomEmbed } from "../../models/EmbedBuilders";
import { Job } from "../../types/Jobs";
import { topBalance, topGuilds } from "../../utils/functions/leaderboards/economy";
import { getRest } from "../../utils/rest";

const TOPGLOBAL_CHANNEL_ID = "833052442069434429";

export default {
  name: "top balance",
  cron: "0 0 * * *",
  async run(log) {
    const baltop = await topBalance("global", undefined, undefined, 10);
    const guilds = await topGuilds();

    const balance = new CustomEmbed();
    const guild = new CustomEmbed();

    balance.setHeader(
      "top balance",
      "https://cdn.discordapp.com/avatars/678711738845102087/cb2dcd61010f2b89ceb1cd5ff15816cf.png?size=256",
      "https://nypsi.xyz/leaderboards/balance?ref=bot-lb",
    );
    guild.setHeader(
      "top guilds",
      "https://cdn.discordapp.com/avatars/678711738845102087/cb2dcd61010f2b89ceb1cd5ff15816cf.png?size=256",
      "https://nypsi.xyz/leaderboards/guilds?ref=bot-lb",
    );

    balance.setColor(flavors.latte.colors.base.hex as ColorResolvable);
    guild.setColor(flavors.latte.colors.base.hex as ColorResolvable);

    balance.setDescription((baltop.pages.get(1) || []).join("\n"));
    guild.setDescription(guilds.pages.get(1).join("\n"));

    const rest = getRest();

    await rest.post(Routes.channelMessages(TOPGLOBAL_CHANNEL_ID), {
      body: { embeds: [balance.toJSON(), guild.toJSON()] },
    });

    log("sent global baltop");
  },
} satisfies Job;

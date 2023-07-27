import { variants } from "@catppuccin/palette";
import { ColorResolvable, EmbedBuilder, WebhookClient } from "discord.js";
import { MStoTime } from "../../utils/functions/date";
import { topBalanceGlobal } from "../../utils/functions/economy/top";
import { logger } from "../../utils/logger";
import dayjs = require("dayjs");
import ms = require("ms");

async function doTopGlobal() {
  const baltop = await topBalanceGlobal(10);

  const embed = new EmbedBuilder();

  embed.setTitle("top 10 richest users");
  embed.setDescription(baltop.join("\n"));
  embed.setColor(variants.latte.base.hex as ColorResolvable);

  const hook = new WebhookClient({ url: process.env.TOPGLOBAL_HOOK });

  await hook.send({ embeds: [embed] });

  logger.info("sent global baltop");

  hook.destroy();
}

export function doTopGlobalDaily() {
  const next = dayjs().add(1, "day").startOf("day").toDate();

  const needed = next.getTime() - Date.now();

  setTimeout(() => {
    doTopGlobal();
    setInterval(() => {
      doTopGlobal();
    }, ms("1 day"));
  }, needed);

  logger.info(`::auto posting top global in ${MStoTime(needed)}`);
}

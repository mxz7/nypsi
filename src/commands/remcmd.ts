import { CategoryChannel, Message } from "discord.js";
import { sort } from "fast-sort";
import { Command } from "../models/Command";
import Constants from "../utils/Constants";
import { logger } from "../utils/logger";

const cmd = new Command("remcmd", "remove a commands channel", "none").setPermissions([
  "bot owner",
]);

cmd.setRun(async (message) => {
  if (message.author.id !== Constants.TEKOH_ID) return;
  if (message.guildId !== Constants.NYPSI_SERVER_ID) return;

  const category = (await message.guild.channels.fetch("1246516186171314337")) as CategoryChannel;

  const { children } = category;

  logger.debug(
    "children",
    children.cache.map((v) => ({ name: v.name, position: v.position })),
  );

  const filtered = Array.from(
    children.cache.filter((channel) => channel.name.startsWith("cmds-")).values(),
  );

  const ordered = sort(filtered).desc((i) => parseInt(i.name.split("-")[1]));

  const toDelete = ordered[0];

  await toDelete.setParent("1060585526945665197"); // archive

  (message as Message).react("✅");
});

module.exports = cmd;

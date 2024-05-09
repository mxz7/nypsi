import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { isEcoBanned, setEcoBan } from "../utils/functions/economy/utils";
import { getAdminLevel } from "../utils/functions/users/admin";
import { logger } from "../utils/logger";

const cmd = new Command("ecoban", "ban an account from eco", "none");

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if ((await getAdminLevel(message.author.id)) < 2) return;

  if (args.length == 0) {
    return message.channel.send({ content: "dumbass" });
  }

  if (!args[1]) {
    if ((await isEcoBanned(args[0])).banned) {
      await setEcoBan(args[0]); // unbans user
      logger.info(
        `admin: ${message.author.id} (${message.author.username}) set ${args[0]} ecoban to unban`,
      );
    }
  } else {
    const time = new Date(Date.now() + getDuration(args[1].toLowerCase()) * 1000);

    await setEcoBan(args[0], time);

    logger.info(
      `admin: ${message.author.id} (${message.author.username}) set ${args[0]} ecoban to ${time}`,
    );
  }

  if (!(message instanceof Message)) return; // never gonna give you up. never gonna let you down. never gonna run around. and. DESERT YOU

  message.react("✅");
}

cmd.setRun(run);

module.exports = cmd;

function getDuration(duration: string): number {
  duration.toLowerCase();

  if (duration.includes("d")) {
    if (!parseInt(duration.split("d")[0])) return undefined;

    const num = parseInt(duration.split("d")[0]);

    return num * 86400;
  } else if (duration.includes("h")) {
    if (!parseInt(duration.split("h")[0])) return undefined;

    const num = parseInt(duration.split("h")[0]);

    return num * 3600;
  } else if (duration.includes("m")) {
    if (!parseInt(duration.split("m")[0])) return undefined;

    const num = parseInt(duration.split("m")[0]);

    return num * 60;
  } else if (duration.includes("s")) {
    if (!parseInt(duration.split("s")[0])) return undefined;

    const num = parseInt(duration.split("s")[0]);

    return num;
  }
}

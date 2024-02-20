import { CommandInteraction, Message } from "discord.js";
import { exec } from "node:child_process";
import prisma from "../init/database";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction } from "../models/Command";
import Constants from "../utils/Constants";
import { getTasksData, loadItems } from "../utils/functions/economy/utils";
import { logger } from "../utils/logger";

const cmd = new Command("reloaditems", "reload items", "none").setPermissions(["bot owner"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (message.author.id != Constants.TEKOH_ID) return;

  loadItems();
  (message.client as NypsiClient).cluster.send("reload_items");

  prisma.task
    .deleteMany({
      where: {
        task_id: { notIn: Object.values(getTasksData()).map((i) => i.id) },
      },
    })
    .then((count) => {
      if (count.count > 0) logger.info(`${count.count} invalid tasks deleted`);
    });

  exec(`redis-cli KEYS "*economy:task*" | xargs redis-cli DEL`);

  return (message as Message).react("✅");
}

cmd.setRun(run);

module.exports = cmd;

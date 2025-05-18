import { CommandInteraction, Message } from "discord.js";
import { exec } from "node:child_process";
import prisma from "../init/database";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { getTasksData, loadItems } from "../utils/functions/economy/utils";
import { logger } from "../utils/logger";
import { getAdminLevel } from "../utils/functions/users/admin";

const cmd = new Command("reloaditems", "reload items", "none").setPermissions(["bot owner"]);

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  if ((await getAdminLevel(this.member)) < 3) return;

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

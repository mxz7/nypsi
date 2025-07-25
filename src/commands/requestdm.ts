import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { ErrorEmbed } from "../models/EmbedBuilders";
import { hasAdminPermission } from "../utils/functions/users/admin";
import { addNotificationToQueue } from "../utils/functions/users/notifications";

const cmd = new Command(
  "requestdm",
  "attempt to send a DM to a given user (this is my way of having fun leave me alone)",
  "none",
);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (!(await hasAdminPermission(message.member, "requestdm"))) return;

  if (args.length < 2) {
    return send({ embeds: [new ErrorEmbed("$requestdm <id> <content>")] });
  }

  const user = args[0];

  args.shift();

  const job = await addNotificationToQueue({
    memberId: user,
    payload: {
      content: args.join(" "),
    },
  }).then((r) => r[0]);

  if (!(message instanceof Message)) return;

  const interval = setInterval(async () => {
    const state = await job.getState();

    switch (state) {
      case "completed":
        clearInterval(interval);
        message.react("✅");
        break;
      case "failed":
        clearInterval(interval);
        message.react("❌");
        break;
      case "unknown":
        clearInterval(interval);
        message.react("❓");
        break;
    }
  }, 500);
}

cmd.setRun(run);

module.exports = cmd;

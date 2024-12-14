import { CommandInteraction, PermissionFlagsBits, TextChannel } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { getPrefix } from "../utils/functions/guilds/utils";
import { isPremium } from "../utils/functions/premium/premium";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import dayjs = require("dayjs");

const cmd = new Command(
  "clean",
  "clean up bot commands and responses",
  "moderation",
).setPermissions(["MANAGE_MESSAGES"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    if (
      (message.channel as TextChannel).parentId !== "747056029795221514" &&
      message.channelId !== "1071476219972948050"
    )
      return;
    if (!(await isPremium(message.member))) return;
  }

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  if (!message.channel.isTextBased()) return;

  if (message.channel.isDMBased()) return;

  await addCooldown(cmd.name, message.member, 15);

  let amount = 50;

  if (args[0] && parseInt(args[0]) && !isNaN(parseInt(args[0]))) {
    amount = parseInt(args[0]);

    if (amount < 2 || amount > 100) amount = 50;
  }

  const [prefix, collected] = await Promise.all([
    getPrefix(message.guild),
    message.channel.messages.fetch({ limit: amount }),
  ]);

  const collecteda = collected.filter(
    (msg) =>
      (msg.author.id == message.client.user.id ||
        prefix.map((i) => msg.content.startsWith(i)).filter((i) => i).length > 0) &&
      dayjs(msg.createdTimestamp).isAfter(dayjs().subtract(14, "days")),
  );

  await message.channel.bulkDelete(collecteda);
}

cmd.setRun(run);

module.exports = cmd;

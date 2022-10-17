import { CommandInteraction, Message } from "discord.js";
import { NypsiClient } from "../models/Client";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import requestDM from "../utils/functions/requestdm";

const cmd = new Command(
  "requestdm",
  "attempt to send a DM to a given user (this is my way of having fun leave me alone)",
  Categories.NONE
);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (message.author.id != Constants.TEKOH_ID) return;

  if (args.length < 2) {
    return message.channel.send({ embeds: [new ErrorEmbed("$requestdm <id> <content>")] });
  }

  const user = args[0];

  args.shift();

  const a = await requestDM({
    client: message.client as NypsiClient,
    memberId: user,
    content: args.join(" "),
  });

  if (!(message instanceof Message)) return;

  if (a) {
    message.react("✅");
  } else {
    message.react("❌");
  }
}

cmd.setRun(run);

module.exports = cmd;

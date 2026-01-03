import { CommandInteraction, MessageFlags } from "discord.js";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addProgress } from "../utils/functions/economy/achievements";
import {
  addEventProgress,
  EventData,
  formatEventProgress,
  getCurrentEvent,
} from "../utils/functions/economy/events";
import { getRandomImage } from "../utils/functions/image";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("rabbit", "get a random picture of a rabbit", "animals").setAliases([
  "bunny",
  "wabbit",
  "bunbuns",
]);

cmd.slashEnabled = true;

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  await addCooldown(cmd.name, message.member, 3);

  const image = await getRandomImage("rabbit").catch((): null => null);

  if (!image) return send({ embeds: [new ErrorEmbed("failed to find a rabbit image")] });

  const eventProgress = await addEventProgress(
    message.client as NypsiClient,
    message.member,
    "animals",
    1,
  );

  let eventData: EventData;

  if (eventProgress) {
    eventData = await getCurrentEvent();
  }

  const embed = new CustomEmbed(
    message.member,
    eventProgress ? formatEventProgress(eventData, eventProgress, message.member) : undefined,
  )
    .disableFooter()
    .setImage(image.url);

  if (image.name) {
    embed.setTitle(image.name);
    embed.setURL(`https://animals.maxz.dev/rabbit/${image.id}`);
  }

  if (Math.floor(Math.random() * 25) === 7)
    embed.setFooter({ text: `upload your pets: animals.maxz.dev` });

  send({ embeds: [embed] });

  addProgress(message.member, "cute", 1);
}

cmd.setRun(run);

module.exports = cmd;

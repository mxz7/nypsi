import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getCurrentEvent, getEventProgress } from "../utils/functions/economy/events";
import { createUser, getEventsData, userExists } from "../utils/functions/economy/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("event", "view event information", "money").setAliases(["events"]);

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

  await addCooldown(cmd.name, message.member, 5);

  if (!(await userExists(message.member))) await createUser(message.member);

  const event = await getCurrentEvent(false);

  if (!event) {
    return send({
      embeds: [new CustomEmbed(message.member, "there is no currently active event")],
      components: [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel("past events")
            .setURL("https://nypsi.xyz/events?ref=bot-event-command")
            .setEmoji("🔱"),
        ),
      ],
    });
  }

  const contributionIndex = event.contributions.findIndex(
    (contribution) => contribution.userId === message.author.id,
  );

  const embed = new CustomEmbed(
    message.member,
    `**${getEventsData()[event.type].name}**\n` +
      `> ${getEventsData()[event.type].description.replaceAll("{target}", event.target.toLocaleString())}\n\n` +
      `ends on <t:${Math.floor(event.expiresAt.getTime() / 1000)}> (<t:${Math.floor(event.expiresAt.getTime() / 1000)}:R>)\n\n` +
      `${getEventProgress(event).toLocaleString()}/${event.target.toLocaleString()}\n` +
      (contributionIndex > -1
        ? `your contribution: ${event.contributions[
            contributionIndex
          ].contribution.toLocaleString()} ` + `(#${(contributionIndex + 1).toLocaleString()})`
        : ""),
  ).setHeader("current event", message.author.avatarURL());

  return send({
    embeds: [embed],
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
        new ButtonBuilder()
          .setEmoji("🔱")
          .setLabel("live data")
          .setStyle(ButtonStyle.Link)
          .setURL("https://nypsi.xyz/events?ref=bot-event-command"),
      ),
    ],
  });
}

cmd.setRun(run);

module.exports = cmd;

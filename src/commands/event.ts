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
import {
  formatEventDescription,
  getCurrentEvent,
  getEventProgress,
} from "../utils/functions/economy/events";
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
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel("what's this?")
            .setEmoji("❓")
            .setURL("https://nypsi.xyz/docs/economy/events?ref=bot-event-command"),
        ),
      ],
    });
  }

  const contributionIndex = event.contributions.findIndex(
    (contribution) => contribution.userId === message.author.id,
  );

  let content =
    `**${getEventsData()[event.type].name}**\n` +
    `> ${formatEventDescription(getEventsData()[event.type], Number(event.target))}\n\n`;

  if (event.expiresAt) {
    content += `ends on <t:${Math.floor(event.expiresAt.getTime() / 1000)}> (<t:${Math.floor(event.expiresAt.getTime() / 1000)}:R>)\n\n`;
  }

  content += getEventProgress(event).toLocaleString();

  if (event.target) {
    content += `/${event.target.toLocaleString()}`;
  }

  if (contributionIndex > -1) {
    content +=
      `\nyour contribution: ${event.contributions[contributionIndex].contribution.toLocaleString()} ` +
      `(#${(contributionIndex + 1).toLocaleString()})`;
  }

  const embed = new CustomEmbed(message.member, content).setHeader(
    "current event",
    message.author.avatarURL(),
  );

  return send({
    embeds: [embed],
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
        new ButtonBuilder()
          .setEmoji("🔱")
          .setLabel("live data")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://nypsi.xyz/events/${event.id}?ref=bot-event-command`),
      ),
    ],
  });
}

cmd.setRun(run);

module.exports = cmd;

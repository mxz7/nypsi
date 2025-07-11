import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getCurrentEvent, getEventProgress } from "../utils/functions/economy/events";
import { getEventsData } from "../utils/functions/economy/utils";

const cmd = new Command("event", "view event information", "money");

cmd.slashEnabled = true;

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data as InteractionEditReplyOptions).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data as InteractionEditReplyOptions).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        });
      }

      if (usedNewMessage && res instanceof Message) return res;

      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  const event = await getCurrentEvent(false);

  if (!event) {
    return send({
      embeds: [new CustomEmbed(message.member, "there is no currently active event")],
      components: [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel("past events")
            .setURL("https://nypsi.xyz/event?ref=bot-event-command")
            .setEmoji("🔱"),
        ),
      ],
    });
  }

  const embed = new CustomEmbed(
    message.member,
    `**${getEventsData()[event.type].name}**\n` +
      `> ${getEventsData()[event.type].description.replaceAll("{target}", event.target.toLocaleString())}\n\n` +
      `ends on <t:${Math.floor(event.expiresAt.getTime() / 1000)}> (<t:${Math.floor(event.expiresAt.getTime() / 1000)}:R>)\n\n` +
      `${getEventProgress(event)}/${event.target.toLocaleString()}\n` +
      `your contribution: ${event.contributions
        .find((contribution) => contribution.userId === message.author.id)
        ?.contribution.toLocaleString()} ` +
      `(#${(event.contributions.findIndex((contribution) => contribution.userId === message.author.id) + 1).toLocaleString()})`,
  ).setHeader("current event", message.author.avatarURL());

  return send({
    embeds: [embed],
    components: [
      new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
        new ButtonBuilder()
          .setEmoji("🔱")
          .setLabel("live data")
          .setStyle(ButtonStyle.Link)
          .setURL("https://nypsi.xyz/event?ref=bot-event-command"),
      ),
    ],
  });
}

cmd.setRun(run);

module.exports = cmd;

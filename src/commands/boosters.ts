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
  MessageFlags,
} from "discord.js";
import { sort } from "fast-sort";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getBoosters } from "../utils/functions/economy/boosters";
import { getItems } from "../utils/functions/economy/utils";
import PageManager from "../utils/functions/page";
import { getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("boosters", "view your current active boosters", "money").setAliases([
  "booster",
]);

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

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const embed = new CustomEmbed(message.member);

  embed.setHeader("your boosters", message.author.avatarURL());

  const desc: string[] = [];

  const items = getItems();
  const boosters = await getBoosters(message.member);

  if (boosters.size == 0) {
    embed.setDescription("you have no active boosters");
    return send({ embeds: [embed] });
  }

  for (const boosterId of sort(Array.from(boosters.keys())).asc((i) => i)) {
    if (boosters.get(boosterId).length == 1) {
      desc.push(
        `**${items[boosterId].name}** ${items[boosterId].emoji} - expires <t:${Math.round(
          boosters.get(boosterId)[0].expire / 1000,
        )}:R>`,
      );
    } else {
      let lowest = boosters.get(boosterId)[0].expire;

      for (const booster of boosters.get(boosterId)) {
        if (booster.expire < lowest) lowest = booster.expire;
      }

      desc.push(
        `**${items[boosterId].name}** ${items[boosterId].emoji} \`x${
          boosters.get(boosterId).length
        }\` - next expires <t:${Math.round(boosters.get(boosterId)[0].expire / 1000)}:R>`,
      );
    }
  }

  const pages = PageManager.createPages(desc, 10);

  embed.setDescription(pages.get(1).join("\n"));

  if (pages.size <= 1) return send({ embeds: [embed] });

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("⬅")
      .setLabel("back")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
  );

  const msg = await send({ embeds: [embed], components: [row] });

  const manager = new PageManager({
    embed,
    message: msg,
    row,
    userId: message.author.id,
    pages,
    onPageUpdate(manager) {
      manager.embed.setFooter({ text: `page ${manager.currentPage}/${manager.lastPage}` });
      return manager.embed;
    },
  });

  return manager.listen();
}

cmd.setRun(run);

module.exports = cmd;

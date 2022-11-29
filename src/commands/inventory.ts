import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { Item } from "../types/Economy";
import { getInventory } from "../utils/functions/economy/inventory";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import PageManager from "../utils/functions/page";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("inventory", "view items in your inventory", Categories.MONEY).setAliases(["inv"]);

cmd.slashEnabled = true;
cmd.slashData.addIntegerOption((option) => option.setName("page").setDescription("page number"));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (!(await userExists(message.member))) await createUser(message.member);

  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data);
        });
      }
      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
  }

  await addCooldown(cmd.name, message.member, 10);

  const inventory = await getInventory(message.member, true);
  const items = getItems();

  if (inventory.length == 0) {
    return send({
      embeds: [
        new CustomEmbed(message.member, "your inventory is empty").setHeader("your inventory", message.author.avatarURL()),
      ],
    });
  }

  inPlaceSort(inventory).asc((i) => i.item);

  const pages = PageManager.createPages(
    inventory.map((i) => items[i.item]),
    6
  );

  const embed = new CustomEmbed(message.member).setFooter({
    text: `page 1/${pages.size}`,
  });

  embed.setHeader("your inventory", message.author.avatarURL());

  const updatePage = (page: Item[], embed: CustomEmbed) => {
    if (embed.data.fields?.length) embed.data.fields.length = 0;

    for (const item of page) {
      embed.addField(
        item.id,
        `${item.emoji} **${item.name}** ~~--~~ *${inventory.find((i) => i.item == item.id).amount.toLocaleString()}*${
          item.shortDesc ? `\n${item.shortDesc}` : ""
        }`,
        true
      );
    }

    return embed;
  };

  updatePage(pages.get(1), embed);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
  );

  let msg: Message;

  if (pages.size == 1) {
    return await send({ embeds: [embed] });
  } else {
    msg = await send({ embeds: [embed], components: [row] });
  }

  const manager = new PageManager({
    embed: embed,
    message: msg,
    userId: message.author.id,
    row: row,
    pages,
    onPageUpdate(manager) {
      manager.embed.setFooter({ text: `page ${manager.currentPage}/${manager.lastPage}` });
      return manager.embed;
    },
    updateEmbed: updatePage,
  });

  return manager.listen();
}

cmd.setRun(run);

module.exports = cmd;

import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { Command } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { Tag } from "../types/Tags";
import { getTagsData } from "../utils/functions/economy/utils";
import PageManager from "../utils/functions/page";
import { getTags, setActiveTag } from "../utils/functions/users/tags";

const cmd = new Command(
  "tags",
  "view, manage and choose a tag to be shown on your profile",
  "money",
).setAliases(["titles", "tag"]);

cmd.setRun((message, args) => {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data).catch(async () => {
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

  const listTags = async () => {
    const tags = await getTags(message.author.id);
    const tagData = getTagsData();

    if (tags.length === 0) {
      return send({ embeds: [new ErrorEmbed("you have no tags")] });
    }

    let pages: Map<number, string[]>;

    if (!tags.find((i) => i.selected))
      pages = PageManager.createPages(
        tags.map((i) => `${tagData[i.tagId].emoji} \`${tagData[i.tagId].name}\``),
      );
    else
      pages = PageManager.createPages([
        `active: ${tagData[tags.find((i) => i.selected).tagId].emoji} \`${
          tagData[tags.find((i) => i.selected).tagId].name
        }\``,
        "",
        ...tags.map((i) => `${tagData[i.tagId].emoji} \`${tagData[i.tagId].name}\``),
      ]);

    const embed = new CustomEmbed(message.member, pages.get(1).join("\n")).setHeader(
      message.author.username,
      message.author.displayAvatarURL(),
    );

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("⬅")
        .setLabel("back")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
    );

    if (pages.size === 1) {
      return send({ embeds: [embed] });
    }

    const msg = await send({ embeds: [embed], components: [row] });

    const manager = new PageManager({
      embed,
      message: msg,
      row,
      userId: message.author.id,
      pages,
    });

    return manager.listen();
  };

  const selectTag = async (search: string) => {
    const tags = await getTags(message.author.id);
    const tagData = getTagsData();

    let selected: Tag;

    for (const tag of Object.values(tagData)) {
      if (search.toLowerCase() === tag.id) {
        selected = tag;
        break;
      } else if (search.toLowerCase() === tag.name) {
        selected = tag;
        break;
      }
    }

    if (!selected && search !== "none") return send({ embeds: [new ErrorEmbed("unknown tag")] });

    if (!tags.find((i) => i.tagId === selected.id) && search !== "none") {
      return send({ embeds: [new ErrorEmbed("you dont have this tag")] });
    }

    if (search === "none") await setActiveTag(message.author.id, "none");
    else await setActiveTag(message.author.id, selected.id);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `your active tag is now: ${selected.emoji} \`${selected.name}\``,
        ),
      ],
    });
  };

  if (args.length === 0 || args[0].toLowerCase() === "list") {
    return listTags();
  }

  if (["choose", "select"].includes(args[0].toLowerCase())) args.shift();

  return selectTag(args.join(" ").toLowerCase());
});

export = cmd;

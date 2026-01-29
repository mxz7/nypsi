import { EmbedField } from "discord.js";
import { sort } from "fast-sort";
import { readFile } from "fs/promises";
import { Command } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { Tag } from "../types/Tags";
import Constants from "../utils/Constants";
import { getTagsData } from "../utils/functions/economy/utils";
import PageManager from "../utils/functions/page";
import { getTagCount, getTags, setActiveTag, showTags } from "../utils/functions/users/tags";

const cmd = new Command(
  "tags",
  "view, manage and choose a tag to be shown on your profile",
  "money",
).setAliases(["titles", "tag"]);

cmd.setRun((message, send, args) => {
  const listTags = async () => {
    const { pages, embed } = await showTags(message.member);

    const row = PageManager.defaultRow();

    switch (pages.size) {
      case 0:
        return send({ embeds: [new ErrorEmbed("you have no tags")] });
      case 1:
        return send({ embeds: [embed] });
    }

    const msg = await send({ embeds: [embed], components: [row] });

    const manager = new PageManager({
      embed,
      message: msg,
      row,
      userId: message.author.id,
      allowMessageDupe: true,
      pages,
    });

    return manager.listen();
  };

  const selectTag = async (search: string) => {
    const tags = await getTags(message.member);
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

    if (search !== "none" && !tags.find((i) => i.tagId === selected.id)) {
      return send({ embeds: [new ErrorEmbed("you dont have this tag")] });
    }

    if (search === "none") {
      await setActiveTag(message.member, "none");

      send({
        embeds: [new CustomEmbed(message.member, `disabled any active tag`)],
      });

      if (message.guildId === Constants.NYPSI_SERVER_ID) {
        const role = message.member.roles.cache.find((r) => r.name === "custom");

        if (role) {
          await role.setUnicodeEmoji(null);
          await role.setIcon(null);
        }
      }
    }

    await setActiveTag(message.member, selected.id);

    send({
      embeds: [
        new CustomEmbed(
          message.member,
          `your active tag is now: ${selected.emoji} \`${selected.name}\``,
        ),
      ],
    });

    if (message.guildId === Constants.NYPSI_SERVER_ID) {
      const role = message.member.roles.cache.find((r) => r.name === "custom");

      if (role) {
        const tagEmoji = getTagsData()[selected.id].emoji;
        const isTagUnicode = Constants.EMOJI_REGEX.test(tagEmoji || "");
        let emojiBuffer: Buffer<ArrayBufferLike>;

        if (tagEmoji && !isTagUnicode) {
          emojiBuffer = await readFile(`data/emojis/${getTagsData()[selected.id].image}`);
        }

        if (isTagUnicode) {
          await role.setUnicodeEmoji(tagEmoji);
          await role.setIcon(null);
        } else {
          await role.setUnicodeEmoji(null);
          await role.setIcon(emojiBuffer);
        }
      }
    }
  };

  const listAllTags = async () => {
    const tagData = getTagsData();
    const userTags = await getTags(message.member);

    const tagList: { title: string; value: string; owned: boolean }[] = [];

    for (const [id, data] of Object.entries(tagData)) {
      tagList.push({
        title: id,
        value: `${data.emoji} **${data.name}**\n${data.description}\n**${(
          await getTagCount(id)
        ).toLocaleString()}** in world${userTags.find((i) => i.tagId === id) ? "\n*owned*" : ""}`,
        owned: Boolean(userTags.find((i) => i.tagId === id)),
      });
    }

    const owned = tagList.filter((i) => i.owned).length;

    const pages = PageManager.createPages(
      sort(tagList)
        .asc([(i) => i.owned, (i) => i.title])
        .map((i) => {
          return { name: i.title, value: i.value, inline: true } as EmbedField;
        }),
      6,
    );

    const embed = new CustomEmbed(message.member)
      .setHeader("all tags", message.author.avatarURL())
      .setFooter({ text: `${owned}/${Object.entries(tagData).length} owned` });

    embed.setFields(...pages.get(1));

    const msg = await send({ embeds: [embed], components: [PageManager.defaultRow()] });

    const manager = new PageManager({
      embed,
      message: msg,
      row: PageManager.defaultRow(),
      userId: message.author.id,
      pages,
      allowMessageDupe: true,
      updateEmbed(page, embed) {
        embed.setFields(...page);

        return embed;
      },
    });

    return manager.listen();
  };

  if (args.length === 0 || args[0].toLowerCase() === "list") {
    return listTags();
  } else if (args[0].toLowerCase() === "all") {
    return listAllTags();
  }

  if (["choose", "select"].includes(args[0].toLowerCase())) args.shift();

  return selectTag(args.join(" ").toLowerCase());
});

export = cmd;

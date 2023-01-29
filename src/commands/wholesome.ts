import { WholesomeSuggestion } from "@prisma/client";
import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageReaction,
  User,
} from "discord.js";
import prisma from "../init/database";
import { NypsiClient } from "../models/Client";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { formatDate } from "../utils/functions/date";
import { getPrefix } from "../utils/functions/guilds/utils";
import {
  acceptWholesomeImage,
  clearWholesomeCache,
  deleteFromWholesome,
  denyWholesomeImage,
  getAllSuggestions,
  getWholesomeImage,
  isImageUrl,
  suggestWholesomeImage,
  uploadImageToImgur,
} from "../utils/functions/image";
import { getMember } from "../utils/functions/member";
import PageManager from "../utils/functions/page";
import { getLastKnownTag } from "../utils/functions/users/tag";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const uploadCooldown = new Map<string, number>();

const cmd = new Command("wholesome", "get a random wholesome picture", Categories.FUN).setAliases([
  "iloveyou",
  "loveu",
  "ws",
  "ily",
]);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
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

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
  }

  const prefix = await getPrefix(message.guild);

  const embed = new CustomEmbed(message.member);

  let target;

  if (args.length == 0 || !(message instanceof Message)) {
    const image = await getWholesomeImage();

    embed.setHeader(`<3 | #${image.id}`);
    embed.setImage(image.image);
  } else if (args[0].toLowerCase() == "add" || args[0].toLowerCase() == "suggest" || args[0].toLowerCase() == "+") {
    if (uploadCooldown.has(message.member.id)) {
      const init = uploadCooldown.get(message.member.id);
      const curr = new Date();
      const diff = Math.round((curr.getTime() - init) / 1000);
      const time = 25 - diff;

      const minutes = Math.floor(time / 60);
      const seconds = time - minutes * 60;

      let remaining: string;

      if (minutes != 0) {
        remaining = `${minutes}m${seconds}s`;
      } else {
        remaining = `${seconds}s`;
      }

      return send({
        embeds: [new ErrorEmbed(`you are on upload cooldown for \`${remaining}\``)],
      });
    }

    if (args.length == 1 && !message.attachments.first()) {
      return send({
        embeds: [new ErrorEmbed(`${prefix}wholesome suggest <imgur url>`)],
      });
    }

    let url = args[1];

    if (message.attachments.first()) {
      url = message.attachments.first().url;
    }

    if (!url.toLowerCase().startsWith("https")) {
      return send({ embeds: [new ErrorEmbed("must be http**s**")] });
    }

    if (!url.toLowerCase().startsWith("https://i.imgur.com/")) {
      if (!isImageUrl(url)) {
        return send({
          embeds: [new ErrorEmbed("must be an image hosted on https://imgur.com\n\ntutorial: https://youtu.be/xaRu40hawUE")],
        });
      }

      const upload = await uploadImageToImgur(url);

      if (!upload) {
        return send({
          embeds: [new ErrorEmbed("must be an image hosted on https://imgur.com\n\ntutorial: https://youtu.be/xaRu40hawUE")],
        });
      } else {
        uploadCooldown.set(message.member.id, new Date().getTime());

        setTimeout(() => {
          uploadCooldown.delete(message.author.id);
        }, 25 * 1000);
        url = upload;
      }
    }

    const res = await suggestWholesomeImage(message.member, url);

    if (!res) {
      return send({
        embeds: [
          new ErrorEmbed(`error: maybe that image already exists? if this persists join the ${prefix}support server`),
        ],
      });
    }

    await addCooldown(cmd.name, message.member, 15);

    return message.react("✅");
  } else if (args[0].toLowerCase() == "get") {
    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed("dumbass")] });
    }

    const wholesome = await getWholesomeImage(parseInt(args[1]));

    if (!wholesome) {
      return message.react("❌");
    }

    embed.setHeader(`image #${wholesome.id}`);

    if (message.author.id == Constants.TEKOH_ID) {
      embed.setDescription(
        `**suggested by** ${wholesome.submitter} (${wholesome.submitterId})\n**accepted by** \`${wholesome.accepterId}\`\n**url** ${wholesome.image}`
      );
    }

    embed.setImage(wholesome.image);
    embed.setFooter({ text: `submitted on ${formatDate(wholesome.uploadDate)}` });
  } else if (args[0].toLowerCase() == "accept" || args[0].toLowerCase() == "a") {
    if (message.author.id !== Constants.TEKOH_ID) return;

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed("you must include the suggestion id")] });
    }

    const res = await acceptWholesomeImage(parseInt(args[1]), message.member, message.client as NypsiClient);

    if (!res) {
      return send({
        embeds: [new ErrorEmbed(`couldnt find a suggestion with id \`${args[1]}\``)],
      });
    }

    return message.react("✅");
  } else if (args[0].toLowerCase() == "deny" || args[0].toLowerCase() == "d") {
    if (message.author.id !== Constants.TEKOH_ID) return;

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed("you must include the suggestion id")] });
    }

    const res = await denyWholesomeImage(parseInt(args[1]), message.member);

    if (!res) {
      return send({
        embeds: [new ErrorEmbed(`couldnt find a suggestion with id \`${args[1]}\``)],
      });
    }

    return message.react("✅");
  } else if (args[0].toLowerCase() == "delete") {
    if (message.author.id != Constants.TEKOH_ID) return;

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed("dumbass")] });
    }

    const res = await deleteFromWholesome(parseInt(args[1]));

    if (!res) {
      return message.react("❌");
    }

    return message.react("✅");
  } else if (args[0].toLowerCase() == "reload") {
    if (message.author.id != Constants.TEKOH_ID) return;

    clearWholesomeCache();

    return message.react("✅");
  } else if (args[0].toLowerCase() == "queue" || args[0].toLowerCase() == "q") {
    if (message.guild.id != "747056029795221513") return;

    const roles = message.member.roles.cache;

    let allow = false;

    if (roles.has("747056620688900139")) allow = true;
    if (roles.has("747059949770768475")) allow = true;
    if (roles.has("845613231229370429")) allow = true;
    if (roles.has("1023950187661635605")) allow = true;

    if (!allow) return;

    const queue = await getAllSuggestions();

    if (!queue) return send({ embeds: [new CustomEmbed(message.member, "no items in queue")] });

    const pages = PageManager.createPages(queue, 6);

    for (const image of queue) {
      if (embed.data.fields.length >= 6) break;

      embed.addField(image.id.toString(), `**suggested** ${image.submitter} (${image.submitterId})\n**url** ${image.image}`);
    }

    embed.setHeader("wholesome queue");

    if (queue.length == 0) {
      embed.setDescription("no wholesome suggestions");
    }

    if (pages.size != 0) {
      embed.setFooter({ text: `page 1/${pages.size}` });
    }

    const msg = await send({ embeds: [embed] });

    if (pages.size == 0) return;

    await msg.react("⬅");
    await msg.react("➡");

    let currentPage = 1;
    const lastPage = pages.size;

    const filter = (reaction: MessageReaction, user: User) => {
      return ["⬅", "➡"].includes(reaction.emoji.name) && user.id == message.member.user.id;
    };

    const pageManager = async (): Promise<void> => {
      const reaction = await msg
        .awaitReactions({ filter, max: 1, time: 30000, errors: ["time"] })
        .then((collected) => {
          return collected.first().emoji.name;
        })
        .catch(async () => {
          await msg.reactions.removeAll();
        });

      if (!reaction) return;

      const newEmbed = new CustomEmbed(message.member).setHeader("wholesome queue");

      if (reaction == "⬅") {
        if (currentPage <= 1) {
          return pageManager();
        } else {
          currentPage--;

          for (const image of pages.get(currentPage)) {
            newEmbed.addField(
              image.id.toString(),
              `**suggested** ${image.submitter} (${image.submitterId})\n**url** ${image.image})`
            );
          }

          newEmbed.setFooter({ text: `page ${currentPage}/${lastPage}` });
          await msg.edit({ embeds: [newEmbed] });
          return pageManager();
        }
      } else if (reaction == "➡") {
        if (currentPage >= lastPage) {
          return pageManager();
        } else {
          currentPage++;

          for (const image of pages.get(currentPage)) {
            newEmbed.addField(
              image.id.toString(),
              `**suggested** ${image.submitter} (${image.submitterId})\n**url** ${image.image})`
            );
          }

          newEmbed.setFooter({ text: `page ${currentPage}/${lastPage}` });
          await msg.edit({ embeds: [newEmbed] });
          return pageManager();
        }
      }
    };

    return pageManager();
  } else if (args[0].toLowerCase() === "review") {
    if (message.guild.id != "747056029795221513") return;

    const roles = message.member.roles.cache;

    let allow = false;

    if (roles.has("747056620688900139")) allow = true;
    if (roles.has("747059949770768475")) allow = true;
    if (roles.has("845613231229370429")) allow = true;
    if (roles.has("1023950187661635605")) allow = true;

    if (!allow) return;

    const reviewSuggestions = async (msg: Message): Promise<any> => {
      const count = await prisma.wholesomeSuggestion.count({
        where: { submitterId: { not: message.author.id } },
      });
      let suggestion = await prisma.wholesomeSuggestion.findFirst({
        where: { submitterId: { not: message.author.id } },
        skip: Math.floor(Math.random() * count),
      });

      if (!suggestion)
        return msg.edit({
          embeds: [new CustomEmbed(message.member, "you're done 🙂 no more suggestions left")],
          components: [],
        });

      await msg.edit({
        embeds: [
          new CustomEmbed(
            message.member,
            `suggested by ${suggestion.submitter} (${suggestion.submitterId}) on <t:${Math.floor(
              suggestion.uploadDate.getTime() / 1000
            )}>\n${suggestion.image}`
          ).setImage(suggestion.image),
        ],
      });

      const filter = (interaction: Interaction) => interaction.user.id === message.author.id;
      let fail = false;

      const res = await msg.awaitMessageComponent({ filter, time: 30000 }).catch(() => {
        fail = true;
      });

      if (fail || !res) return msg.edit({ components: [] });

      suggestion = await prisma.wholesomeSuggestion
        .findUnique({
          where: {
            id: suggestion.id,
          },
        })
        .catch(() => {
          return {} as WholesomeSuggestion;
        });

      if (!suggestion) {
        await res.reply({
          embeds: [new CustomEmbed(message.member, "this suggestion no longer exists, perhaps someone beat you to it")],
          ephemeral: true,
        });
        return reviewSuggestions(msg);
      }

      if (res.customId === "accept") {
        await res.deferUpdate();
        await acceptWholesomeImage(suggestion.id, message.member, message.client as NypsiClient);
        return reviewSuggestions(msg);
      } else {
        await res.deferUpdate();
        await denyWholesomeImage(suggestion.id, message.member);
        return reviewSuggestions(msg);
      }
    };

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("accept").setLabel("accept").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("deny").setLabel("deny").setStyle(ButtonStyle.Danger)
    );

    const reviewExisting = async (msg: Message): Promise<any> => {
      let suggestion = await getWholesomeImage();

      if (!suggestion)
        return msg.edit({
          embeds: [new CustomEmbed(message.member, "failed to find image")],
          components: [],
        });

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("accept").setLabel("keep").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("deny").setLabel("remove").setStyle(ButtonStyle.Danger)
      );

      await msg.edit({
        embeds: [
          new CustomEmbed(
            message.member,
            `suggested by ${await getLastKnownTag(suggestion.submitterId)} (${suggestion.submitterId}) on <t:${Math.floor(
              suggestion.uploadDate.getTime() / 1000
            )}>\naccepted by ${await getLastKnownTag(suggestion.accepterId)} (${suggestion.accepterId})\n${suggestion.image}`
          ).setImage(suggestion.image),
        ],
        components: [row],
      });

      const filter = (interaction: Interaction) => interaction.user.id === message.author.id;
      let fail = false;

      const res = await msg.awaitMessageComponent({ filter, time: 30000 }).catch(() => {
        fail = true;
      });

      if (fail || !res) return msg.edit({ components: [] });

      suggestion = await getWholesomeImage(suggestion.id);

      if (!suggestion) {
        await res.reply({
          embeds: [new CustomEmbed(message.member, "this suggestion no longer exists, perhaps someone beat you to it")],
          ephemeral: true,
        });
        return reviewExisting(msg);
      }

      if (res.customId === "accept") {
        await res.deferUpdate();
        return reviewExisting(msg);
      } else {
        await res.deferUpdate();
        await deleteFromWholesome(suggestion.id);
        return reviewExisting(msg);
      }
    };

    const msg = await message.channel.send({ embeds: [new CustomEmbed(message.member, "loading...")], components: [row] });

    if (args[1]?.toLowerCase() === "existing") return reviewExisting(msg);
    return reviewSuggestions(msg);
  } else {
    let member;

    if (!message.mentions.members.first()) {
      member = await getMember(message.guild, args.join(" "));
    } else {
      member = message.mentions.members.first();
    }

    if (member) {
      target = member;
    } else {
      return send({ embeds: [new ErrorEmbed("couldnt find that member ):")] });
    }

    const image = await getWholesomeImage();

    embed.setHeader(`<3 | #${image.id}`);
    embed.setImage(image.image);
  }

  await addCooldown(cmd.name, message.member, 7);

  const chance = Math.floor(Math.random() * 25);

  if (chance == 7) embed.setFooter({ text: `submit your own image with ${prefix}wholesome suggest (:` });

  if (target) {
    if (message instanceof Message) {
      await message.delete();
    }
    return send({
      content: `${target.user.toString()} you've received a wholesome image (:`,
      embeds: [embed],
    });
  }

  return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;

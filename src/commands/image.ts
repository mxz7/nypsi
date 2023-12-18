import { ImageType } from "@prisma/client";
import { Attachment, BaseMessageOptions, InteractionReplyOptions, Message } from "discord.js";
import { NypsiClient } from "../models/Client";
import { Command } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addProgress } from "../utils/functions/economy/achievements";
import { getRawLevel } from "../utils/functions/economy/levelling";
import { isEcoBanned, userExists } from "../utils/functions/economy/utils";
import { getRandomImage, suggestImage } from "../utils/functions/image";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("image", "view random cute images & upload your own", "animals").setAliases(
  ["img"],
);

const categories = [
  { name: "cat", value: "cat" },
  { name: "dog", value: "dog" },
  { name: "wholesome", value: "wholesome" },
];

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((cat) => cat.setName("cat").setDescription("get a picture of a cat"))
  .addSubcommand((dog) => dog.setName("dog").setDescription("get a picture of a dog"))
  .addSubcommand((upload) =>
    upload
      .setName("upload")
      .setDescription("upload one of your own pictures")
      .addStringOption((option) =>
        option
          .setName("type")
          .setDescription("type of picture you're uploading")
          .setChoices(...categories)
          .setRequired(true),
      )
      .addAttachmentOption((option) =>
        option
          .setName("image")
          .setDescription("image you want to upload (must match the type)")
          .setRequired(true),
      ),
  );

cmd.setRun(async (message, args) => {
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

  let categories: ImageType[] = [];

  if (args.length === 0) {
    categories = ["cat", "dog"];
  } else if (args[0].toLowerCase() === "cat") {
    categories = ["cat"];
  } else if (args[0].toLowerCase() === "dog") {
    categories = ["dog"];
  } else if (args[0].toLowerCase() === "upload") {
    if (!(await userExists(message.member)))
      return send({
        embeds: [
          new ErrorEmbed(
            "you must be at least prestige 1 to upload images\nthis is to prevent abuse",
          ),
        ],
      });

    if (await isEcoBanned(message.author.id))
      return send({
        embeds: [new ErrorEmbed("you are currently banned and cannot upload images")],
      });

    if ((await getRawLevel(message.member)) < 100)
      return send({
        embeds: [
          new ErrorEmbed(
            "you must be at least prestige 1 to upload images\nthis is to prevent abuse",
          ),
        ],
      });

    if (args.length < 2) return send({ embeds: [new ErrorEmbed("/image upload <type> <file>")] });

    if (!["cat", "dog", "wholesome"].includes(args[1].toLowerCase()))
      return send({ embeds: [new ErrorEmbed("invalid suggestion type")] });

    let attachment: Attachment;

    if (message instanceof Message) {
      if (!message.attachments.first())
        return send({ embeds: [new ErrorEmbed("you must upload an image")] });
      attachment = message.attachments.first();
    } else {
      attachment = message.options.get("image").attachment as Attachment;
    }

    if (attachment.size > 7e6) return send({ embeds: [new ErrorEmbed("file too big")] });

    if (!["jpeg", "jpg", "gif", "png"].includes(attachment.contentType.split("/")[1]))
      return send({ embeds: [new ErrorEmbed("invalid file type. must be an image")] });

    await addCooldown(cmd.name, message.member, 30);

    const suggestion = await suggestImage(
      message.author.id,
      args[1].toLowerCase() as ImageType,
      attachment.url,
      message.client as NypsiClient,
    );

    if (suggestion === "ok") {
      return send({
        embeds: [
          new CustomEmbed(message.member, `✅ your ${args[1]} image has been suggested`)
            .setImage(attachment.url)
            .setHeader("image suggestion", message.author.avatarURL()),
        ],
      });
    } else if (suggestion === "fail") {
      return send({ embeds: [new ErrorEmbed("failed to suggest image")] });
    } else if (suggestion === "limit") {
      return send({
        embeds: [
          new ErrorEmbed("you have too many suggestions queued, they will be reviewed soon"),
        ],
      });
    }
  }

  await addCooldown(cmd.name, message.member, 7);

  const image = await getRandomImage(
    categories[Math.floor(Math.random() * categories.length)],
  ).catch(() => null);

  if (!image) return send({ embeds: [new ErrorEmbed("unable to find a picture ):")] });

  const embed = new CustomEmbed(message.member)
    .setImage(image.url)
    .setFooter({ text: `#${image.id}` });

  addProgress(message.author.id, "cute", 1);

  return send({ embeds: [embed] });
});

module.exports = cmd;

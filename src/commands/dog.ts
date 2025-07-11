import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageFlags,
} from "discord.js";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { addProgress } from "../utils/functions/economy/achievements";
import { addEventProgress, getCurrentEvent } from "../utils/functions/economy/events";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import { getRandomImage } from "../utils/functions/image";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("dog", "get a random picture of a dog", "animals");

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

  await addCooldown(cmd.name, message.member, 3);

  const image = await getRandomImage("dog").catch(() => {});

  if (!image) return send({ embeds: [new ErrorEmbed("failed to find a dog image")] });

  const eventProgress = await addEventProgress(
    message.client as NypsiClient,
    message.member,
    "animals",
    1,
  );

  const embed = new CustomEmbed(
    message.member,
    eventProgress
      ? `🔱 ${eventProgress.toLocaleString()}/${((await getCurrentEvent()).target || 0).toLocaleString()}`
      : undefined,
  )
    .disableFooter()
    .setImage(image.url);

  if (image.name) {
    embed.setTitle(image.name);
    embed.setURL(`https://animals.maxz.dev/dog/${image.id}`);
  }

  if (Math.floor(Math.random() * 25) === 7)
    embed.setFooter({ text: `upload your pets: animals.maxz.dev` });

  send({ embeds: [embed] });

  addProgress(message.member, "cute", 1);
  addTaskProgress(message.member, "dogs_daily");
}

cmd.setRun(run);

module.exports = cmd;

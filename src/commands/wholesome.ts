import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getRandomImage } from "../utils/functions/image";
import { getMember } from "../utils/functions/member";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("wholesome", "get a random wholesome picture", "fun").setAliases([
  "iloveyou",
  "loveu",
  "ws",
  "ily",
  "ifuckingloveyouwithallmyfuckingheartsoletshaveroughkinkysexrightfuckingnow",
  "ifuckingloveoyou",
  "letsgetmarriediloveyoumysexydiscordegirl",
  "heyyyyiloveyouuuuu",
  "imissyouiloveyoucomebackmydiscordegirl",
  "wannaedate",
]);

cmd.slashEnabled = true;

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
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

  const embed = new CustomEmbed(message.member);

  let target;

  if (args.length == 0 || !(message instanceof Message)) {
    const image = await getRandomImage("wholesome");

    embed.setFooter({ text: `<3 | #${image.id}` });
    embed.setImage(image.url);
  } else {
    const member = await getMember(message.guild, args.join(" "));

    if (member) {
      target = member;
    } else {
      return send({ embeds: [new ErrorEmbed("couldnt find that member ):")] });
    }

    const image = await getRandomImage("wholesome");

    embed.setFooter({ text: `<3 | #${image.id}` });
    embed.setImage(image.url);
  }

  await addCooldown(cmd.name, message.member, 7);

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

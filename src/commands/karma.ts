import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getKarma, removeKarma } from "../utils/functions/karma/karma";
import { getMember } from "../utils/functions/member";

const cmd = new Command("karma", "check how much karma you have", Categories.INFO).setDocs(
  "https://docs.nypsi.xyz/economy/karma"
);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((option) => option.setName("user").setDescription("user to get karma of"));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  let target = message.member;

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

  if (args.length >= 1) {
    if (message.author.id == Constants.TEKOH_ID && args[0] == "remove") {
      if (!args[1] || !args[2]) {
        return send({
          embeds: [new CustomEmbed(message.member, "$karma remove <userid> <amount>")],
        });
      }

      await removeKarma(args[1], parseInt(args[2]));
    }
    target = message.mentions.members.first();

    if (!target) {
      target = await getMember(message.guild, args.join(" "));
    }

    if (!target) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }
  }

  const karma = await getKarma(target);

  const embed = new CustomEmbed(message.member);

  if (target.user.id == message.author.id) {
    embed.setHeader("your karma", message.author.avatarURL());
    embed.setDescription(`you have **${karma.toLocaleString()}** karma 🔮`);
  } else {
    embed.setHeader(`${target.user.username}'s karma`, target.user.avatarURL());
    embed.setDescription(`${target.user.username} has **${karma.toLocaleString()}** karma 🔮`);
  }

  embed.setFooter({ text: `whats karma? do ${await getPrefix(message.guild)}karmahelp` });

  return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;

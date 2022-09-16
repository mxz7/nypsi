import { CommandInteraction, InteractionReplyOptions, Message, MessageOptions } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { calcMaxBet, createUser, formatNumber, getDefaultBet, setDefaultBet, userExists } from "../utils/economy/utils";
import { getPrefix } from "../utils/guilds/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("defaultbet", "set your default bet", Categories.MONEY).setAliases(["preset"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  if (!(await userExists(message.member))) await createUser(message.member);

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  const send = async (data: MessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions);
      }
      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as MessageOptions);
    }
  };

  const prefix = await getPrefix(message.guild);
  const defaultBet = await getDefaultBet(message.member);

  if (args.length == 0) {
    if (!defaultBet) {
      const embed = new CustomEmbed(message.member).setHeader("default bet", message.author.avatarURL());

      embed.setDescription(
        `you do not currently have a default bet. use ${prefix}**defaultbet <amount/reset>** to set your default bet`
      );

      return send({ embeds: [embed] });
    } else {
      const embed = new CustomEmbed(message.member).setHeader("default bet", message.author.avatarURL());

      embed.setDescription(
        `your default bet is $**${defaultBet.toLocaleString()}**` +
          `\n\nuse ${prefix}**defaultbet <amount/reset>** to change this`
      );

      return send({ embeds: [embed] });
    }
  }

  if (args[0].toLocaleLowerCase() == "reset") {
    setDefaultBet(message.member, null);

    const embed = new CustomEmbed(message.member);

    embed.setDescription(":white_check_mark: your default bet has been reset");

    return send({ embeds: [embed] });
  }

  const maxBet = await calcMaxBet(message.member);

  const bet = formatNumber(args[0]);

  if (!bet || isNaN(bet)) {
    return send({ embeds: [new ErrorEmbed("invalid amount")] });
  }

  if (bet <= 0) {
    return send({ embeds: [new ErrorEmbed("your default bet must be greater than 0")] });
  }

  if (bet > maxBet) {
    return send({
      embeds: [
        new ErrorEmbed(`your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`),
      ],
    });
  }

  await addCooldown(cmd.name, message.member, 5);

  await setDefaultBet(message.member, bet);

  const embed = new CustomEmbed(message.member);

  embed.setDescription(`:white_check_mark: your default bet has been set to $${bet.toLocaleString()}`);

  return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;

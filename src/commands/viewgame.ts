import {
  ActionRowBuilder,
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { fetchGame } from "../utils/functions/economy/stats";
import { getLastKnownTag } from "../utils/functions/users/tag";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("viewgame", "view information about a completed gambling game", Categories.INFO).setAliases([
  "game",
  "id",
]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
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

  if (args.length == 0) {
    return send({ embeds: [new CustomEmbed(message.member, "$viewgame <id> - view information about a game")] });
  }

  await addCooldown(cmd.name, message.member, 7);

  const game = await fetchGame(args[0].toLowerCase());

  if (!game) return send({ embeds: [new ErrorEmbed(`couldn't find a game with id \`${game}\``)] });

  const embed = new CustomEmbed(message.member).setHeader(game.id, message.author.id);

  const tag = (await getLastKnownTag(game.userId))?.split("#")[0];

  let components: ActionRowBuilder<MessageActionRowComponentBuilder>[];

  let desc =
    `**user** \`${tag || "[redacted]"}\`\n` +
    `**game** ${game.game}\n` +
    `**bet** ${game.bet.toLocaleString()}\n` +
    `**won** ${game.win}\n`;

  if (game.outcome.startsWith("mines:")) {
    components = JSON.parse(
      game.outcome.slice(6, game.outcome.length)
    ) as ActionRowBuilder<MessageActionRowComponentBuilder>[];
  } else {
    desc += `**outcome** ${game.outcome}`;
  }

  if (game.win) {
    embed.addField("rewards", `**money** $${game.earned.toLocaleString()}\n**xp** ${game.xpEarned}xp`);
  }

  embed.setDescription(desc);

  return send({ embeds: [embed], components });
}

cmd.setRun(run);

module.exports = cmd;

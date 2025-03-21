import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  GuildMember,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import prisma from "../init/database";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { MStoTime } from "../utils/functions/date";
import { startGTFGame } from "../utils/functions/gtf/game";
import { getMember } from "../utils/functions/member";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import ms = require("ms");

const cmd = new Command("guesstheflag", "play a guess the flag game", "fun").setAliases([
  "gtf",
  "flag",
]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((option) => option.setName("play").setDescription("play a game of guess the flag"))
  .addSubcommand((option) =>
    option.setName("stats").setDescription("view your guess the flag stats"),
  )
  .addSubcommand((duel) =>
    duel
      .setName("duel")
      .setDescription("duel a member in a game of guess the flag")
      .addUserOption((option) =>
        option.setName("member").setDescription("member to duel").setRequired(false),
      ),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
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

  if (args.length === 0) {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          "**/guesstheflag play** *play a game*\n" +
            "**/guesstheflag stats** *view your stats*\n" +
            "**/guesstheflag duel <member>** *duel a member in guess the flag*",
        ).setHeader("guess the flag help", message.author.avatarURL()),
      ],
    });
  } else if (args[0].toLowerCase() === "play" || args[0].toLowerCase() === "p") {
    await addCooldown(cmd.name, message.member, 20);
    return startGTFGame(message);
  } else if (args[0].toLowerCase() === "stats") {
    await addCooldown(cmd.name, message.member, 20);
    const [quick, average, won, lost] = await Promise.all([
      prisma.flagGame.aggregate({
        _min: {
          time: true,
        },
        where: { AND: [{ userId: message.author.id }, { won: true }] },
      }),
      prisma.flagGame.aggregate({
        _avg: {
          time: true,
        },
        where: { AND: [{ userId: message.author.id }, { won: true }] },
      }),
      prisma.flagGame.count({ where: { AND: [{ userId: message.author.id }, { won: true }] } }),
      prisma.flagGame.count({ where: { AND: [{ userId: message.author.id }, { won: false }] } }),
    ]);

    const embed = new CustomEmbed(
      message.member,
      `you have won ${won.toLocaleString()} games of ${(won + lost).toLocaleString()} total games (${((won / (won + lost)) * 100).toFixed(1)}%)\n\n` +
        `your fastest game was \`${MStoTime(quick._min.time)}\`\n` +
        `your average win takes \`${MStoTime(average._avg.time)}\``,
    ).setHeader(`${message.author.username}'s guess the flag stats`);

    return send({ embeds: [embed] });
  } else if (args[0].toLowerCase() === "duel") {
    let target: GuildMember;

    if (args[1]) {
      target = await getMember(message.guild, args[1]);
      if (!target) return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    const requestEmbed = new CustomEmbed(message.member);
    const requestRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("gtf-accept")
        .setLabel("accept")
        .setStyle(ButtonStyle.Success),
    );

    let requestMessage: Message;

    if (target) {
      requestEmbed.setDescription(
        `**${message.author.username}** has challenged you to a guess the flag game\n\ndo you accept?`,
      );
      requestRow.addComponents(
        new ButtonBuilder().setCustomId("gtf-deny").setLabel("deny").setStyle(ButtonStyle.Danger),
      );
      requestMessage = await send({
        content: `${target.user.toString()} you have been invited to a guess the flag game`,
        embeds: [requestEmbed],
        components: [requestRow],
      });
    } else {
      requestEmbed.setDescription(
        `**${message.author.username}** has created an open guess the flag game`,
      );
      requestRow.addComponents(
        new ButtonBuilder().setCustomId("gtf-deny").setLabel("cancel").setStyle(ButtonStyle.Danger),
      );
      requestMessage = await send({
        embeds: [requestEmbed],
        components: [requestRow],
      });
    }

    const res = await requestMessage
      .awaitMessageComponent({
        filter: (i) =>
          target ? i.user.id === target?.user?.id || i.user.id === message.author.id : true,
        time: 30000,
        componentType: ComponentType.Button,
      })
      .catch(() => {});

    if (!res) {
      requestRow.components.forEach((c) => c.setDisabled(true));
      await requestMessage.edit({ components: [requestRow] }).catch(() => {});
      return;
    }

    if (res.customId === "gtf-deny") {
      if (res.user.id === message.author.id) {
        return res.reply({
          embeds: [new CustomEmbed(message.member, "guess the flag request cancelled")],
        });
      } else if (target) {
        return res.reply({
          embeds: [new CustomEmbed(target, "guess the flag request denied")],
        });
      }
    } else {
      res.update({ components: [] });
      return startGTFGame(message, res.user, requestMessage);
    }
  }
}

cmd.setRun(run);

module.exports = cmd;

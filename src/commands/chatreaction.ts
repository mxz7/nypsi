import { ChatReactionWordList } from "@prisma/client";
import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Channel,
  CommandInteraction,
  GuildMember,
  Interaction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { getBlacklisted, setBlacklisted } from "../utils/functions/chatreactions/blacklisted";
import {
  startChatReactionDuel,
  startOpenChatReaction,
} from "../utils/functions/chatreactions/game";
import {
  createReactionStatsProfile,
  deleteStats,
  getReactionStats,
  getServerLeaderboard,
  hasReactionStatsProfile,
} from "../utils/functions/chatreactions/stats";
import {
  createReactionProfile,
  getReactionSettings,
  hasReactionProfile,
  updateReactionSettings,
} from "../utils/functions/chatreactions/utils";
import {
  getWordList,
  getWordListType,
  setWordListType,
  updateWords,
} from "../utils/functions/chatreactions/words";
import {
  addBalance,
  calcMaxBet,
  getBalance,
  removeBalance,
} from "../utils/functions/economy/balance";
import { topChatReaction } from "../utils/functions/economy/top";
import {
  createUser,
  formatNumber,
  isEcoBanned,
  userExists,
} from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getMember } from "../utils/functions/member";
import PageManager from "../utils/functions/page";
import { isPremium } from "../utils/functions/premium/premium";
import sleep from "../utils/functions/sleep";
import { getPreferences } from "../utils/functions/users/notifications";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("chatreaction", "see who can type the fastest", "fun")
  .setAliases(["cr", "reaction"])
  .setDocs("https://nypsi.xyz/docs/chat-reactions/setup?ref=bot-help");

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((option) =>
    option.setName("start").setDescription("start a chat reaction in the current channel"),
  )
  .addSubcommand((option) =>
    option
      .setName("duel")
      .setDescription("duel a member to a chat reaction")
      .addUserOption((option) =>
        option.setName("member").setDescription("member to duel").setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("wager")
          .setDescription("how much do you want to wager / bet")
          .setRequired(false),
      ),
  )
  .addSubcommand((option) =>
    option.setName("stats").setDescription("view your chat reaction stats"),
  )
  .addSubcommand((option) =>
    option.setName("leaderboard").setDescription("view the chat reaction leaderboard"),
  )
  .addSubcommandGroup((words) =>
    words
      .setName("words")
      .setDescription("add or remove words from the chat reactions word list")
      .addSubcommand((list) => list.setName("list").setDescription("show the current word list"))
      .addSubcommand((reset) =>
        reset.setName("reset").setDescription("reset the word list back to default"),
      )
      .addSubcommand((add) =>
        add
          .setName("add")
          .setDescription("add word")
          .addStringOption((option) =>
            option
              .setName("word")
              .setDescription("what word would you like to add to the word list")
              .setRequired(true),
          ),
      )
      .addSubcommand((remove) =>
        remove
          .setName("del")
          .setDescription("remove word")
          .addStringOption((option) =>
            option
              .setName("word")
              .setDescription("what word would you like to remove from the word list")
              .setRequired(true),
          ),
      ),
  )
  .addSubcommandGroup((blacklist) =>
    blacklist
      .setName("blacklist")
      .setDescription("ban a user from chat reactions")
      .addSubcommand((list) =>
        list.setName("list").setDescription("view currently blacklisted users"),
      )
      .addSubcommand((add) =>
        add
          .setName("add")
          .setDescription("add a user to the blacklist")
          .addUserOption((option) =>
            option.setName("user").setDescription("user to be blacklisted").setRequired(true),
          ),
      )
      .addSubcommand((remove) =>
        remove
          .setName("del")
          .setDescription("remove a user from the blacklist")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("user to remove from the blacklist")
              .setRequired(true),
          ),
      ),
  )
  .addSubcommandGroup((settings) =>
    settings
      .setName("settings")
      .setDescription("settings for chat reactions")
      .addSubcommand((view) =>
        view.setName("view").setDescription("view the current configuration"),
      )
      .addSubcommand((enable) =>
        enable.setName("enable").setDescription("enable chat reactions for the current channel"),
      )
      .addSubcommand((disable) =>
        disable.setName("disable").setDescription("disable chat reactions"),
      )
      .addSubcommand((offset) =>
        offset
          .setName("offset")
          .setDescription("set a maximum offset to be used with the cooldown")
          .addIntegerOption((option) =>
            option.setName("seconds").setDescription("maximum offset").setRequired(true),
          ),
      )
      .addSubcommand((length) =>
        length
          .setName("length")
          .setDescription("set the max time a chat reaction can last")
          .addIntegerOption((option) =>
            option
              .setName("seconds")
              .setDescription("amount of time a chat reaction can last")
              .setRequired(true),
          ),
      )
      .addSubcommand((cooldown) =>
        cooldown
          .setName("cooldown")
          .setDescription("set the time between automatic chat reactions")
          .addIntegerOption((option) =>
            option
              .setName("seconds")
              .setDescription("time between chat reactions")
              .setRequired(true),
          ),
      )
      .addSubcommand((channel) =>
        channel
          .setName("channel")
          .setDescription("add/remove a channel for automatic chat reactions")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("channel to add/remove from automatic starting")
              .setRequired(true),
          ),
      ),
  );

const duelRequests = new Set<string>();

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

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  if (!(await hasReactionProfile(message.guild))) await createReactionProfile(message.guild);
  if (!(await hasReactionStatsProfile(message.guild, message.member)))
    await createReactionStatsProfile(message.guild, message.member);

  const prefix = (await getPrefix(message.guild))[0];

  const helpCmd = () => {
    const embed = new CustomEmbed(message.member).setHeader("chat reactions");

    embed.setDescription(
      `${prefix}**cr start** *start a random chat reaction*\n` +
        `${prefix}**cr settings** *view/modify the chat reaction settings for your server*\n` +
        `${prefix}**cr words** *view/modify the chat reaction word list*\n` +
        `${prefix}**cr blacklist** *add/remove people to the blacklist*\n` +
        `${prefix}**cr stats reset** *reset stats for the server*\n` +
        `${prefix}**cr stats** *view your chat reaction stats*\n` +
        `${prefix}**cr lb** *view the server leaderboard*\n` +
        `${prefix}**cr duel** *duel a member at a chat reaction*`,
    );

    return send({ embeds: [embed] });
  };

  const showStats = async () => {
    await addCooldown(cmd.name, message.member, 10);

    const embed = new CustomEmbed(message.member).setHeader(
      `${message.author.username}'s stats`,
      message.author.avatarURL(),
    );

    const stats = await getReactionStats(message.guild, message.member);

    embed.setDescription(
      `first place **${stats.wins.toLocaleString()}**\nsecond place **${stats.secondPlace.toLocaleString()}**\nthird place **${stats.thirdPlace.toLocaleString()}**\n\noverall **${(
        stats.wins +
        stats.secondPlace +
        stats.thirdPlace
      ).toLocaleString()}**`,
    );

    const blacklisted = await getBlacklisted(message.guild);

    if (blacklisted.indexOf(message.author.id) != -1) {
      embed.setFooter({ text: "you are blacklisted from chat reactions in this server" });
    }

    return send({ embeds: [embed] });
  };

  const showLeaderboard = async () => {
    await addCooldown(cmd.name, message.member, 10);

    const embed = new CustomEmbed(message.member).setHeader(
      "chat reactions leaderboard",
      message.guild.iconURL(),
    );

    let amount = 3;

    if (parseInt(args[1])) {
      amount = parseInt(args[1]);

      if (amount > 10) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) amount = 10;
      }
    }

    const leaderboards = await getServerLeaderboard(message.guild);
    const timeLeaderboard = await topChatReaction(message.guild, false).then((r) =>
      r.pages.get(1).join("\n"),
    );

    if (timeLeaderboard) leaderboards.set("time", timeLeaderboard);

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

    if (leaderboards.get("overall")) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("overall")
          .setLabel("overall")
          .setEmoji("🏆")
          .setStyle(ButtonStyle.Secondary),
      );
    }

    if (leaderboards.get("wins")) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("wins")
          .setLabel("first")
          .setEmoji("🥇")
          .setStyle(ButtonStyle.Secondary),
      );
    }

    if (leaderboards.get("second")) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("second")
          .setLabel("second")
          .setEmoji("🥈")
          .setStyle(ButtonStyle.Secondary),
      );
    }

    if (leaderboards.get("third")) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("third")
          .setLabel("third")
          .setEmoji("🥉")
          .setStyle(ButtonStyle.Secondary),
      );
    }

    if (leaderboards.get("time")) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("time")
          .setLabel("speed")
          .setEmoji("🏎️")
          .setStyle(ButtonStyle.Secondary),
      );
    }

    if (leaderboards.size === 0 || row.components?.length === 0)
      return send({ embeds: [new ErrorEmbed("no data")] });

    row.components[0].setDisabled(true);
    // @ts-ignore stupid discordjs types
    embed.setDescription(leaderboards.get((row.components[0] as ButtonBuilder).data.custom_id));

    const msg = await send({ embeds: [embed], components: [row] });

    const listen: any = async () => {
      const interaction = await msg
        .awaitMessageComponent({
          filter: (i) => i.user.id === message.author.id,
          time: 60000,
        })
        .catch(() => {
          row.components.forEach((e) => e.setDisabled(true));
          msg.edit({ components: [row] });
        });

      if (!interaction) return;

      embed.setDescription(
        leaderboards.get(
          // @ts-ignore stupid discordjs types
          row.components.find((i) => i.data.custom_id === interaction.customId).data.custom_id,
        ),
      );
      row.components.forEach((i) => i.setDisabled(false));
      // @ts-ignore stupid discordjs types
      row.components.find((i) => i.data.custom_id === interaction.customId).setDisabled(true);

      interaction.update({ embeds: [embed], components: [row] });
      return listen();
    };

    listen();
  };

  if (args.length == 0) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return showStats();
    return helpCmd();
  } else if (args[0].toLowerCase() == "start") {
    if (!(message.channel instanceof TextChannel)) {
      return send({ embeds: [new ErrorEmbed("this is an invalid channel")] });
    }

    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      if (await onCooldown(cmd.name, message.member)) {
        const res = await getResponse(cmd.name, message.member);

        if (res.respond) send({ embeds: [res.embed], ephemeral: true });
        return;
      }

      await addCooldown(cmd.name, message.member, 10);

      const blacklisted = await getBlacklisted(message.guild);

      if (blacklisted.includes(message.author.id)) return;

      const embed = new CustomEmbed(
        message.member,
        "click the button below to vote start a chat reaction\n\n1/4",
        true,
      ).setHeader(`${message.author.username}'s chat reaction`, message.author.avatarURL());

      const components = [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel("vote start")
            .setCustomId("vs")
            .setStyle(ButtonStyle.Success),
        ),
      ];

      const msg = await send({ embeds: [embed], components });

      const voted = [message.author.id];

      const filter = (i: Interaction) => !blacklisted.includes(i.user.id);

      const collector = msg.createMessageComponentCollector({ filter, time: 45_000, max: 4 });

      collector.on("collect", async (interaction) => {
        if (voted.includes(interaction.user.id)) {
          await interaction.reply({
            embeds: [new ErrorEmbed("you have already voted start")],
            ephemeral: true,
          });
          return;
        }
        voted.push(interaction.user.id);

        embed.setDescription(
          `click the button below to vote start a chat reaction\n\n${voted.length}/4`,
        );

        if (voted.length >= 4) {
          await interaction.update({ embeds: [embed], components: [] });

          const countdownMsg = await message.channel.send({
            embeds: [new CustomEmbed(message.member, "chat reaction starting in 3 seconds...")],
          });

          await sleep(1500);

          await countdownMsg.edit({
            embeds: [new CustomEmbed(message.member, "chat reaction starting in 2 seconds...")],
          });

          await sleep(1500);

          await countdownMsg.edit({
            embeds: [new CustomEmbed(message.member, "chat reaction starting in 1 second...")],
          });

          await sleep(1500);

          await countdownMsg.delete().catch(() => {});
          await startOpenChatReaction(message.guild, message.channel as TextChannel, true);
        } else {
          await interaction.update({ embeds: [embed] });
        }
      });

      collector.on("end", () => {
        setTimeout(() => {
          if (voted.length < 4) {
            embed.setDescription(
              `chat reaction not started\n\nonly received ${voted.length}/4 votes ):`,
            );
            msg.edit({ embeds: [embed], components: [] });
            return;
          }
        }, 1000);
      });

      return;
    }

    startOpenChatReaction(message.guild, message.channel, true);

    if (!(message instanceof Message)) {
      return send({
        embeds: [new CustomEmbed(message.member, "✅ chat reaction started")],
        ephemeral: true,
      });
    }
  } else if (args[0].toLowerCase() == "stats") {
    if (args.length == 2 && args[1].toLowerCase() == "reset") {
      if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        if (message.author.id != message.guild.ownerId) {
          return send({
            embeds: [new ErrorEmbed("you need the to be the server owner for this command")],
          });
        }
        await deleteStats(message.guild);

        return send({
          embeds: [new CustomEmbed(message.member, "✅ stats have been deleted")],
        });
      }
    }
    return showStats();
  } else if (
    args[0].toLowerCase() == "leaderboard" ||
    args[0].toLowerCase() == "lb" ||
    args[0].toLowerCase() == "top"
  ) {
    return showLeaderboard();
  } else if (["duel", "1v1", "wager"].includes(args[0].toLowerCase())) {
    if (
      (await redis.get(
        `${Constants.redis.nypsi.RESTART}:${(message.client as NypsiClient).cluster.id}`,
      )) == "t"
    ) {
      if (message.author.id == Constants.TEKOH_ID && message instanceof Message) {
        message.react("💀");
      } else {
        if (message instanceof Message) {
          return message.channel.send({
            embeds: [
              new CustomEmbed(message.member, "nypsi is rebooting, try again in a few minutes"),
            ],
          });
        } else {
          return message.reply({
            embeds: [
              new CustomEmbed(message.member, "nypsi is rebooting, try again in a few minutes"),
            ],
          });
        }
      }
    }

    const doGame = async (
      player: GuildMember,
      wager: number,
      response: ButtonInteraction,
      m: Message,
    ) => {
      const balance = await getBalance(player);

      if (balance < wager) {
        await addBalance(message.member, wager);
        return response.followUp({
          embeds: [new ErrorEmbed(`${player.user.toString()} cannot afford this`)],
        });
      }

      await removeBalance(player, wager);

      if (m.deletable) m.delete();

      const result = await startChatReactionDuel(
        message.guild,
        message.channel as TextChannel,
        message.member,
        player,
        wager,
      );

      if (result) await addBalance(result.winner, result.winnings);
    };

    if (args.length === 0)
      return send({ embeds: [new ErrorEmbed("/chatreaction duel <member> (wager)")] });

    const blacklisted = await getBlacklisted(message.guild);

    if (blacklisted.includes(message.author.id))
      return send({
        embeds: [new ErrorEmbed("you are blacklisted from chat reactions in this server")],
      });

    if (args.length >= 2 && (args.length > 2 ? true : !formatNumber(args[1]))) {
      const target = await getMember(message.guild, args[1]);

      if (!target) return send({ embeds: [new ErrorEmbed("invalid target")] });

      if (target.user.id === message.author.id)
        return send({ embeds: [new ErrorEmbed("you cannot duel yourself. idiot.")] });

      if (blacklisted.includes(target.user.id))
        return send({
          embeds: [new ErrorEmbed("that user is blacklisted from chat reactions in this server")],
        });

      if (!(await userExists(target.user.id))) await createUser(target.user.id);

      let wager = formatNumber(args[2] || 0);

      if (wager < 0) wager = 0;
      if (!wager) wager = 0;
      if (isNaN(wager)) wager = 0;

      if (!(await getPreferences(target.user.id)).duelRequests) {
        return send({
          embeds: [new ErrorEmbed(`${target.user.toString()} has requests disabled`)],
        });
      }

      if ((await isEcoBanned(message.author.id)).banned && wager > 0)
        return send({ embeds: [new ErrorEmbed("you are banned. lol.")] });

      if ((await isEcoBanned(target.user.id)).banned && wager > 0)
        return send({ embeds: [new ErrorEmbed("they are banned. lol.")] });

      if ((await getBalance(message.member)) < wager)
        return send({ embeds: [new ErrorEmbed("you cannot afford this")] });

      if ((await getBalance(target)) < wager)
        return send({
          embeds: [new ErrorEmbed(`${target.user.toString()} cannot afford this wager`)],
        });

      if (wager > (await calcMaxBet(message.member)) * 10)
        return send({
          ephemeral: true,
          embeds: [
            new ErrorEmbed(
              `your max bet is $**${((await calcMaxBet(message.member)) * 10).toLocaleString()}**`,
            ),
          ],
        });

      if (wager > (await calcMaxBet(target)) * 10)
        return send({
          embeds: [
            new ErrorEmbed(
              `their max bet is $**${((await calcMaxBet(target)) * 10).toLocaleString()}**`,
            ),
          ],
        });

      if (duelRequests.has(message.author.id))
        return send({ embeds: [new ErrorEmbed("you already have a duel request!")] });
      if (duelRequests.has(target.user.id))
        return send({ embeds: [new ErrorEmbed("they already have a duel request!")] });

      duelRequests.add(message.author.id);

      let cancelled = false;
      await removeBalance(message.member, wager);

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("y").setLabel("accept").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("n").setLabel("deny").setStyle(ButtonStyle.Danger),
      );

      const requestEmbed = new CustomEmbed(
        message.member,
        `**${
          message.author.username
        }** has challenged you to a chat reaction duel\n\n**wager** $${wager.toLocaleString()}\n\ndo you accept?`,
      ).setFooter({ text: "expires in 60 seconds" });

      const m = await send({
        content: `${target.user.toString()} you have been invited to a chat reaction duel worth $${wager.toLocaleString()}`,
        embeds: [requestEmbed],
        components: [row],
      });

      const filter = (i: Interaction) =>
        i.user.id == target.id ||
        (message.author.id === i.user.id && (i as ButtonInteraction).customId === "n");

      let fail = false;

      const response = await m
        .awaitMessageComponent({ filter, time: 60000 })
        .then(async (collected) => {
          duelRequests.delete(message.author.id);

          return collected;
        })
        .catch(async () => {
          fail = true;
          duelRequests.delete(message.author.id);
          if (!cancelled) await addBalance(message.member, wager);
          m.edit({ components: [] });
        });

      if (fail || !response) return;

      if (response.customId === "y") {
        return doGame(target, wager, response as ButtonInteraction, m);
      } else {
        cancelled = true;
        await addBalance(message.member, wager);
        if (message.author.id === response.user.id) {
          response.reply({
            embeds: [new CustomEmbed(message.member, "✅ duel request cancelled")],
          });
        } else {
          response.reply({ embeds: [new CustomEmbed(target, "✅ duel request denied")] });
        }
      }
    } else if (args.length <= 2 && (args.length === 1 ? true : Boolean(formatNumber(args[1])))) {
      let wager = formatNumber(args[1] || 0);

      if (wager < 0) wager = 0;
      if (!wager) wager = 0;
      if (isNaN(wager)) wager = 0;

      if ((await isEcoBanned(message.author.id)).banned && wager > 0)
        return send({ embeds: [new ErrorEmbed("you are banned. lol.")] });

      if ((await getBalance(message.member)) < wager)
        return send({ embeds: [new ErrorEmbed("you cannot afford this")] });

      if (wager > (await calcMaxBet(message.member)) * 10)
        return send({
          embeds: [
            new ErrorEmbed(
              `your max bet is $**${((await calcMaxBet(message.member)) * 10).toLocaleString()}**`,
            ),
          ],
        });

      if (duelRequests.has(message.author.id))
        return send({ embeds: [new ErrorEmbed("you already have a duel request!")] });

      duelRequests.add(message.author.id);

      let cancelled = false;
      await removeBalance(message.member, wager);

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("y").setLabel("play").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("n").setLabel("cancel").setStyle(ButtonStyle.Danger),
      );

      const requestEmbed = new CustomEmbed(
        message.member,
        `**${
          message.author.username
        }** has created an open chat reaction duel\n\n**wager** $${wager.toLocaleString()}`,
      ).setFooter({ text: "expires in 60 seconds" });

      const m = await send({
        embeds: [requestEmbed],
        components: [row],
      });

      const filter = async (i: Interaction): Promise<boolean> => {
        if (i.user.id != message.author.id && (i as ButtonInteraction).customId == "n")
          return false;
        if ((await isEcoBanned(i.user.id)).banned && wager > 0) return false;

        if (i.user.id === message.author.id) {
          if ((i as ButtonInteraction).customId === "n") return true;
          return false;
        }

        if (!(await userExists(i.user.id)) || (await getBalance(i.user.id)) < wager) {
          if (i.isRepliable())
            await i.reply({
              ephemeral: true,
              embeds: [new ErrorEmbed("you cannot afford this wager")],
            });
          return false;
        }

        if ((await calcMaxBet(i.user.id)) * 10 < wager) {
          if (i.isRepliable())
            i.reply({
              ephemeral: true,
              embeds: [
                new ErrorEmbed(
                  `your max bet is $**${((await calcMaxBet(i.user.id)) * 10).toLocaleString()}**`,
                ),
              ],
            });

          return false;
        }

        return true;
      };

      let fail = false;

      const response = await m
        .awaitMessageComponent({ filter, time: 60000 })
        .then(async (collected) => {
          duelRequests.delete(message.author.id);

          return collected;
        })
        .catch(async () => {
          fail = true;
          duelRequests.delete(message.author.id);
          if (!cancelled) await addBalance(message.member, wager);
          m.edit({ components: [] });
        });

      if (fail || !response) return;

      const target = await message.guild.members.fetch(response.user.id);

      if (!target)
        return message.channel.send({ embeds: [new ErrorEmbed("invalid guild member")] });

      if (response.customId === "y") {
        return doGame(target, wager, response as ButtonInteraction, m);
      } else {
        cancelled = true;
        await addBalance(message.member, wager);
        if (message.author.id === response.user.id) {
          response.reply({
            embeds: [new CustomEmbed(message.member, "✅ duel request cancelled")],
          });
        } else {
          response.reply({ embeds: [new CustomEmbed(target, "✅ duel request denied")] });
        }
      }
    }
    return;
  } else if (args[0].toLowerCase() == "blacklist" || args[0].toLowerCase() == "bl") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return send({
        embeds: [new ErrorEmbed("you need the `manage server` permission to do this")],
      });
    }

    if (args.length == 1 || args[1].toLowerCase() == "list") {
      const embed = new CustomEmbed(message.member).setHeader("chat reactions");

      const blacklisted = await getBlacklisted(message.guild);

      if (blacklisted.length == 0) {
        embed.setDescription("❌ no blacklisted users");
      } else {
        embed.setDescription(`\`${blacklisted.join("`\n`")}\``);
      }

      embed.setFooter({
        text: `use ${prefix}cr blacklist (add/del/+/-) to edit blacklisted users`,
      });

      return send({ embeds: [embed] });
    } else {
      if (args[1].toLowerCase() == "add" || args[1] == "+") {
        if (args.length == 2) {
          return send({ embeds: [new ErrorEmbed(`${prefix}cr blacklist add/+ @user`)] });
        }

        let user: string | GuildMember = args[2];

        if (!(await message.guild.members.fetch(user))) {
          if (!message.mentions.members.first()) {
            return send({
              embeds: [
                new ErrorEmbed(
                  "you need to mention a user, you can either use the user ID, or mention the user by putting @ before their name",
                ),
              ],
            });
          } else {
            user = message.mentions.members.first();
          }
        } else {
          user = await message.guild.members.fetch(user);
        }

        if (!user) {
          return send({ embeds: [new ErrorEmbed("invalid user")] });
        }

        const blacklisted = await getBlacklisted(message.guild);

        if (blacklisted.length >= 75) {
          return send({
            embeds: [
              new ErrorEmbed("you have reached the maximum amount of blacklisted users (75)"),
            ],
          });
        }

        blacklisted.push(user.id);

        await setBlacklisted(message.guild, blacklisted);

        const embed = new CustomEmbed(message.member, `✅ ${user.toString()} has been blacklisted`);

        return send({ embeds: [embed] });
      } else if (args[1].toLowerCase() == "del" || args[1] == "-") {
        if (args.length == 2) {
          return send({ embeds: [new ErrorEmbed(`${prefix}cr blacklist del/- @user`)] });
        }

        let user = args[2];

        if (!(await message.guild.members.fetch(user))) {
          if (!message.mentions.members.first()) {
            return send({
              embeds: [
                new ErrorEmbed(
                  "you need to mention a user, you can either use the user ID, or mention the user by putting @ before their name",
                ),
              ],
            });
          } else {
            user = message.mentions.members.first().id;
          }
        }

        if (!user) {
          return send({ embeds: [new ErrorEmbed("invalid user")] });
        }

        const blacklisted = await getBlacklisted(message.guild);

        if (blacklisted.indexOf(user) == -1) {
          return send({ embeds: [new ErrorEmbed("this user is not blacklisted")] });
        }

        blacklisted.splice(blacklisted.indexOf(user), 1);

        await setBlacklisted(message.guild, blacklisted);

        return send({
          embeds: [new CustomEmbed(message.member, "✅ user has been unblacklisted")],
        });
      } else if (args[1].toLowerCase() == "reset" || args[1].toLowerCase() == "empty") {
        await setBlacklisted(message.guild, []);

        return send({
          embeds: [new CustomEmbed(message.member, "✅ blacklist was emptied")],
        });
      }
    }
  } else if (args[0].toLowerCase() == "settings") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return send({
        embeds: [new ErrorEmbed("you need the `manage server` permission to do this")],
      });
    }

    if (args.length == 1 || args[1].toLowerCase() == "view") {
      const embed = new CustomEmbed(message.member);

      embed.setHeader("chat reactions");

      const settings = await getReactionSettings(message.guild);

      let channels;

      if (settings.randomChannels.length == 0) {
        channels = "none";
      } else {
        channels = settings.randomChannels.join("` `");
      }

      embed.setDescription(
        `**automatic start** \`${settings.randomStart}\`\n` +
          `**random channels** \`${channels}\`\n` +
          `**time between events** \`${settings.betweenEvents}s\`\n` +
          `**max offset** \`${settings.randomModifier}s\`\n` +
          `**max game length** \`${settings.timeout}s\``,
      );

      embed.setFooter({ text: `use ${prefix}cr settings help to change this settings` });

      return send({ embeds: [embed] });
    } else if (args.length == 2) {
      if (args[1].toLowerCase() == "help") {
        const embed = new CustomEmbed(message.member);

        embed.setHeader("chat reactions");

        embed.setDescription(
          `${prefix}**cr settings enable** *enable automatic starting*\n` +
            `${prefix}**cr settings disable** *disable automatic starting*\n` +
            `${prefix}**cr settings channel <channel>** *add/remove channels to be used for automatic starting*\n` +
            `${prefix}**cr settings cooldown <seconds>** *set the time between automatic chat reactions*\n` +
            `${prefix}**cr settings offset <seconds>** *set a maximum offset to be used with the cooldown*\n` +
            `${prefix}**cr settings length <seconds>** *set a maximum game length*`,
        );

        return send({ embeds: [embed] });
      } else if (args[1].toLowerCase() == "enable") {
        const settings = await getReactionSettings(message.guild);

        if (settings.randomStart) {
          return send({ embeds: [new ErrorEmbed("already enabled")] });
        }

        settings.randomStart = true;

        if (settings.randomChannels.length == 0) {
          settings.randomChannels.push(message.channel.id);
        }

        await updateReactionSettings(message.guild, settings);

        return send({
          embeds: [new CustomEmbed(message.member, "✅ automatic start has been enabled")],
        });
      } else if (args[1].toLowerCase() == "disable") {
        const settings = await getReactionSettings(message.guild);

        if (!settings.randomStart) {
          return send({ embeds: [new ErrorEmbed("already disabled")] });
        }

        settings.randomStart = false;

        await updateReactionSettings(message.guild, settings);

        return send({
          embeds: [new CustomEmbed(message.member, "✅ automatic start has been disabled")],
        });
      } else if (args[1].toLowerCase() == "channel" || args[1].toLowerCase() == "channels") {
        return send({
          embeds: [
            new ErrorEmbed(
              "you need to mention a channel, you can use the channel ID, or mention the channel by putting a # before the channel name",
            ),
          ],
        });
      } else if (args[1].toLowerCase() == "cooldown") {
        return send({
          embeds: [new ErrorEmbed(`${prefix}cr settings cooldown <number>`)],
        });
      } else if (args[1].toLowerCase() == "offset") {
        return send({ embeds: [new ErrorEmbed(`${prefix}cr settings offset <number>`)] });
      } else if (args[1].toLowerCase() == "length") {
        return send({ embeds: [new ErrorEmbed(`${prefix}cr settings length <number>`)] });
      } else {
        return send({ embeds: [new ErrorEmbed(`${prefix}cr settings help`)] });
      }
    } else if (args.length == 3) {
      if (args[1].toLowerCase() == "channel" || args[1].toLowerCase() == "channels") {
        let channel: string | Channel = args[2];

        if (!message.guild.channels.cache.get(channel)) {
          if (!message.mentions.channels.first()) {
            return send({
              embeds: [
                new ErrorEmbed(
                  "you need to mention a channel, you can use the channel ID, or mention the channel by putting a # before the channel name\nto remove a channel, simply mention a channel or use an id of a channel that is already selected as a random channel",
                ),
              ],
            });
          } else {
            channel = message.mentions.channels.first();
          }
        } else {
          channel = message.guild.channels.cache.find((ch) => ch.id == channel);
        }

        if (!channel) {
          return send({ embeds: [new ErrorEmbed("invalid channel")] });
        }

        if (!channel.isTextBased()) return send({ embeds: [new ErrorEmbed("invalid channel")] });

        if (channel.isDMBased()) return send({ embeds: [new ErrorEmbed("invalid channel")] });

        if (channel.isThread()) return send({ embeds: [new ErrorEmbed("invalid channel")] });

        const settings = await getReactionSettings(message.guild);

        let added = false;
        let max = 1;

        if (await isPremium(message.author.id)) {
          max = 5;
        }

        if (settings.randomChannels.indexOf(channel.id) != -1) {
          settings.randomChannels.splice(settings.randomChannels.indexOf(channel.id), 1);
        } else {
          if (settings.randomChannels.length >= max) {
            const embed = new ErrorEmbed(
              `you have reached the maximum amount of random channels (${max})\nyou can subscribe on [patreon](https://patreon.com/join/nypsi) to have more`,
            );

            if (max > 1) {
              embed.setDescription(
                `you have reached the maximum amount of random channels (${max})`,
              );
            }

            return send({ embeds: [embed] });
          }
          settings.randomChannels.push(channel.id);
          added = true;
        }

        if (settings.randomChannels.length == 0) {
          settings.randomStart = false;
        }

        await updateReactionSettings(message.guild, settings);

        const embed = new CustomEmbed(message.member);

        if (added) {
          embed.setDescription(`${channel.name} has been added as a random channel`);
        } else {
          embed.setDescription(`${channel.name} has been removed`);
        }

        return send({ embeds: [embed] });
      } else if (args[1].toLowerCase() == "cooldown") {
        const length = parseInt(args[2]);

        if (!length) {
          return send({
            embeds: [new ErrorEmbed("invalid time, it must be a whole number")],
          });
        }

        if (length > 900) {
          return send({ embeds: [new ErrorEmbed("cannot be longer than 900 seconds")] });
        }

        if (length < 120) {
          return send({
            embeds: [new ErrorEmbed("cannot be shorter than 120 seconds")],
          });
        }

        const settings = await getReactionSettings(message.guild);

        settings.betweenEvents = length;

        await updateReactionSettings(message.guild, settings);

        return send({
          embeds: [new CustomEmbed(message.member, `✅ event cooldown set to \`${length}s\``)],
        });
      } else if (args[1].toLowerCase() == "offset") {
        let length = parseInt(args[2]);

        if (!length) {
          return send({
            embeds: [new ErrorEmbed("invalid time, it must be a whole number")],
          });
        }

        if (length > 900) {
          return send({ embeds: [new ErrorEmbed("cannot be longer than 900 seconds")] });
        }

        if (length < 0) {
          length = 0;
        }

        const settings = await getReactionSettings(message.guild);

        settings.randomModifier = length;

        await updateReactionSettings(message.guild, settings);

        return send({
          embeds: [new CustomEmbed(message.member, `✅ cooldown max offset set to \`${length}s\``)],
        });
      } else if (args[1].toLowerCase() == "length") {
        const length = parseInt(args[2]);

        if (!length) {
          return send({
            embeds: [new ErrorEmbed("invalid time, it must be a whole number")],
          });
        }

        if (length > 120) {
          return send({ embeds: [new ErrorEmbed("cannot be longer than 120 seconds")] });
        }

        if (length < 30) {
          return send({ embeds: [new ErrorEmbed("cannot be shorter than 30 seconds")] });
        }

        const settings = await getReactionSettings(message.guild);

        settings.timeout = length;

        await updateReactionSettings(message.guild, settings);

        return send({
          embeds: [new CustomEmbed(message.member, `✅ max length set to \`${length}s\``)],
        });
      } else {
        return send({ embeds: [new ErrorEmbed(`${prefix}cr settings help`)] });
      }
    }
  } else if (args[0].toLowerCase() == "words" || args[0].toLowerCase() == "word") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return send({
        embeds: [new ErrorEmbed("you need the `manage server` permission to do this")],
      });
    }

    if (args.length == 1) {
      const embed = new CustomEmbed(message.member).setHeader("chat reactions");

      embed.setDescription(
        `${prefix}**cr words list** *view the current wordlist*\n` +
          `${prefix}**cr words type <type>** *set the word list type*\n` +
          `${prefix}**cr words add/+ <word/sentence>** *add a word or sentence to the wordlist*\n` +
          `${prefix}**cr words del/- <word/sentence>** *remove a word or sentence from the wordlist*\n` +
          `${prefix}**cr words reset** *delete the custom word list and use the [default list](https://github.com/mxz7/nypsi/blob/main/data/cr_words.txt)*`,
      );

      return send({ embeds: [embed] });
    } else if (args[1].toLowerCase() == "add" || args[1] == "+") {
      if (args.length == 2) {
        return send({
          embeds: [new ErrorEmbed(`${prefix}cr words add/+ <word or sentence>`)],
        });
      }

      const words = await getWordList(message.guild);

      const phrase = args.slice(2, args.length).join(" ");

      if (phrase == "" || phrase == " ") {
        return send({ embeds: [new ErrorEmbed("invalid phrase")] });
      }

      if (words.indexOf(phrase) != -1) {
        return send({
          embeds: [new ErrorEmbed(`\`${phrase}\` already exists in the word list`)],
        });
      }

      let maxSize = 100;

      if (await isPremium(message.author.id)) {
        maxSize = 200;
      }

      if (words.length >= maxSize) {
        const error = new ErrorEmbed(`wordlist is at max size (${maxSize})`);

        if (maxSize == 100) {
          error.setFooter({ text: "become a patreon ($patreon) to double this limit" });
        }

        return send({ embeds: [error] });
      }

      if (phrase.length >= 150) {
        return send({
          embeds: [new ErrorEmbed("phrase is too long (150 characters max)")],
        });
      }

      words.push(phrase);

      await updateWords(message.guild, words);

      return send({
        embeds: [new CustomEmbed(message.member, `✅ added \`${phrase}\` to wordlist`)],
      });
    } else if (args[1].toLowerCase() == "del" || args[1] == "-") {
      if (args.length == 2) {
        return send({
          embeds: [new ErrorEmbed(`${prefix}cr words add/+ <word or sentence>`)],
        });
      }

      const words = await getWordList(message.guild);

      const phrase = args.slice(2, args.length).join(" ");

      if (words.indexOf(phrase) == -1) {
        return send({
          embeds: [new ErrorEmbed(`\`${phrase}\` doesn't exist in the word list`)],
        });
      }

      words.splice(words.indexOf(phrase), 1);

      await updateWords(message.guild, words);

      return send({
        embeds: [new CustomEmbed(message.member, `✅ removed \`${phrase}\` from wordlist`)],
      });
    } else if (args[1].toLowerCase() == "reset") {
      await updateWords(message.guild, []);

      return send({
        embeds: [new CustomEmbed(message.member, "✅ wordlist has been reset")],
      });
    } else if (args[1].toLowerCase() == "list") {
      const words = await getWordList(message.guild);

      const embed = new CustomEmbed(message.member);

      if (words.length == 0) {
        embed.setDescription("using `english_1k` - add a custom word to use custom words");
        embed.setHeader("chat reactions");
      } else {
        const pages = PageManager.createPages(words);

        embed.setHeader(`word list [${words.length}]`);
        embed.setDescription(`${pages.get(1).join("\n")}`);
        embed.setFooter({ text: `page 1/${pages.size}` });

        if (pages.size > 1) {
          let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("⬅")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),
            new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
          );
          const msg = await send({ embeds: [embed], components: [row] });

          let currentPage = 1;
          const lastPage = pages.size;

          const filter = (i: Interaction) => i.user.id == message.author.id;

          const edit = async (data: MessageEditOptions, msg: Message) => {
            if (!(message instanceof Message)) {
              await message.editReply(data as InteractionEditReplyOptions);
              return await message.fetchReply();
            } else {
              return await msg.edit(data);
            }
          };

          const pageManager = async (): Promise<void> => {
            const reaction = await msg
              .awaitMessageComponent({ filter, time: 30000 })
              .then(async (collected) => {
                await collected.deferUpdate();
                return collected.customId;
              })
              .catch(async () => {
                await edit({ components: [] }, msg);
              });

            if (!reaction) return;

            if (reaction == "⬅") {
              if (currentPage <= 1) {
                return pageManager();
              } else {
                currentPage--;
                embed.setDescription(pages.get(currentPage).join("\n"));
                embed.setFooter({ text: "page " + currentPage + "/" + lastPage });

                if (currentPage == 1) {
                  row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                    new ButtonBuilder()
                      .setCustomId("⬅")
                      .setLabel("back")
                      .setStyle(ButtonStyle.Primary)
                      .setDisabled(true),
                    new ButtonBuilder()
                      .setCustomId("➡")
                      .setLabel("next")
                      .setStyle(ButtonStyle.Primary)
                      .setDisabled(false),
                  );
                } else {
                  row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                    new ButtonBuilder()
                      .setCustomId("⬅")
                      .setLabel("back")
                      .setStyle(ButtonStyle.Primary)
                      .setDisabled(false),
                    new ButtonBuilder()
                      .setCustomId("➡")
                      .setLabel("next")
                      .setStyle(ButtonStyle.Primary)
                      .setDisabled(false),
                  );
                }

                await edit({ embeds: [embed], components: [row] }, msg);
                return pageManager();
              }
            } else if (reaction == "➡") {
              if (currentPage >= lastPage) {
                return pageManager();
              } else {
                currentPage++;
                embed.setDescription(pages.get(currentPage).join("\n"));
                embed.setFooter({ text: "page " + currentPage + "/" + lastPage });

                if (currentPage == lastPage) {
                  row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                    new ButtonBuilder()
                      .setCustomId("⬅")
                      .setLabel("back")
                      .setStyle(ButtonStyle.Primary)
                      .setDisabled(false),
                    new ButtonBuilder()
                      .setCustomId("➡")
                      .setLabel("next")
                      .setStyle(ButtonStyle.Primary)
                      .setDisabled(true),
                  );
                } else {
                  row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                    new ButtonBuilder()
                      .setCustomId("⬅")
                      .setLabel("back")
                      .setStyle(ButtonStyle.Primary)
                      .setDisabled(false),
                    new ButtonBuilder()
                      .setCustomId("➡")
                      .setLabel("next")
                      .setStyle(ButtonStyle.Primary)
                      .setDisabled(false),
                  );
                }

                await edit({ embeds: [embed], components: [row] }, msg);
                return pageManager();
              }
            }
          };
          return pageManager();
        }
      }

      return send({ embeds: [embed] });
    } else if (args[1].toLowerCase() === "type") {
      const type = await getWordListType(message.guild);

      if (args.length === 2) {
        return send({
          embeds: [
            new CustomEmbed(
              message.member,
              `word list type: \`${type}\`\n\n` +
                "available types:\n" +
                Object.values(ChatReactionWordList)
                  .map((i) => "`" + i + "`")
                  .join("\n"),
            ).setHeader("chat reactions"),
          ],
        });
      } else {
        const search = args[2].toLowerCase();

        if (!Object.values(ChatReactionWordList).find((i) => i === search))
          return send({ embeds: [new ErrorEmbed("invalid word list")] });

        await setWordListType(message.guild, search as ChatReactionWordList);

        return send({
          embeds: [new CustomEmbed(message.member, `word list type set to: \`${args[2]}\``)],
        });
      }
    }
  }
}

cmd.setRun(run);

module.exports = cmd;

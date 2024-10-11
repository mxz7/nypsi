import { EconomyGuild, EconomyGuildMember } from "@prisma/client";
import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageEditOptions,
} from "discord.js";
import { sort } from "fast-sort";
import prisma from "../init/database";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { daysAgo, formatDate } from "../utils/functions/date";
import { addBalance, getBalance, removeBalance } from "../utils/functions/economy/balance";
import {
  RemoveMemberMode,
  addGuildUpgrade,
  addMember,
  addToGuildBank,
  createGuild,
  deleteGuild,
  getGuildByName,
  getGuildByUser,
  getMaxMembersForGuild,
  getRequiredForGuildUpgrade,
  removeMember,
  setGuildMOTD,
  setOwner,
} from "../utils/functions/economy/guilds";
import { getRawLevel } from "../utils/functions/economy/levelling";
import { addStat } from "../utils/functions/economy/stats";
import {
  createUser,
  formatNumber,
  getGuildUpgradeData,
  isEcoBanned,
  userExists,
} from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getAllGroupAccountIds } from "../utils/functions/moderation/alts";
import PageManager from "../utils/functions/page";
import { cleanString } from "../utils/functions/string";
import { addNotificationToQueue, getDmSettings } from "../utils/functions/users/notifications";
import { getLastKnownAvatar } from "../utils/functions/users/tag";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import ms = require("ms");

const cmd = new Command("guild", "create and manage your guild/clan", "money")
  .setAliases(["g", "clan"])
  .setDocs("https://docs.nypsi.xyz/economy/guilds");

cmd.slashEnabled = true;

cmd.slashData
  .addSubcommand((create) =>
    create
      .setName("create")
      .setDescription("create a guild")
      .addStringOption((option) =>
        option.setName("name").setDescription("name of the guild").setRequired(true),
      ),
  )
  .addSubcommand((invite) =>
    invite
      .setName("invite")
      .setDescription("invite a member to your guild")
      .addUserOption((option) =>
        option.setName("member").setDescription("member to invite to the guild").setRequired(true),
      ),
  )
  .addSubcommand((leave) => leave.setName("leave").setDescription("leave your current guild"))
  .addSubcommand((deleteOpt) =>
    deleteOpt.setName("delete").setDescription("delete your current guild"),
  )
  .addSubcommand((kick) =>
    kick
      .setName("kick")
      .setDescription("kick a member from your guild")
      .addUserOption((option) =>
        option.setName("member").setDescription("member to kick from the guild").setRequired(true),
      ),
  )
  .addSubcommand((deposit) =>
    deposit
      .setName("deposit")
      .setDescription("deposit money into the guild")
      .addIntegerOption((option) =>
        option
          .setName("amount")
          .setDescription("amount to deposit into the guild")
          .setRequired(true),
      ),
  )
  .addSubcommand((stats) =>
    stats.setName("stats").setDescription("view stats for the guild members"),
  )
  .addSubcommand((upgrade) =>
    upgrade.setName("upgrade").setDescription("view the requirements for the next guild upgrade"),
  )
  .addSubcommand((motd) =>
    motd
      .setName("motd")
      .setDescription("set the motd for the guild")
      .addStringOption((option) =>
        option.setName("text").setDescription("text for the motd").setRequired(true),
      ),
  )
  .addSubcommand((view) =>
    view
      .setName("view")
      .setDescription("view a guild")
      .addStringOption((option) =>
        option.setName("guild-name").setDescription("guild to show").setRequired(false),
      ),
  )
  .addSubcommand((buy) =>
    buy
      .setName("buy")
      .setDescription("buy guild upgrades with tokens")
      .addStringOption((option) =>
        option
          .setName("upgrade")
          .setDescription("upgrade you want to buy")
          .setChoices(
            { name: "25k max bet", value: "maxbet" },
            { name: "member slot", value: "member" },
            { name: "gamble multiplier", value: "multi" },
            { name: "sell multiplier", value: "sellmulti" },
          ),
      ),
  )
  .addSubcommand((shop) => shop.setName("shop").setDescription("view guild upgrades"));

const filter = [
  "nig",
  "fag",
  "queer",
  "delete",
  "inv",
  "create",
  "leave",
  "stats",
  "top",
  "hitler",
  "kick",
  "forcekick",
  "noguild",
];

const invited = new Set<string>();

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  if (!(await userExists(message.member))) await createUser(message.member);

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

  const edit = async (data: MessageEditOptions, msg: Message) => {
    if (!(message instanceof Message)) {
      await message.editReply(data).catch(() => {});
      return await message.fetchReply();
    } else {
      return await msg.edit(data).catch(() => {});
    }
  };

  const showGuild = async (
    guild: EconomyGuild & {
      owner: {
        user: {
          lastKnownUsername: string;
        };
      };
      members: (EconomyGuildMember & {
        economy: {
          user: {
            lastKnownUsername: string;
          };
        };
      })[];
    },
  ) => {
    await addCooldown(cmd.name, message.member, 5);
    const embed = new CustomEmbed(message.member);

    if (!guild) {
      embed.setDescription(
        `you are not in a guild. you can create one with ${prefix}guild create or join one if you have been invited`,
      );
    } else {
      embed.setHeader(
        guild.guildName,
        await getLastKnownAvatar(guild.ownerId),
        `https://nypsi.xyz/guild/${encodeURIComponent(guild.guildName)}`,
      );
      // embed.setDescription(guild.motd + `\n\n**bank** $${guild.balance.toLocaleString()}\n**xp** ${guild.xp.toLocaleString()}`)
      embed.setDescription(guild.motd);
      embed.addField(
        "info",
        `**level** ${guild.level}\n` +
          `**created on** ${formatDate(guild.createdAt)}\n` +
          `**owner** ${guild.owner.user.lastKnownUsername}`,
        true,
      );
      if (guild.level < Constants.MAX_GUILD_LEVEL) {
        embed.addField(
          "bank",
          `**money** $${guild.balance.toLocaleString()}\n**xp** ${guild.xp.toLocaleString()}\n**tokens** ${guild.tokens.toLocaleString()}`,
          true,
        );
      }

      let membersText = "";
      const maxMembers = await getMaxMembersForGuild(guild.guildName);

      for (const m of guild.members) {
        membersText += `[\`${m.economy.user.lastKnownUsername}\`](https://nypsi.xyz/user/${m.userId}) `;

        if (m.userId == message.author.id) {
          embed.setFooter({ text: `you joined ${daysAgo(m.joinedAt).toLocaleString()} days ago` });
        }
      }

      embed.addField(`members [${guild.members.length}/${maxMembers}]`, membersText);
    }

    return send({ embeds: [embed] });
  };

  let guild = await getGuildByUser(message.member);
  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    return showGuild(guild);
  }

  if (args[0].toLowerCase() == "create") {
    const alts = await getAllGroupAccountIds(Constants.NYPSI_SERVER_ID, message.author.id);

    for (const accountId of alts) {
      if (await redis.exists(`${Constants.redis.cooldown.GUILD_CREATE}:${accountId}`)) {
        return send({ embeds: [new ErrorEmbed("you have already created a guild recently")] });
      }
    }

    if ((await getRawLevel(message.member)) < 100) {
      return send({
        embeds: [new ErrorEmbed("you must be at least level 100 to create a guild")],
      });
    }

    if ((await getBalance(message.member)) < 500000) {
      return send({
        embeds: [new ErrorEmbed("it costs $500,000 to create a guild. you cannot afford this")],
      });
    }

    if (guild) {
      return send({
        embeds: [
          new ErrorEmbed(
            "you are already in a guild, you must leave this guild to create your own",
          ),
        ],
      });
    }

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed(`${prefix}guild create <name>`)] });
    }

    args.shift();

    const name = args.join(" ").normalize("NFD");

    if (name.length > 25) {
      return send({ embeds: [new ErrorEmbed("guild names must be shorter than 25 characters")] });
    }

    if ((await getGuildByName(name))?.guildName.toLowerCase() == name.toLowerCase()) {
      return send({ embeds: [new ErrorEmbed("that guild already exists")] });
    }

    for (const word of filter) {
      if (cleanString(name).toLowerCase().includes(word)) {
        return send({ embeds: [new ErrorEmbed("invalid guild name")] });
      }
    }

    await addCooldown(cmd.name, message.member, 3);

    await removeBalance(message.member, 500000);
    addStat(message.author.id, "spent-guild", 500000);

    await createGuild(name, message.member);

    await redis.set(`${Constants.redis.cooldown.GUILD_CREATE}:${message.author.id}`, "t");
    await redis.expire(
      `${Constants.redis.cooldown.GUILD_CREATE}:${message.author.id}`,
      ms("2 days") / 1000,
    );

    return send({
      embeds: [new CustomEmbed(message.member, `you are now the owner of **${name}**`)],
    });
  }

  if (
    args[0].toLowerCase() == "invite" ||
    args[0].toLowerCase() == "add" ||
    args[0].toLowerCase() == "inv"
  ) {
    if (!guild) {
      return send({
        embeds: [new ErrorEmbed("you must be the owner of a guild to invite members")],
      });
    }

    if (guild.ownerId != message.author.id) {
      return send({
        embeds: [new ErrorEmbed("you must be the owner of a guild to invite members")],
      });
    }

    if (guild.members.length >= (await getMaxMembersForGuild(guild.guildName))) {
      let msg = "your guild already has the max amount of members";

      if (guild.level < Constants.MAX_GUILD_LEVEL) {
        msg += `. use ${prefix}guild upgrade to increase this`;
      }

      return send({ embeds: [new ErrorEmbed(msg)] });
    }

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed(`${prefix}guild invite <@member>`)] });
    }

    if (!message.mentions?.members?.first()) {
      return send({ embeds: [new ErrorEmbed("you must tag the member you want to invite")] });
    }

    const target = message.mentions.members.first();

    if (invited.has(target.user.id)) {
      return send({ embeds: [new ErrorEmbed("this user has already been invited to a guild")] });
    }

    if ((await isEcoBanned(target.user.id)).banned) {
      return send({ embeds: [new ErrorEmbed("they're banned. lol. HA. HAHAHA.")] });
    }

    if (!(await userExists(target.user.id))) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (await getGuildByUser(target)) {
      return send({ embeds: [new ErrorEmbed("that user is already in a guild")] });
    }

    await addCooldown(cmd.name, message.member, 15);

    invited.add(target.user.id);

    const embed = new CustomEmbed(message.member);

    embed.setHeader("guild invitation");
    embed.setDescription(`you have been invited to join **${guild.guildName}**\n\ndo you accept?`);

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("yes").setLabel("accept").setStyle(ButtonStyle.Success),
    );

    const msg = await message.channel
      .send({ content: target.toString(), embeds: [embed], components: [row] })
      .catch(() => {
        invited.delete(target.user.id);
      });

    const filter = (i: Interaction) => i.user.id == target.user.id;
    let fail = false;

    if (!msg) return;

    const reaction = await msg
      .awaitMessageComponent({ filter, time: 30000 })
      .then(async (collected) => {
        await collected.deferUpdate();
        return collected.customId;
      })
      .catch(async () => {
        await edit(
          {
            components: [
              new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new ButtonBuilder()
                  .setStyle(ButtonStyle.Danger)
                  .setLabel("expired")
                  .setCustomId("boobies")
                  .setDisabled(true),
              ),
            ],
          },
          msg,
        ).catch(() => {});
        fail = true;
        invited.delete(target.user.id);
      });

    if (fail) return;

    if (reaction == "yes") {
      invited.delete(target.user.id);
      const targetGuild = await getGuildByUser(target.user.id);
      const refreshedGuild = await getGuildByName(guild.guildName);

      if (targetGuild) {
        embed.setDescription("❌ you are already in a guild");
      } else if (
        refreshedGuild.members.length >= (await getMaxMembersForGuild(refreshedGuild.guildName))
      ) {
        embed.setDescription("❌ this guild has too many members");
      } else {
        await addMember(guild.guildName, target);
        embed.setDescription(`you have successfully joined **${guild.guildName}**`);
      }
    } else {
      embed.setDescription("invitation denied");
    }

    return edit({ embeds: [embed], components: [] }, msg);
  }

  if (args[0].toLowerCase() == "leave" || args[0].toLowerCase() == "exit") {
    if (!guild) {
      return send({ embeds: [new ErrorEmbed("you're not in a guild")] });
    }

    if (guild.ownerId == message.author.id) {
      return send({
        embeds: [new ErrorEmbed("you are the guild owner, you must delete the guild")],
      });
    }

    await addCooldown(cmd.name, message.member, 20);

    const res = await removeMember(message.author.id, "id");

    if (res) {
      return message.channel.send({
        embeds: [new CustomEmbed(message.member, `✅ you have left **${guild.guildName}**`)],
      });
    } else {
      return message.channel.send({
        embeds: [new CustomEmbed(message.member, "failed while leaving guild")],
      });
    }
  }

  if (args[0].toLowerCase() == "forcekick") {
    if (message.author.id != Constants.TEKOH_ID) return;

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed(`${prefix}guild kick <tag>`)] });
    }

    return await removeMember(args[1], "id");
  }

  if (args[0].toLowerCase() == "setowner") {
    if (message.author.id != Constants.TEKOH_ID) return;

    if (args.length != 3) {
      return send({ embeds: [new ErrorEmbed(`${prefix}guild setowner <guild> <newid>`)] });
    }

    return await setOwner(args[1], args[2]);
  }

  if (args[0].toLowerCase() == "kick") {
    if (!guild) {
      return send({ embeds: [new ErrorEmbed("you're not in a guild")] });
    }

    if (guild.ownerId != message.author.id) {
      return send({ embeds: [new ErrorEmbed("you are not the guild owner")] });
    }

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed(`${prefix}guild kick <tag>`)] });
    }

    let target: string;
    let mode: RemoveMemberMode = "id";

    if (message.mentions?.members?.first()) {
      let found = false;
      for (const m of guild.members) {
        if (m.userId == message.mentions.members.first().user.id) {
          found = true;
          break;
        }
      }

      if (!found) {
        return send({
          embeds: [
            new ErrorEmbed(
              `\`${message.mentions.members.first().user.username}\` is not in **${
                guild.guildName
              }**`,
            ),
          ],
        });
      }

      target = message.mentions.members.first().user.id;
    } else {
      let found = false;
      for (const m of guild.members) {
        if (m.userId == args[1]) {
          found = true;
          mode = "id";
          break;
        } else if (m.economy.user.lastKnownUsername == args[1]) {
          found = true;
          mode = "tag";
          break;
        }
      }

      if (!found) {
        return send({
          embeds: [new ErrorEmbed(`\`${args[1]}\` is not in **${guild.guildName}**`)],
        });
      }

      target = args[1];
    }

    await addCooldown(cmd.name, message.member, 10);

    const res = await removeMember(target, mode);

    if (res) {
      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            `✅ \`${target}\` has been kicked from **${guild.guildName}**`,
          ),
        ],
      });
    } else {
      return send({
        embeds: [new CustomEmbed(message.member, `failed to kick ${target}`)],
      });
    }
  }

  if (args[0].toLowerCase() == "delete") {
    if (!guild) {
      return send({ embeds: [new ErrorEmbed("you're not in a guild")] });
    }

    if (guild.ownerId != message.author.id) {
      return send({ embeds: [new ErrorEmbed("you are not the guild owner")] });
    }

    await addCooldown(cmd.name, message.member, 30);

    await deleteGuild(guild.guildName);

    return send({
      embeds: [new CustomEmbed(message.member, `✅ **${guild.guildName}** has been deleted`)],
    });
  }

  if (args[0].toLowerCase() == "forcedelete") {
    if (message.author.id != Constants.TEKOH_ID) return;

    args.shift();

    guild = await getGuildByName(args.join(" "));

    if (!guild) return;

    for (const guildMember of guild.members) {
      const contributedMoney = guildMember.contributedMoney;

      if (contributedMoney > 100) {
        await addBalance(guildMember.userId, Math.floor(Number(contributedMoney) * 0.25));

        if ((await getDmSettings(guildMember.userId)).other) {
          const embed = new CustomEmbed().setColor(Constants.EMBED_SUCCESS_COLOR);

          embed.setDescription(
            `since you contributed money to this guild, you have been repaid $**${Math.floor(
              Number(contributedMoney) * 0.25,
            ).toLocaleString()}**`,
          );

          addNotificationToQueue({
            memberId: guildMember.userId,
            payload: {
              content: `${guild.guildName} has been deleted`,
              embed: embed,
            },
          });
        }
      }
    }

    await deleteGuild(guild.guildName);

    return send({
      embeds: [new CustomEmbed(message.member, `✅ **${guild.guildName}** has been deleted`)],
    });
  }

  if (args[0].toLowerCase() == "deposit" || args[0].toLowerCase() == "dep") {
    if (!guild) {
      return send({ embeds: [new ErrorEmbed("you're not in a guild")] });
    }

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed(`${prefix}guild dep <amount>`)] });
    }

    if (args[1].toLowerCase() == "all") {
      args[1] = (await getBalance(message.member)).toString();
    } else if (args[1].toLowerCase() == "half") {
      args[1] = ((await getBalance(message.member)) / 2).toString();
    }

    const amount = formatNumber(args[1]);

    if (!amount) {
      return send({ embeds: [new ErrorEmbed("invalid payment")] });
    }

    if (amount > (await getBalance(message.member))) {
      return send({ embeds: [new ErrorEmbed("you cannot afford this payment")] });
    }

    if (amount <= 0) {
      return send({ embeds: [new ErrorEmbed("invalid payment")] });
    }

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("✅").setLabel("do it.").setStyle(ButtonStyle.Success),
    );

    const msg = await send({
      embeds: [
        new CustomEmbed(
          message.member,
          `are you sure you want to deposit $**${amount.toLocaleString()}** into **${
            guild.guildName
          }** bank?\n\nyou **cannot** get this back`,
        ),
      ],
      components: [row],
    });

    const reaction = await msg
      .awaitMessageComponent({
        filter: (i: Interaction) => i.user.id == message.author.id,
        time: 15000,
      })
      .then(async (collected) => {
        await collected.deferUpdate();
        return collected;
      })
      .catch(async () => {
        await msg.delete();
      });

    if (!reaction) return;

    if (!reaction.isButton()) return;

    if (reaction.customId == "✅") {
      if (amount > (await getBalance(message.member))) {
        return reaction.message.edit({
          embeds: [new ErrorEmbed("you cannot afford this payment")],
        });
      }

      await removeBalance(message.member, amount);
      addStat(message.author.id, "spent-guild", amount);

      await addToGuildBank(guild.guildName, amount, message.member);

      const embed = new CustomEmbed(message.member).setHeader(
        "guild deposit",
        message.author.avatarURL(),
        `https://nypsi.xyz/guild/${encodeURIComponent(guild.guildName)}`,
      );

      embed.setDescription(
        `$**${guild.balance.toLocaleString()}**\n  +$**${amount.toLocaleString()}**`,
      );

      await reaction.message.edit({ embeds: [embed], components: [] });

      embed.setDescription(`$**${(Number(guild.balance) + amount).toLocaleString()}**`);

      return setTimeout(() => {
        reaction.message.edit({ embeds: [embed] });
      }, 1500);
    }
  }

  if (args[0].toLowerCase() == "stats") {
    if (!guild) {
      return send({ embeds: [new ErrorEmbed("you're not in a guild")] });
    }

    await addCooldown(cmd.name, message.member, 10);

    const members = guild.members;

    const embed = new CustomEmbed(message.member).setHeader(
      `${guild.guildName} stats`,
      message.author.avatarURL(),
      `https://nypsi.xyz/guild/${encodeURIComponent(guild.guildName)}`,
    );

    let xp = "";
    let money = "";
    let xpLevel = "";
    let moneyLevel = "";

    const xpSort = sort(members).desc([(i) => i.contributedXp, (i) => i.contributedMoney]);
    const moneySort = sort(members).desc([(i) => i.contributedMoney, (i) => i.contributedXp]);
    const xpLevelSort = sort(members).desc([
      (i) => i.contributedXpThisLevel,
      (i) => i.contributedMoneyThisLevel,
    ]);
    const moneyLevelSort = sort(members).desc([
      (i) => i.contributedMoneyThisLevel,
      (i) => i.contributedXp,
    ]);

    for (const m of xpSort) {
      let position = (xpSort.indexOf(m) + 1).toString();

      if (position == "1") position = "🥇";
      else if (position == "2") position = "🥈";
      else if (position == "3") position = "🥉";
      else position += ".";

      xp += `${position} **${
        m.economy.user.lastKnownUsername
      }** ${m.contributedXp.toLocaleString()}xp\n`;
    }

    for (const m of moneySort) {
      let position = (moneySort.indexOf(m) + 1).toString();

      if (position == "1") position = "🥇";
      else if (position == "2") position = "🥈";
      else if (position == "3") position = "🥉";
      else position += ".";

      money += `${position} **${
        m.economy.user.lastKnownUsername
      }** $${m.contributedMoney.toLocaleString()}\n`;
    }

    for (const m of xpLevelSort) {
      let position = (xpLevelSort.indexOf(m) + 1).toString();

      if (position == "1") position = "🥇";
      else if (position == "2") position = "🥈";
      else if (position == "3") position = "🥉";
      else position += ".";

      xpLevel += `${position} **${
        m.economy.user.lastKnownUsername
      }** ${m.contributedXpThisLevel.toLocaleString()}xp\n`;
    }

    for (const m of moneyLevelSort) {
      let position = (moneyLevelSort.indexOf(m) + 1).toString();

      if (position == "1") position = "🥇";
      else if (position == "2") position = "🥈";
      else if (position == "3") position = "🥉";
      else position += ".";

      moneyLevel += `${position} **${
        m.economy.user.lastKnownUsername
      }** $${m.contributedMoneyThisLevel.toLocaleString()}\n`;
    }

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("overall")
        .setCustomId("overall")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setLabel("this level")
        .setCustomId("level")
        .setStyle(ButtonStyle.Secondary),
    );

    embed.setFields(
      { name: "xp", value: xp, inline: true },
      { name: "money", value: money, inline: true },
    );

    const msg = await send({ embeds: [embed], components: [row] });

    const listen = async () => {
      const filter = (i: ButtonInteraction) => i.user.id === message.author.id;

      const interaction = await msg
        .awaitMessageComponent({ filter, time: 30000, componentType: ComponentType.Button })
        .catch(() => {
          row.components.forEach((c) => c.setDisabled(true));
          msg.edit({ components: [row] });
        });

      if (!interaction) return;

      if (interaction.customId === "overall") {
        embed.setFields(
          { name: "xp", value: xp, inline: true },
          { name: "money", value: money, inline: true },
        );
        row.components[0].setDisabled(true);
        row.components[1].setDisabled(false);

        interaction.update({ embeds: [embed], components: [row] });
        listen();
      } else {
        embed.setFields(
          { name: "xp", value: xpLevel, inline: true },
          { name: "money", value: moneyLevel, inline: true },
        );
        row.components[0].setDisabled(false);
        row.components[1].setDisabled(true);

        interaction.update({ embeds: [embed], components: [row] });
        listen();
      }
    };

    return listen();
  }

  if (args[0].toLowerCase() == "upgrade") {
    if (!guild) {
      return send({ embeds: [new ErrorEmbed("you're not in a guild")] });
    }

    if (guild.level >= Constants.MAX_GUILD_LEVEL) {
      return send({
        embeds: [new CustomEmbed(message.member, `**${guild.guildName}** is at max level`)],
      });
    }

    await addCooldown(cmd.name, message.member, 3);

    let requirements = await getRequiredForGuildUpgrade(guild.guildName);

    if (guild.members.length !== requirements.members)
      requirements = await getRequiredForGuildUpgrade(guild.guildName, false);

    const embed = new CustomEmbed(message.member);

    embed.setHeader(
      guild.guildName,
      message.author.avatarURL(),
      `https://nypsi.xyz/guild/${encodeURIComponent(guild.guildName)}`,
    );
    embed.setDescription(
      `requirements to upgrade to level **${guild.level + 1}**:\n\n` +
        `**money** $${guild.balance.toLocaleString()}/$${requirements.money.toLocaleString()}\n` +
        `**xp** ${guild.xp.toLocaleString()}xp/${requirements.xp.toLocaleString()}xp\n\n` +
        "note: the upgrade will be handled automatically when all requirements are met",
    );

    return send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "motd") {
    if (!guild) {
      return send({ embeds: [new ErrorEmbed("you're not in a guild")] });
    }

    if (guild.ownerId != message.author.id) {
      return send({ embeds: [new ErrorEmbed("you are not the guild owner")] });
    }

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed(`${prefix}guild motd <new motd>`)] });
    }

    args.shift();

    const motd = args.join(" ").normalize("NFD");

    if (motd.length > 500) {
      return send({ embeds: [new ErrorEmbed("guild motd cannot be longer than 500 characters")] });
    }

    for (const word of filter) {
      if (cleanString(motd).toLowerCase().includes(word))
        return send({ embeds: [new ErrorEmbed("invalid guild motd")] });
    }

    await addCooldown(cmd.name, message.member, 3);

    await setGuildMOTD(guild.guildName, motd);

    return send({ embeds: [new CustomEmbed(message.member, "✅ motd has been updated")] });
  }

  if (args[0].toLowerCase() == "help") {
    const embed = new CustomEmbed(message.member);

    embed.setHeader("guild help");
    embed.setDescription(
      `${prefix}**guild create <name>** *create a guild*\n` +
        `${prefix}**guild invite <@member>** *invite a user to your guild*\n` +
        `${prefix}**guild leave** *leave your current guild*\n` +
        `${prefix}**guild kick <tag>** *kick user from your guild*\n` +
        `${prefix}**guild delete** *delete your guild*\n` +
        `${prefix}**guild deposit <amount>** *deposit money into your guild*\n` +
        `${prefix}**guild stats** *show contribution stats of your guild*\n` +
        `${prefix}**guild shop** *view guild upgrades that are available to buy*\n` +
        `${prefix}**guild buy** *buy guild upgrades with tokens*\n` +
        `${prefix}**guild upgrade** *show requirements for next upgrade*\n` +
        `${prefix}**guild motd <motd>** *set guild motd*\n` +
        `${prefix}**top guild** *view top guilds on nypsi*\n` +
        `${prefix}**guild (name)** *show guild info*`,
    );
    embed.setFooter({ text: "you must be at least prestige 1 to create a guild" });

    return send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() == "buy") {
    if (!guild) return send({ embeds: [new ErrorEmbed("you are not in a guild")] });
    if (guild.ownerId !== message.author.id)
      return send({ embeds: [new ErrorEmbed("you must be the guild owner")] });

    if (args.length === 1) return send({ embeds: [new ErrorEmbed("/guild buy <item>")] });

    const upgrades = getGuildUpgradeData();

    const selected = Object.values(upgrades).find((i) => i.id === args[1].toLowerCase());
    if (!selected) return send({ embeds: [new ErrorEmbed("invalid upgrade")] });

    const cost =
      selected.cost +
      Math.floor(
        (guild.upgrades.find((i) => i.upgradeId === selected.id)?.amount || 0) *
          selected.increment_per_level,
      );

    if (guild.tokens < cost)
      return send({ embeds: [new ErrorEmbed("you cannot afford this upgrade")] });

    await prisma.economyGuild.update({
      where: { guildName: guild.guildName },
      data: {
        tokens: { decrement: cost },
      },
    });

    await addGuildUpgrade(guild.guildName, selected.id);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          `✅ you have bought **${selected.name}** for ${cost} token${cost != 1 ? "s" : ""}`,
        ),
      ],
    });
  }

  if (args[0].toLowerCase() == "shop") {
    if (!guild) return send({ embeds: [new ErrorEmbed("you are not in a guild")] });
    const upgrades = getGuildUpgradeData();

    const pages = new Map<number, { name: string; value: string; inline: true }[]>();

    for (const upgrade of Object.values(upgrades)) {
      const name = upgrade.id;
      const value =
        `**${upgrade.name}** (${
          guild.upgrades.find((i) => i.upgradeId === upgrade.id)?.amount || 0
        })\n` +
        `*${upgrade.description}*\n` +
        `**cost** ${
          upgrade.cost +
          Math.floor(
            (guild.upgrades.find((i) => i.upgradeId === upgrade.id)?.amount || 0) *
              upgrade.increment_per_level,
          )
        } token${
          upgrade.cost +
            Math.floor(
              (guild.upgrades.find((i) => i.upgradeId === upgrade.id)?.amount || 0) *
                upgrade.increment_per_level,
            ) !=
          1
            ? "s"
            : ""
        }`;

      if (pages.size === 0) {
        pages.set(1, [{ name, value, inline: true }]);
      } else if (pages.get(pages.size).length >= 6) {
        pages.set(pages.size + 1, [{ name, value, inline: true }]);
      } else {
        pages.get(pages.size).push({ name, value, inline: true });
      }
    }

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("⬅")
        .setLabel("back")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("❌").setLabel("clear mentions").setStyle(ButtonStyle.Danger),
    );

    const embed = new CustomEmbed(message.member)
      .setHeader(
        `${guild.guildName} upgrades`,
        message.author.avatarURL(),
        `https://nypsi.xyz/guild/${encodeURIComponent(guild.guildName)}`,
      )
      .setFields(...pages.get(1))
      .setFooter({ text: `you have ${guild.tokens} token${guild.tokens != 1 ? "s" : ""}` });

    if (pages.size === 1) return send({ embeds: [embed] });

    const msg = await send({ embeds: [embed], components: [row] });

    const manager = new PageManager({
      embed,
      message: msg,
      row,
      userId: message.author.id,
      pages,
      updateEmbed(page, embed) {
        embed.setFields(...page);
        return embed;
      },
    });

    return manager.listen();
  }

  if (args[0].toLowerCase() == "view") {
    args.shift();
  }

  const name = args.join(" ");

  if (name.length > 25) {
    return send({ embeds: [new ErrorEmbed("invalid guild")] });
  }

  await addCooldown(cmd.name, message.member, 7);

  const targetGuild = await getGuildByName(name);

  if (!targetGuild) {
    if (guild) {
      return showGuild(guild);
    }
    return send({ embeds: [new ErrorEmbed("invalid guild")] });
  }

  return showGuild(targetGuild);
}

cmd.setRun(run);

module.exports = cmd;

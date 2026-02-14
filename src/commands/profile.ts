import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { sort } from "fast-sort";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import {
  calcNetWorth,
  getBalance,
  getBankBalance,
  getGambleMulti,
  getMaxBankBalance,
  getSellMulti,
  hasPadlock,
} from "../utils/functions/economy/balance.js";
import { getGuildByUser } from "../utils/functions/economy/guilds";
import { getInventory } from "../utils/functions/economy/inventory";
import {
  calculateRawLevel,
  getLevel,
  getLevelRequirements,
  getPrestige,
  getUpgrades,
  setLevel,
  setPrestige,
  setUpgrade,
} from "../utils/functions/economy/levelling.js";
import {
  createUser,
  formatNumberPretty,
  getItems,
  getTagsData,
  getUpgradesData,
  isEcoBanned,
  maxPrestige,
  userExists,
} from "../utils/functions/economy/utils.js";
import { getXp } from "../utils/functions/economy/xp";
import { getMember } from "../utils/functions/member.js";
import PageManager from "../utils/functions/page";
import { getTier } from "../utils/functions/premium/premium";
import { percentChance } from "../utils/functions/random";
import { pluralize } from "../utils/functions/string";
import { isUserBlacklisted } from "../utils/functions/users/blacklist";
import { isMarried } from "../utils/functions/users/marriage";
import { getActiveTag, getTags, showTags } from "../utils/functions/users/tags";
import { getLastKnownUsername } from "../utils/functions/users/username";
import { hasProfile } from "../utils/functions/users/utils";
import { addView, getViews } from "../utils/functions/users/views";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("profile", "view yours or someone's nypsi profile", "money").setAliases([
  "p",
]);

cmd.slashEnabled = true;
cmd.slashData.addUserOption((user) =>
  user.setName("user").setDescription("user you want to see the profile for").setRequired(false),
);

const tierMap = new Map([
  [1, "<:nypsi_bronze:1108083689478443058>"],
  [2, "<:nypsi_silver:1108083725813686334>"],
  [3, "<:nypsi_gold:1108083767236640818>"],
  [4, "<:nypsi_plat:1108083805841002678>"],
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  let target = message.member;

  if (args.length >= 1) {
    target = await getMember(message.guild, args.join(" "));

    if (!target) {
      return send({ embeds: [new ErrorEmbed("invalid user")], flags: MessageFlags.Ephemeral });
    }
  }

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  await addCooldown(cmd.name, message.member, 5);

  if (!(await hasProfile(target)))
    return send({
      embeds: [new ErrorEmbed(`${target.toString()} has never used nypsi. what a LOSER lol.`)],
    });

  if (!(await userExists(target))) await createUser(target);

  if ((await isUserBlacklisted(target)).blacklisted)
    return send({
      embeds: [
        new ErrorEmbed(
          `${target.user.toString()} is blacklisted 😬. they did something REALLY bad. laugh at them for me. lol. AHHAHAAHHA`,
        ),
      ],
    });

  if ((await isEcoBanned(target)).banned)
    return send({ embeds: [new ErrorEmbed(`${target.toString()} is banned AHAHAHAHA`)] });

  const [tag, tier] = await Promise.all([getActiveTag(target), getTier(target)]);

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

  const embed = new CustomEmbed(target)
    .setThumbnail(target.user.avatarURL())
    .setTitle(
      `${tag ? `[${getTagsData()[tag.tagId].emoji}] ` : ""}${target.user.username}${
        tierMap.has(tier) ? ` ${tierMap.get(tier)}` : ""
      }`,
    )
    .setURL(`https://nypsi.xyz/users/${target.id}?ref=bot-profile`);

  const updateEmbed = async () => {
    const [
      balance,
      prestige,
      inventory,
      net,
      bankBalance,
      bankMaxBalance,
      padlock,
      level,
      xp,
      guild,
      tags,
      views,
      upgrades,
    ] = await Promise.all([
      getBalance(target),
      getPrestige(target),
      getInventory(target),
      calcNetWorth("profile", target, target.client as NypsiClient),
      getBankBalance(target),
      getMaxBankBalance(target),
      hasPadlock(target),
      getLevel(target),
      getXp(target),
      getGuildByUser(target),
      getTags(target),
      getViews(target),
      getUpgrades(target),
    ]);

    const levelRequirements = getLevelRequirements(prestige, level);

    embed.setFields([]);
    row.setComponents([]);
    let padlockStatus = false;

    if (target.user.id == message.author.id && padlock) padlockStatus = true;

    let desc = "";

    if ((await inventory.hasGem("crystal_heart")).any)
      desc += `${getItems()["crystal_heart"].emoji}`;
    if ((await inventory.hasGem("white_gem")).any) desc += `${getItems()["white_gem"].emoji}`;
    if ((await inventory.hasGem("pink_gem")).any) desc += `${getItems()["pink_gem"].emoji}`;
    if ((await inventory.hasGem("purple_gem")).any) desc += `${getItems()["purple_gem"].emoji}`;
    if ((await inventory.hasGem("blue_gem")).any) desc += `${getItems()["blue_gem"].emoji}`;
    if ((await inventory.hasGem("green_gem")).any) desc += `${getItems()["green_gem"].emoji}`;

    const marriage = await isMarried(target);

    if (marriage) {
      desc += `${desc ? "\n" : ""}${getItems()["ring"].emoji} married to **${await getLastKnownUsername(marriage.partnerId)}**`;
    }

    if (
      message.author.id === target.user.id &&
      levelRequirements.money > bankMaxBalance &&
      calculateRawLevel(level, prestige) < 700
    ) {
      desc += `${desc ? "\n\n" : ""}your bank is too small for the next level up, you can use [stolen credit cards](https://nypsi.xyz/items/stolen_credit_card?ref=bot-level) to increase your bank size`;
    }

    const balanceSection =
      `${padlockStatus ? "🔒" : "💰"} $**${formatNumberPretty(balance)}**\n` +
      `💳 $**${formatNumberPretty(bankBalance)}** / $**${formatNumberPretty(bankMaxBalance)}**${
        net.amount > 15_000_000 ? `\n🌍 $**${formatNumberPretty(net.amount)}**` : ""
      }`;

    if (desc) embed.setDescription(desc);
    embed.addField("balance", balanceSection, true);
    embed.addField(
      "level",
      `P${prestige} L${level}\n` +
        `**${formatNumberPretty(xp)}**xp/**${formatNumberPretty(levelRequirements.xp)}**xp\n` +
        `$**${formatNumberPretty(bankBalance)}**/$**${formatNumberPretty(levelRequirements.money)}**`,
      true,
    );
    if (guild)
      embed.addField(
        "guild",
        `[${guild.guildName}](https://nypsi.xyz/guilds/${encodeURIComponent(guild.guildName.replaceAll(" ", "-"))}?ref=bot-profile)\n` +
          `level **${guild.level}**\n` +
          `${guild.members.length} ${pluralize("member", guild.members.length)}`,
        true,
      );

    if (views.length > 10)
      embed.setFooter({ text: `${views.length.toLocaleString()} monthly views` });

    if (target.id === message.author.id)
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("p-pre")
          .setLabel("prestige")
          .setEmoji("✨")
          .setStyle(level >= 100 ? ButtonStyle.Success : ButtonStyle.Danger),
      );

    if (upgrades.length > 0)
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("p-upg")
          .setLabel("upgrades")
          .setEmoji("💫")
          .setStyle(ButtonStyle.Primary),
      );

    row.addComponents(
      new ButtonBuilder()
        .setCustomId("p-mul")
        .setLabel("multiplier")
        .setEmoji("🌟")
        .setStyle(ButtonStyle.Primary),
    );

    if (tags.length > 0)
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("p-tag")
          .setLabel("tags")
          .setEmoji("🏷️")
          .setStyle(ButtonStyle.Primary),
      );
  };

  await updateEmbed();

  const msg = await send({ embeds: [embed], components: [row] });

  const awaitButton: any = async () => {
    const reaction: ButtonInteraction | void = await msg
      .awaitMessageComponent({
        filter: (i) => i.user.id === message.author.id,
        time: 30000,
        componentType: ComponentType.Button,
      })
      .catch(() => {});

    if (!reaction) return msg.edit({ components: [] });

    if (reaction.customId === "p-pre") {
      const [level, prestige] = await Promise.all([getLevel(target), getPrestige(target)]);
      if (reaction.user.id === target.user.id) {
        if (level < 100) {
          await reaction.reply({
            embeds: [new ErrorEmbed(`you must be at least level 100 to prestige\n\n${level}/100`)],
          });
          return awaitButton();
        }

        if (prestige >= maxPrestige) {
          await reaction.reply({
            embeds: [
              new CustomEmbed(
                message.member,
                "you're at max prestige. well done. nerd. <3",
              ).setImage("https://file.maxz.dev/If87xT6LC_.png"),
            ],
          });
          return awaitButton();
        }

        if (await onCooldown("prestige", message.member)) {
          const res = await getResponse("prestige", message.member);

          if (res.respond) await reaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
          return awaitButton();
        }

        const prestigeConfirmation = new CustomEmbed(
          message.member,
          `confirm you want to become even cooler (prestige ${prestige + 1} level ${level - 100})`,
        ).setHeader("prestige", message.author.avatarURL());

        const prestigeRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder().setCustomId("✅").setLabel("do it.").setStyle(ButtonStyle.Success),
        );

        const prestigeMsg = await reaction
          .reply({ embeds: [prestigeConfirmation], components: [prestigeRow] })
          .then(() => reaction.fetchReply());

        const prestigeReaction: string | void = await prestigeMsg
          .awaitMessageComponent({ filter: (i) => i.user.id === message.author.id, time: 15000 })
          .then(async (collected) => {
            await collected.deferUpdate();
            return collected.customId;
          })
          .catch(async () => {
            await prestigeMsg.edit({
              embeds: [prestigeConfirmation],
              components: [
                new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                  new ButtonBuilder()
                    .setStyle(ButtonStyle.Danger)
                    .setLabel("expired")
                    .setCustomId("boobies")
                    .setDisabled(true),
                ),
              ],
            });
          });

        if (!prestigeReaction) return;

        if (prestigeReaction === "✅") {
          const [level, prestige] = await Promise.all([
            getLevel(message.member),
            getPrestige(message.member),
          ]);

          if (level < 100)
            return prestigeMsg.edit({ embeds: [new ErrorEmbed("lol nice try loser")] });

          await addCooldown("prestige", message.member, 300);

          const [upgrades] = await Promise.all([
            getUpgrades(message.member),
            setLevel(message.member, level - 100),
            setPrestige(message.member, prestige + 1),
          ]);

          const upgradesPool: string[] = [];
          let attempts = 0;

          while (upgradesPool.length === 0 && attempts < 50) {
            attempts++;
            for (const upgrade of Object.values(getUpgradesData())) {
              if (
                upgrades.find((i) => i.upgradeId === upgrade.id) &&
                upgrades.find((i) => i.upgradeId === upgrade.id).amount >= upgrade.max
              )
                continue;

              if (percentChance(upgrade.chance)) {
                upgradesPool.push(upgrade.id);
              }
            }
          }

          const chosen =
            upgradesPool.length > 0
              ? upgradesPool[Math.floor(Math.random() * upgradesPool.length)]
              : "";

          if (chosen)
            await setUpgrade(
              message.member,
              chosen,
              upgrades.find((i) => i.upgradeId === chosen)
                ? upgrades.find((i) => i.upgradeId === chosen).amount + 1
                : 1,
            );

          const desc: string[] = [];

          if (chosen) {
            desc.push(`you have received the ${getUpgradesData()[chosen].name} upgrade`);
          } else {
            desc.push("you didn't find an upgrade this prestige ):");
          }

          await prestigeMsg.edit({
            embeds: [
              new CustomEmbed()
                .setHeader("prestige", message.author.avatarURL())
                .setColor(Constants.EMBED_SUCCESS_COLOR)
                .setDescription(
                  `you are now **prestige ${prestige + 1} level ${level - 100}**\n\n${desc.join(
                    "\n",
                  )}`,
                ),
            ],
            components: [],
          });
          await updateEmbed();
          await msg.edit({ embeds: [embed], components: [row] });
          return awaitButton();
        }
      } else {
        if (level >= 100) {
          await reaction.reply({
            embeds: [
              new CustomEmbed()
                .setColor(Constants.EMBED_SUCCESS_COLOR)
                .setDescription(`eligible to prestige\n\n${level}/100`),
            ],
          });
          return awaitButton();
        } else {
          await reaction.reply({
            embeds: [
              new CustomEmbed()
                .setColor(Constants.EMBED_FAIL_COLOR)
                .setDescription(`not eligible to prestige\n\n${level}/100`),
            ],
          });
          return awaitButton();
        }
      }
    } else if (reaction.customId === "p-upg") {
      if (await onCooldown("p-upg", message.member)) {
        const res = await getResponse("p-upg", message.member);

        if (res.respond)
          await reaction.reply({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
        return awaitButton();
      }

      await addCooldown("p-upg", message.member, 5);

      const upgrades = sort(await getUpgrades(target)).desc((i) => i.amount);

      const embed = new CustomEmbed(
        target,
        upgrades
          .map(
            (i) =>
              `\`${i.amount}x\` **${getUpgradesData()[i.upgradeId].name}** *${getUpgradesData()[
                i.upgradeId
              ].description.replace(
                "{x}",
                (i.upgradeId.includes("xp") || i.upgradeId === "farm_output"
                  ? Math.floor(getUpgradesData()[i.upgradeId].effect * i.amount * 100)
                  : getUpgradesData()[i.upgradeId].effect * i.amount
                ).toPrecision(2),
              )}*`,
          )
          .join("\n"),
      ).setHeader(`${target.user.username}'s upgrades`, target.user.avatarURL());

      await reaction.reply({ embeds: [embed] });

      return awaitButton();
    } else if (reaction.customId === "p-mul") {
      if (await onCooldown("p-mul", message.member)) {
        const res = await getResponse("p-mul", message.member);

        if (res.respond)
          await reaction.reply({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
        return awaitButton();
      }

      await addCooldown("p-mul", message.member, 5);

      const gamble = await getGambleMulti(target, target.client as NypsiClient);
      const sell = await getSellMulti(target, target.client as NypsiClient);

      let gambleBreakdown = "";
      let sellBreakdown = "";

      for (const [key, value] of sort(Array.from(gamble.breakdown.entries())).desc((i) => i[1])) {
        gambleBreakdown += `- \`${value}%\` ${key}\n`;
      }

      for (const [key, value] of sort(Array.from(sell.breakdown.entries())).desc((i) => i[1])) {
        sellBreakdown += `- \`${value}%\` ${key}\n`;
      }

      const embed = new CustomEmbed(target)
        .setHeader(`${target.user.username}'s multipliers`, target.user.avatarURL())
        .addField(
          "gamble",
          `**total** ${Math.round(gamble.multi * 100)}%\n${gambleBreakdown}`,
          true,
        )
        .addField("sell", `**total** ${Math.round(sell.multi * 100)}%\n${sellBreakdown}`, true);

      await reaction.reply({ embeds: [embed] });

      return awaitButton();
    } else if (reaction.customId === "p-tag") {
      if (await onCooldown("p-tag", message.member)) {
        const res = await getResponse("p-tag", message.member);

        if (res.respond)
          await reaction.reply({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
        return awaitButton();
      }

      await addCooldown("p-tag", message.member, 5);

      const { pages, embed } = await showTags(target);

      if (pages.size === 1) {
        return reaction.reply({ embeds: [embed] });
      }

      const row = PageManager.defaultRow();

      const msg = await reaction
        .reply({ embeds: [embed], components: [row] })
        .then((m) => m.fetch());

      const manager = new PageManager({
        embed,
        message: msg,
        row,
        userId: message.author.id,
        allowMessageDupe: true,
        pages,
      });

      manager.listen();
      return awaitButton();
    }
  };
  awaitButton();

  addView(target, message.member, `profile in ${message.guild.id}`);
}

cmd.setRun(run);

module.exports = cmd;

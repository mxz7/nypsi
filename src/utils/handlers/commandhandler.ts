import { REST } from "@discordjs/rest";
import {
  ActionRowBuilder,
  APIEmbed,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  GuildMember,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
  PermissionFlagsBits,
  Routes,
  WebhookClient,
} from "discord.js";
import * as fs from "fs";
import { getBorderCharacters, table } from "table";
import redis from "../../init/redis";
import { NypsiClient } from "../../models/Client";
import { Categories, Command, NypsiCommandInteraction } from "../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../models/EmbedBuilders";
import { isLockedOut, toggleLock, verifyUser } from "../functions/captcha";
import { formatDate, MStoTime } from "../functions/date";
import { getNews, hasSeenNews } from "../functions/news";
import { getTimestamp, logger } from "../logger";
// @ts-expect-error typescript doesnt like opening package.json
import { version } from "../../../package.json";
import { Item } from "../../types/Economy";
import Constants from "../Constants";
import { a } from "../functions/anticheat";
import { addProgress } from "../functions/economy/achievements";
import { commandGemCheck } from "../functions/economy/inventory";
import { createUser, getEcoBanTime, getItems, isEcoBanned, isHandcuffed, userExists } from "../functions/economy/utils";
import { getXp, updateXp } from "../functions/economy/xp";
import { getDisabledCommands } from "../functions/guilds/disabledcommands";
import { getChatFilter } from "../functions/guilds/filters";
import { getPrefix } from "../functions/guilds/utils";
import { addKarma, getKarma } from "../functions/karma/karma";
import { addUse, getCommand } from "../functions/premium/command";
import { cleanString } from "../functions/string";
import { isUserBlacklisted } from "../functions/users/blacklist";
import { addCommandUse, getLastCommand, updateLastCommand } from "../functions/users/commands";
import { getLastKnownTag, updateLastKnowntag } from "../functions/users/tag";
import { createProfile, hasProfile } from "../functions/users/utils";
import dayjs = require("dayjs");

const commands = new Map<string, Command>();
const aliases = new Map<string, string>();
const hourlyCommandCount = new Map<string, number>();
const commandUses = new Map<string, number>();

const karmaCooldown = new Set<string>();
const xpCooldown = new Set<string>();
const cooldown = new Set<string>();

let commandsSize = 0;
let aliasesSize = 0;

export { commandsSize, aliasesSize };

let restarting = false;

export function loadCommands() {
  const commandFiles = fs.readdirSync("./dist/commands/").filter((file) => file.endsWith(".js"));
  const failedTable = [];

  if (commands.size > 0) {
    for (const command of commands.keys()) {
      delete require.cache[require.resolve(`../../commands/${command}.js`)];
    }
    commands.clear();
    aliases.clear();
  }

  for (const file of commandFiles) {
    let command;

    try {
      command = require(`../../commands/${file}`);

      let enabled = true;

      if (!command.name || !command.description || !command.run || !command.category) {
        enabled = false;
      }

      if (enabled) {
        commands.set(command.name, command);
        if (command.aliases) {
          for (const a of command.aliases) {
            if (aliases.has(a)) {
              logger.warn(`duplicate alias: ${a} [original: ${aliases.get(a)} copy: ${command.name}] - not overwriting`);
            } else {
              aliases.set(a, command.name);
            }
          }
        }
      } else {
        failedTable.push([file, "❌"]);
        logger.error(file + " missing name, description, category or run");
      }
    } catch (e) {
      failedTable.push([file, "❌"]);
      logger.error(e);
    }
  }
  aliasesSize = aliases.size;
  commandsSize = commands.size;

  if (failedTable.length != 0) {
    console.log(table(failedTable, { border: getBorderCharacters("ramac") }));
  }

  logger.info(`${commands.size.toLocaleString()} commands loaded`);
  logger.info(`${aliases.size.toLocaleString()} aliases loaded`);
}

export function reloadCommand(commandsArray: string[]) {
  const reloadTable = [];

  for (const cmd of commandsArray) {
    try {
      commands.delete(cmd);
      try {
        delete require.cache[require.resolve(`../../commands/${cmd}`)];
      } catch (e) {
        logger.error("error deleting from cache");
        return;
      }

      let commandData: Command | number = 0;

      commandData = require(`../../commands/${cmd}`);

      let enabled = true;

      if (!(commandData instanceof Command)) enabled = false;

      if (enabled && commandData instanceof Command) {
        commands.set(commandData.name, commandData);
        if (commandData.aliases) {
          for (const a of commandData.aliases) {
            if (aliases.has(a) && aliases.get(a) != commandData.name) {
              logger.error(
                `duplicate alias: ${a} [original: ${aliases.get(a)} copy: ${commandData.name}] - not overwriting`
              );
            } else {
              aliases.set(a, commandData.name);
            }
          }
        }
        reloadTable.push([commandData.name, "✅"]);
        commandsSize = commands.size;
      } else {
        reloadTable.push([cmd, "❌"]);
        commandsSize = commands.size;
      }
    } catch (e) {
      reloadTable.push([cmd, "❌"]);
      logger.error(e);
    }
  }
  aliasesSize = aliases.size;
  commandsSize = commands.size;
  console.log(table(reloadTable, { border: getBorderCharacters("ramac") }));
  return table(reloadTable, { border: getBorderCharacters("ramac") });
}

async function helpCmd(message: Message, args: string[]) {
  logCommand(message, args);

  const helpCategories = new Map<string, Map<number, string[]>>();

  const prefix = await getPrefix(message.guild);

  for (const cmd of commands.keys()) {
    const category = getCmdCategory(cmd);

    if (category == "none") continue;

    if (helpCategories.has(category)) {
      const current = helpCategories.get(category);
      const lastPage = current.get(current.size);

      if (lastPage.length == 10) {
        const newPage = [];

        newPage.push(`${prefix}**${getCmdName(cmd)}** *${getCmdDesc(cmd)}*`);
        current.set(current.size + 1, newPage);
      } else {
        const page = current.get(current.size);
        page.push(`${prefix}**${getCmdName(cmd)}** *${getCmdDesc(cmd)}*`);
        current.set(current.size, page);
      }

      helpCategories.set(category, current);
    } else {
      const pages = new Map<number, string[]>();

      pages.set(1, [`${prefix}**${getCmdName(cmd)}** *${getCmdDesc(cmd)}*`]);

      helpCategories.set(category, pages);
    }
  }

  const embed = new CustomEmbed(message.member).setFooter({ text: `v${version}` });

  /**
   * FINDING WHAT THE USER REQUESTED
   */

  let pageSystemNeeded = false;

  if (args.length == 0) {
    const categories = Array.from(helpCategories.keys()).sort();

    let categoriesMsg = "";

    for (const category of categories) {
      categoriesMsg += `» ${prefix}help **${category}**\n`;
    }

    const news = await getNews();

    embed.setTitle("help menu");
    embed.setDescription(
      "invite nypsi to your server: [invite.nypsi.xyz](http://invite.nypsi.xyz)\n\n" +
        "if you need support, want to report a bug or suggest a feature, you can join the nypsi server: https://discord.gg/hJTDNST\n\n" +
        `my prefix for this server is \`${prefix}\``
    );
    embed.addField("command categories", categoriesMsg, true);
    embed.setThumbnail(message.client.user.displayAvatarURL({ size: 128 }));

    if (news.text != "") {
      embed.addField("news", `${news.text} - *${formatDate(news.date)}*`);
    }
  } else {
    if (args[0].toLowerCase() == "mod") args[0] = "moderation";
    if (args[0].toLowerCase() == "util") args[0] = "utility";
    if (args[0].toLowerCase() == "pictures") args[0] = "animals";
    if (args[0].toLowerCase() == "eco") args[0] = "money";
    if (args[0].toLowerCase() == "economy") args[0] = "money";
    if (args[0].toLowerCase() == "gamble") args[0] = "money";
    if (args[0].toLowerCase() == "gambling") args[0] = "money";

    const items = getItems();

    let selectedItem: Item;
    const searchTag = args.join(" ");

    for (const itemName of Array.from(Object.keys(items))) {
      const aliases = items[itemName].aliases ? items[itemName].aliases : [];
      if (searchTag == itemName) {
        selectedItem = items[itemName];
        break;
      } else if (searchTag == itemName.split("_").join("")) {
        selectedItem = items[itemName];
        break;
      } else if (aliases.indexOf(searchTag) != -1) {
        selectedItem = items[itemName];
        break;
      } else if (searchTag == items[itemName].name) {
        selectedItem = items[itemName];
        break;
      }
    }

    if (helpCategories.has(args[0].toLowerCase())) {
      const pages = helpCategories.get(args[0].toLowerCase());

      if (pages.size > 1) {
        pageSystemNeeded = true;
      }

      embed.setTitle(`${args[0].toLowerCase()} commands`);
      embed.setDescription(pages.get(1).join("\n"));
      embed.setFooter({ text: `page 1/${pages.size} | v${version}` });
    } else if (commands.has(args[0].toLowerCase()) || aliases.has(args[0].toLowerCase())) {
      let cmd: Command;

      if (aliases.has(args[0].toLowerCase())) {
        cmd = commands.get(aliases.get(args[0].toLowerCase()));
      } else {
        cmd = commands.get(args[0].toLowerCase());
      }

      let desc =
        "**name** " + cmd.name + "\n" + "**description** " + cmd.description + "\n" + "**category** " + cmd.category;

      if (cmd.permissions) {
        desc = desc + "\n**permission(s) required** `" + cmd.permissions.join("`, `") + "`";
      }

      if (cmd.aliases) {
        desc = desc + "\n**aliases** `" + prefix + cmd.aliases.join("`, `" + prefix) + "`";
      }

      if (cmd.docs) {
        desc += `\n**docs** ${cmd.docs}`;
      }

      embed.setTitle(`${cmd.name} command`);
      embed.setDescription(desc);
    } else if (await getCommand(args[0].toLowerCase())) {
      const owner = (await getCommand(args[0].toLowerCase())).owner;
      const member = message.guild.members.cache.find((m) => m.id == owner);
      embed.setTitle("custom command");
      embed.setDescription(
        `this is a custom command${
          member ? ` owned by ${member.toString()}` : ""
        }\n\nto disable custom commands in your server you can do:\n${prefix}disablecmd + customcommand`
      );
    } else if (selectedItem) {
      embed.setTitle(`${selectedItem.emoji} ${selectedItem.name}`);

      const desc: string[] = [`**id** \`${selectedItem.id}\``, `**description** ${selectedItem.longDesc}`];

      if (selectedItem.aliases) {
        desc.push(`**aliases** \`${selectedItem.aliases.join("`, `")}\``);
      }

      if (selectedItem.buy) {
        desc.push(`**buy** $${selectedItem.buy.toLocaleString()}`);
      }

      if (selectedItem.sell) {
        desc.push(`**sell** $${selectedItem.sell.toLocaleString()}`);
      }

      if (selectedItem.rarity) {
        const rarityMap = new Map<number, string>();

        rarityMap.set(0, "common");
        rarityMap.set(1, "uncommon");
        rarityMap.set(2, "rare");
        rarityMap.set(3, "very rare");
        rarityMap.set(4, "exotic");
        rarityMap.set(5, "impossible");

        let rarity = rarityMap.get(selectedItem.rarity);

        if (!rarity) {
          rarity = "not obtainable through crates";
        }

        desc.push(`**rarity** ${rarity}`);
      }

      if (selectedItem.role) {
        desc.push(`**role** ${selectedItem.role}`);
        if (selectedItem.role == "booster") {
          embed.addField(
            "booster info",
            `**boosts** ${selectedItem.boosterEffect.boosts}\n**effect** ${
              selectedItem.boosterEffect.effect
            }\n**time** ${MStoTime(
              selectedItem.boosterEffect.time * 1000
            )}\nyou can activate your booster with ${prefix}**activate <booster>**`
          );
        } else if (selectedItem.role == "car") {
          embed.addField(
            "car info",
            `**speed** ${selectedItem.speed}\ncars are used for street races (${prefix}**streetrace**)`
          );
        } else if (selectedItem.role == "collectable") {
          embed.addField(
            "collectable info",
            "collectables don't do anything, theyre just *collectables*. if you dont want them, you can get rid of them by selling them"
          );
        } else if (selectedItem.role == "sellable" || selectedItem.role == "prey" || selectedItem.role == "fish") {
          embed.addField(
            "sellable",
            `this item is just meant to be sold. you can use the ${prefix}**sellall** command to do so quickly`
          );
        }
      }

      embed.setDescription(desc.join("\n"));
    } else {
      return message.channel.send({ embeds: [new ErrorEmbed("unknown command or item")] });
    }
  }

  let msg: Message;

  let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
  );

  if (pageSystemNeeded) {
    msg = await message.channel.send({
      embeds: [embed],
      components: [row],
    });
  } else {
    return await message.channel.send({ embeds: [embed] });
  }

  const pages = helpCategories.get(args[0].toLowerCase());

  let currentPage = 1;
  const lastPage = pages.size;

  const filter = (i: Interaction) => i.user.id == message.author.id;

  const pageManager = async (): Promise<void> => {
    const reaction = await msg
      .awaitMessageComponent({ filter, time: 30000 })
      .then(async (collected) => {
        await collected.deferUpdate();
        return collected.customId;
      })
      .catch(async () => {
        await msg.edit({ components: [] }).catch(() => {});
      });

    if (!reaction) return;

    if (reaction == "⬅") {
      if (currentPage <= 1) {
        return pageManager();
      } else {
        currentPage--;
        embed.setDescription(pages.get(currentPage).join("\n"));
        embed.setFooter({ text: `page ${currentPage}/${lastPage} | v${version}` });
        if (currentPage == 1) {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(false)
          );
        } else {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
            new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(false)
          );
        }
        await msg.edit({ embeds: [embed], components: [row] });
        return pageManager();
      }
    } else if (reaction == "➡") {
      if (currentPage >= lastPage) {
        return pageManager();
      } else {
        currentPage++;
        embed.setDescription(pages.get(currentPage).join("\n"));
        embed.setFooter({ text: `page ${currentPage}/${lastPage} | v${version}` });
        if (currentPage == lastPage) {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
            new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(true)
          );
        } else {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(false),
            new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary).setDisabled(false)
          );
        }
        await msg.edit({ embeds: [embed], components: [row] });
        return pageManager();
      }
    }
  };

  return pageManager();
}

export async function runCommand(
  cmd: string,
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[]
) {
  if (!message.channel.isTextBased()) return;
  if (message.channel.isDMBased()) return;

  if (message instanceof Message) {
    if (cooldown.has(message.author.id)) return;

    cooldown.add(message.author.id);

    setTimeout(() => {
      try {
        cooldown.delete(message.author.id);
      } catch {
        cooldown.clear();
      }
    }, 500);
  }

  if (cmd == "help" && message instanceof Message) {
    return helpCmd(message, args);
  }

  let alias = false;
  let command: Command;

  if (!commands.has(cmd) && aliases.has(cmd)) {
    alias = true;
  }

  if (alias) {
    command = commands.get(aliases.get(cmd));
  } else {
    command = commands.get(cmd);
  }

  if (["h", "w"].includes(cmd) && typeof command !== "undefined") {
    if (
      !message.channel.permissionsFor(message.client.user).has(PermissionFlagsBits.ViewChannel) ||
      !message.guild.members.me.permissions.has(PermissionFlagsBits.ViewChannel)
    ) {
      if (message instanceof Message) {
        return message.member
          .send("i don't have access to that channel. please contact server staff if this is an error")
          .catch(() => {});
      } else {
        return message
          .reply({
            embeds: [new ErrorEmbed("i don't have access to this channel. please contact server staff if this is an error")],
          })
          .catch(() => {});
      }
    }

    if (
      !message.channel.permissionsFor(message.client.user).has(PermissionFlagsBits.SendMessages) ||
      !message.guild.members.me.permissions.has(PermissionFlagsBits.SendMessages)
    ) {
      return message.member
        .send(
          "❌ i don't have permission to send messages in that channel - please contact server staff if this is an error"
        )
        .catch(() => {});
    }

    if (
      !message.channel.permissionsFor(message.client.user).has(PermissionFlagsBits.UseApplicationCommands) ||
      !message.guild.members.me.permissions.has(PermissionFlagsBits.UseApplicationCommands)
    ) {
      return message.member
        .send(
          "❌ i don't have permission to perform commands in that channel - please contact server staff if this is an error"
        )
        .catch(() => {});
    }

    if (
      !message.channel.permissionsFor(message.client.user).has(PermissionFlagsBits.EmbedLinks) ||
      !message.guild.members.me.permissions.has(PermissionFlagsBits.EmbedLinks)
    ) {
      return message.channel.send({
        content:
          "❌ i don't have the `embed links` permission\n\nto fix this go to: server settings -> roles -> find my role and enable `embed links`\n" +
          "if this error still shows, check channel specific permissions",
      });
    }

    if (
      !message.channel.permissionsFor(message.client.user).has(PermissionFlagsBits.ManageMessages) ||
      !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)
    ) {
      return message.channel.send(
        "❌ i don't have the `manage messages` permission, this is a required permission for nypsi to work\n\n" +
          "to fix this go to: server settings -> roles -> find my role and enable `manage messages`\n" +
          "if this error still shows, check channel specific permissions"
      );
    }

    if (!message.channel.permissionsFor(message.client.user).has(PermissionFlagsBits.UseExternalEmojis)) {
      return message.channel.send({
        content:
          "❌ i don't have the `use external emojis` permission, this is a required permission for nypsi to work\n\n" +
          "to fix this go to: server settings -> roles -> find my role and enable `use external emojis`\n" +
          "if this error still shows, check channel specific permissions",
      });
    }
  }

  if (!(await hasProfile(message.member))) {
    await createProfile(message.member.user);
  }

  if (await isUserBlacklisted(message.author.id)) return;

  if (!commandExists(cmd) && message instanceof Message) {
    if (!aliases.has(cmd)) {
      if (await isLockedOut(message.author.id)) return;
      const customCommand = await getCommand(cmd);

      if (!customCommand) {
        return;
      }

      const content = customCommand.content;

      if ((await getDisabledCommands(message.guild)).indexOf("customcommand") != -1) {
        return message.channel.send({
          embeds: [new ErrorEmbed("custom commands have been disabled in this server")],
        });
      }

      const filter = await getChatFilter(message.guild);

      let contentToCheck: string | string[] = cleanString(content.toLowerCase().normalize("NFD"));

      contentToCheck = contentToCheck.split(" ");

      for (const word of filter) {
        if (contentToCheck.indexOf(word.toLowerCase()) != -1) {
          return message.channel.send({
            embeds: [new ErrorEmbed("this custom command is not allowed in this server")],
          });
        }
      }

      message.content += ` [custom cmd - ${customCommand.owner}]`;

      const ownerTag = await getLastKnownTag(customCommand.owner);
      await addUse(customCommand.owner);
      logCommand(message, ["", "", ""]);

      const embed = new CustomEmbed(message.member, content).setFooter({
        text: `${customCommand.uses.toLocaleString()} use${customCommand.uses == 1 ? "" : "s"}`,
      });

      if (ownerTag) {
        embed.setFooter({
          text: `by ${ownerTag} | ${customCommand.uses.toLocaleString()} use${customCommand.uses == 1 ? "" : "s"}`,
        });
      }

      return message.channel.send({ embeds: [embed] });
    }
  }

  logCommand(message, args);

  if (await isLockedOut(message.author.id)) {
    return verifyUser(message);
  }

  if (command.category == "money" || ["wholesome", "settings", "wordle"].includes(command.name)) {
    if (restarting || (await redis.get(Constants.redis.nypsi.RESTART)) == "t") {
      if (message.author.id == Constants.TEKOH_ID && message instanceof Message) {
        message.react("💀");
      } else {
        if (message instanceof Message) {
          return message.channel.send({
            embeds: [new CustomEmbed(message.member, "nypsi is rebooting, try again in a few minutes")],
          });
        } else {
          return message.reply({
            embeds: [new CustomEmbed(message.member, "nypsi is rebooting, try again in a few minutes")],
          });
        }
      }
    }

    if (await redis.get("nypsi:maintenance")) {
      if (message.author.id == Constants.TEKOH_ID && message instanceof Message) {
        message.react("💀");
      } else {
        if (message instanceof Message) {
          return message.channel.send({
            embeds: [
              new CustomEmbed(
                message.member,
                "fun & moderation commands are still available to you. maintenance mode only prevents certain commands"
              ).setTitle("⚠️ nypsi is under maintenance"),
            ],
          });
        } else {
          return message.reply({
            embeds: [
              new CustomEmbed(
                message.member,
                "fun & moderation commands are still available to you. maintenance mode only prevents certain commands"
              ).setTitle("⚠️ nypsi is under maintenance"),
            ],
          });
        }
      }
    }

    if (await isEcoBanned(message.author.id)) {
      const unbanTime = await getEcoBanTime(message.author.id);

      const embed = new CustomEmbed(
        message.member,
        `**you are banned from this command. dm me for help**\n\nyou'll be unbanned <t:${Math.floor(
          unbanTime.getTime() / 1000
        )}:R>`
      );

      if (message instanceof Message) {
        return message.channel.send({ embeds: [embed] }).then((m) => {
          setTimeout(() => {
            Promise.all([m.delete().catch(() => {}), message.delete().catch(() => {})]);
          }, 5000);
        });
      } else {
        return message.reply({ embeds: [embed], ephemeral: true });
      }
    } else if (await isHandcuffed(message.author.id)) {
      const init = parseInt(await redis.get(`economy:handcuffed:${message.author.id}`));
      const curr = new Date().getTime();
      const diff = Math.round((curr - init) / 1000);
      const time = 60 - diff;

      const minutes = Math.floor(time / 60);
      const seconds = time - minutes * 60;

      let remaining: string;

      if (minutes != 0) {
        remaining = `${minutes}m${seconds}s`;
      } else {
        remaining = `${seconds}s`;
      }

      if (message instanceof Message) {
        return message.channel.send({
          embeds: [new ErrorEmbed(`you have been handcuffed, they will be removed in **${remaining}**`)],
        });
      } else {
        return message.editReply({
          embeds: [new ErrorEmbed(`you have been handcuffed, they will be removed in **${remaining}**`)],
        });
      }
    }
  }

  if ((await getDisabledCommands(message.guild)).includes(command.name)) {
    if (message instanceof Message) {
      return message.channel.send({ embeds: [new ErrorEmbed("that command has been disabled")] });
    } else {
      return message.reply({ embeds: [new ErrorEmbed("that command has been disabled")] });
    }
  }

  command.run(message, args);

  setTimeout(async () => {
    const news = await getNews();

    if (news.text != "" && command.category == Categories.MONEY && !(await hasSeenNews(message.author.id))) {
      await redis.rpush(Constants.redis.nypsi.NEWS_SEEN, message.author.id);

      const pos = await hasSeenNews(message.author.id);

      const embed = new CustomEmbed(message.member, `${news.text}\n\n*${formatDate(news.date)}*`)
        .setHeader("news", message.author.avatarURL())
        .setFooter({ text: `you are #${pos} to see this` });

      if (message instanceof Message) {
        message.reply({ embeds: [embed] });
      } else {
        message.followUp({ embeds: [embed], ephemeral: true });
      }
      logger.info(`news shown to ${message.author.tag}`);
    }

    if (await redis.exists(`achievements:completed:${message.author.id}`)) {
      if (!(await userExists(message.member))) await createUser(message.member);
      const embed: APIEmbed = JSON.parse(await redis.get(`achievements:completed:${message.author.id}`));
      await redis.del(`achievements:completed:${message.author.id}`);

      if (message instanceof Message) {
        message.reply({ embeds: [embed] });
      } else {
        message.followUp({ embeds: [embed] });
      }
    }
  }, 2000);

  await Promise.all([
    a(message.author.id, message.author.tag, message.content),
    updateCommandUses(message.member),
    updateUser(message.author || message.member.user || null, command.name),
    redis.hincrby(Constants.redis.nypsi.TOP_COMMANDS, command.name, 1),
    redis.hincrby(Constants.redis.nypsi.TOP_COMMANDS_USER, message.author.tag, 1),
    redis.sadd(Constants.redis.nypsi.ACTIVE_USERS_ANALYTICS, message.author.id),
    redis.hincrby(Constants.redis.nypsi.TOP_COMMANDS_ANALYTICS, command.name, 1),
    addProgress(message.author.id, "nypsi", 1),
    commandGemCheck(message.member, command.category),
  ]);

  if (command.category == "money") {
    if (!message.member) return;

    setTimeout(async () => {
      if (!(await userExists(message.member))) return;
      try {
        if (!xpCooldown.has(message.author.id)) {
          await updateXp(message.member, (await getXp(message.member)) + 1);

          xpCooldown.add(message.author.id);

          setTimeout(() => {
            try {
              xpCooldown.delete(message.author.id);
            } catch {
              /* */
            }
          }, 60000);
        }
      } catch {
        /* */
      }
    }, 30000);
  }
}

export function commandExists(cmd: string) {
  if (commands.has(cmd)) {
    return true;
  } else {
    return false;
  }
}

function getCmdName(cmd: string): string {
  return commands.get(cmd).name;
}

function getCmdDesc(cmd: string): string {
  return commands.get(cmd).description;
}

function getCmdCategory(cmd: string): string {
  return commands.get(cmd).category;
}

export function getRandomCommand(): Command {
  const a: Command[] = [];

  commands.forEach((d) => {
    if (d.category != "none" && d.category != "nsfw") {
      a.push(d);
    }
  });

  const choice = a[Math.floor(Math.random() * a.length)];

  return choice;
}

export function logCommand(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  args.shift();

  let msg: string;

  if (!(message instanceof Message)) {
    msg = `${message.guild.id} - ${message.author.tag}: [/]${message.commandName} ${args.join(" ")}`;
  } else {
    let content = message.content;

    if (content.length > 100) {
      content = content.substr(0, 75) + "...";
    }

    msg = `${message.guild.id} - ${message.author.tag}: ${content}`;
  }

  logger.log({
    level: "cmd",
    message: msg,
  });
}

export function addHourlyCommand(member: GuildMember) {
  if (hourlyCommandCount.has(member.user.tag)) {
    hourlyCommandCount.set(member.user.tag, hourlyCommandCount.get(member.user.tag) + 1);
  } else {
    hourlyCommandCount.set(member.user.tag, 1);
  }
}

function updateCommandUses(member: GuildMember) {
  if (hourlyCommandCount.has(member.user.tag)) {
    hourlyCommandCount.set(member.user.tag, hourlyCommandCount.get(member.user.tag) + 1);
  } else {
    hourlyCommandCount.set(member.user.tag, 1);
  }

  if (karmaCooldown.has(member.user.id)) return;

  if (commandUses.has(member.user.id)) {
    commandUses.set(member.user.id, commandUses.get(member.user.id) + 1);
  } else {
    commandUses.set(member.user.id, 1);
  }

  karmaCooldown.add(member.user.id);

  setTimeout(() => {
    try {
      karmaCooldown.delete(member.user.id);
    } catch {
      karmaCooldown.clear();
    }
  }, 90000);
}

export function runCommandUseTimers(client: NypsiClient) {
  const postCommandUsers = async () => {
    const hook = new WebhookClient({
      url: process.env.ANTICHEAT_HOOK,
    });

    for (const tag of hourlyCommandCount.keys()) {
      const uses = hourlyCommandCount.get(tag);

      if (uses > 500) {
        const res = await client.cluster.broadcastEval(
          (c, { tag }) => {
            const foundUser = c.users.cache.find((u) => `${u.username}#${u.discriminator}` == tag);

            if (foundUser) {
              return foundUser.id;
            }
          },
          { context: { tag: tag } }
        );

        const id = res.find((x) => typeof x === "string");

        await hook.send(
          `[${getTimestamp()}] **${tag}** (${
            typeof id === "string" ? `${id}` : "invalid id"
          }) performed **${uses}** commands in an hour`
        );

        if (uses > 600 && typeof id === "string") {
          const lastCommand = await getLastCommand(id);

          if (dayjs().subtract(30, "seconds").unix() * 1000 > lastCommand.getTime()) continue; // dont lock if last command was more than 5 minutes ago

          toggleLock(id);
          logger.info(`${tag} (${id}) has been given a captcha`);
          await hook.send(`[${getTimestamp()}] **${tag}** (${id}) has been given a captcha`);
        }
      }
    }
    hourlyCommandCount.clear();
    return;
  };

  const updateKarma = async () => {
    for (const user of commandUses.keys()) {
      let modifier = 3;

      if ((await getKarma(user)) > 300) modifier = 2.5;
      if ((await getKarma(user)) > 400) modifier = 3;
      if ((await getKarma(user)) > 500) modifier = 3.5;
      if ((await getKarma(user)) > 1000) modifier = 7;

      const amount = Math.floor(commandUses.get(user) / modifier);

      if (amount > 0 && !(await isEcoBanned(user))) {
        await addKarma(user, amount);
      }
    }

    commandUses.clear();
  };

  setTimeout(async () => {
    setInterval(async () => {
      await postCommandUsers();
      setTimeout(updateKarma, 60000);
    }, 3600000);
    await postCommandUsers();
    setTimeout(updateKarma, 60000);
  }, 3600000);
}

export function startRestart() {
  restarting = true;
}

export async function uploadSlashCommandsToGuild(guildID: string, clientID: string) {
  logger.info("started refresh of [/] commands...");
  const rest = new REST({ version: "9" }).setToken(process.env.BOT_TOKEN);

  const slashData = [];

  for (const cmd of Array.from(commands.values())) {
    if (!cmd.slashEnabled) continue;
    slashData.push(cmd.slashData.toJSON());
  }

  try {
    logger.info(`uploading ${slashData.length} [/] commands`);
    await rest.put(Routes.applicationGuildCommands(clientID, guildID), { body: slashData });

    logger.info("finished refresh of [/] commands");
  } catch (error) {
    logger.error("failed refresh of [/] commands");
    logger.error(error);
  }
}

export async function uploadSlashCommands(clientID: string) {
  logger.info("started refresh of global [/] commands...");
  const rest = new REST({ version: "9" }).setToken(process.env.BOT_TOKEN);

  const slashData = [];

  for (const cmd of Array.from(commands.values())) {
    if (!cmd.slashEnabled) continue;
    slashData.push(cmd.slashData.toJSON());
  }

  try {
    logger.info(`uploading ${slashData.length} [/] commands`);
    await rest.put(Routes.applicationCommands(clientID), { body: slashData });

    logger.info("finished refresh of global [/] commands");
  } catch (error) {
    logger.error("failed refresh of global [/] commands");
    logger.error(error);
  }
}

export async function deleteSlashCommandsFromGuild(guildID: string, clientID: string) {
  logger.info("started deletion of [/] commands...");
  const rest = new REST({ version: "9" }).setToken(process.env.BOT_TOKEN);

  try {
    await rest.put(Routes.applicationGuildCommands(clientID, guildID), { body: [] });

    logger.info("finished deletion of [/] commands");
  } catch (error) {
    logger.error("failed deletion of [/] commands");
    logger.error(error);
  }
}

export async function deleteSlashCommands(clientID: string) {
  logger.info("started refresh of global [/] commands...");
  const rest = new REST({ version: "9" }).setToken(process.env.BOT_TOKEN);

  try {
    await rest.put(Routes.applicationCommands(clientID), { body: [] });

    logger.info("finished deletion of global [/] commands");
  } catch (error) {
    logger.error("failed deletion of global [/] commands");
    logger.error(error);
  }
}

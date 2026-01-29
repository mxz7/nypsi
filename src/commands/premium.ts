import { ColorResolvable, CommandInteraction } from "discord.js";
import { readFile } from "fs/promises";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { daysAgo, daysUntil, formatDate } from "../utils/functions/date";
import { getRawLevel } from "../utils/functions/economy/levelling";
import { getTagsData, userExists } from "../utils/functions/economy/utils";
import { getAllMembers } from "../utils/functions/guilds/members";
import { getPrefix } from "../utils/functions/guilds/utils";
import PageManager from "../utils/functions/page";
import { addUserAlias, getUserAliases, removeUserAlias } from "../utils/functions/premium/aliases";
import { isBooster, setBooster } from "../utils/functions/premium/boosters";
import { getEmbedColor, setEmbedColor } from "../utils/functions/premium/color";
import { getCommand, getUserCommand, setCommand } from "../utils/functions/premium/command";
import {
  addMember,
  expireUser,
  getCredits,
  getPremiumProfile,
  getTier,
  isPremium,
  levelString,
  renewUser,
  setCredits,
  setTier,
} from "../utils/functions/premium/premium";
import sleep from "../utils/functions/sleep";
import { cleanString, pluralize } from "../utils/functions/string";
import { getTotalSpend } from "../utils/functions/users/email";
import { addTag, getActiveTag, getTags, removeTag } from "../utils/functions/users/tags";
import {
  commandAliasExists,
  commandExists,
  getCommandFromAlias,
} from "../utils/handlers/commandhandler";
import { logger } from "../utils/logger";
import dayjs = require("dayjs");
import ms = require("ms");

let doingRoles = false;

const commandFilter = [
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "nig",
  "ugly",
  "discordgg",
  "discordcom",
  "discordappcom",
  "gay",
  "tranny",
  "cracker",
  "chink",
  "pornhub",
  "porn",
  "xvideos",
  "xhamster",
  "redtube",
  "grabify",
  "bitly",
];

const cmd = new Command("premium", "view your premium status", "info")
  .setAliases(["patreon", "donate", "prem", "kofi"])
  .setDocs("https://nypsi.xyz/docs/premium?ref=bot-help");

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((view) => view.setName("view").setDescription("view your premium status"))
  .addSubcommand((color) =>
    color
      .setName("color")
      .setDescription("set your custom color")
      .addStringOption((option) =>
        option
          .setName("color")
          .setDescription("color you want to be used on all messages (hex format)")
          .setRequired(true),
      ),
  )
  .addSubcommandGroup((mycmd) =>
    mycmd
      .setName("mycmd")
      .setDescription("create a custom command (gold+)")
      .addSubcommand((view) => view.setName("view").setDescription("view your custom command"))
      .addSubcommand((update) =>
        update
          .setName("update")
          .setDescription("update your custom command")
          .addStringOption((option) =>
            option.setName("trigger").setDescription("trigger for your command").setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName("value")
              .setDescription("set the content for your custom command")
              .setRequired(true),
          ),
      ),
  )
  .addSubcommandGroup((aliases) =>
    aliases
      .setName("alias")
      .setDescription("manage your custom aliases")
      .addSubcommand((list) => list.setName("list").setDescription("list your aliases"))
      .addSubcommand((add) =>
        add
          .setName("add")
          .setDescription("create a custom alias")
          .addStringOption((option) =>
            option
              .setName("alias")
              .setDescription("alias for your command")
              .setRequired(true)
              .setMaxLength(15),
          )
          .addStringOption((option) =>
            option
              .setName("command")
              .setDescription("command you would like to run when doing your alias")
              .setRequired(true)
              .setMaxLength(50),
          ),
      )
      .addSubcommand((del) =>
        del
          .setName("del")
          .setDescription("delete a custom alias")
          .addStringOption((option) =>
            option
              .setName("alias")
              .setDescription("alias for your command")
              .setAutocomplete(true)
              .setRequired(true)
              .setMaxLength(40),
          ),
      ),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  const checkRoles = async () => {
    if (doingRoles) return;
    if (message.guildId !== Constants.NYPSI_SERVER_ID) return;
    doingRoles = true;

    setTimeout(() => {
      doingRoles = false;
    }, ms("1 hour"));

    const members = await getAllMembers(message.guild, true);

    const buffers: Record<string, Buffer<ArrayBufferLike>> = {};

    for (const guildMember of members.values()) {
      if (!(await userExists(guildMember))) continue;

      const level = await getRawLevel(guildMember);
      const tags = await getTags(guildMember);

      if (level >= 99) {
        for (let i = 1; i <= 5; i++) {
          if (
            guildMember.joinedTimestamp < Date.now() - ms(`${i} year`) &&
            !tags.some((tag) => tag.tagId === `year${i}`)
          ) {
            logger.info(`premium: adding year${i} to ${guildMember.user.id}`);
            await addTag(guildMember, `year${i}`);
          } else if (
            guildMember.joinedTimestamp > Date.now() - ms(`${i} year`) &&
            tags.some((i) => i.tagId === `year${i}`)
          ) {
            logger.info(`premium: removing year${i} from ${guildMember.user.id}`);
            await removeTag(guildMember, `year${i}`);
          }
        }
      } else if (tags.some((i) => i.tagId.includes("year"))) {
        for (const tag of tags) {
          if (tag.tagId.includes("year")) {
            logger.info(`premium: removing ${tag.tagId} from ${guildMember.user.id}`);
            await removeTag(tag.userId, tag.tagId);
          }
        }
      }

      if (guildMember.user.id === Constants.OWNER_ID) continue; // no roles for me teehee

      const roleIds = Array.from(guildMember.roles.cache.keys());

      if (roleIds.includes(Constants.BOOST_ROLE_ID)) {
        if (!(await isBooster(guildMember))) await setBooster(guildMember, true).catch(() => {});
      } else if (await isBooster(guildMember)) {
        logger.info(`premium: removing ${guildMember.user.id} booster stat`);
        await setBooster(guildMember, false);
      }

      if (!(await isPremium(guildMember))) {
        if (roleIds.includes(Constants.PLATINUM_ROLE_ID)) {
          logger.info(`premium: removing plat role ${guildMember.user.id}`);
          await sleep(250);
          await guildMember.roles.remove(Constants.PLATINUM_ROLE_ID);
        }

        if (roleIds.includes(Constants.GOLD_ROLE_ID)) {
          logger.info(`premium: removing gold role ${guildMember.user.id}`);
          await sleep(250);
          await guildMember.roles.remove(Constants.GOLD_ROLE_ID);
        }

        if (roleIds.includes(Constants.SILVER_ROLE_ID)) {
          logger.info(`premium: removing silver role ${guildMember.user.id}`);
          await sleep(250);
          await guildMember.roles.remove(Constants.SILVER_ROLE_ID);
        }

        if (roleIds.includes(Constants.BRONZE_ROLE_ID)) {
          logger.info(`premium: removing bronze role ${guildMember.user.id}`);
          await sleep(250);
          await guildMember.roles.remove(Constants.BRONZE_ROLE_ID);
        }

        if (guildMember.roles.cache.find((i) => i.name === "custom")) {
          logger.info(`premium: removing custom role ${guildMember.user.id}`);
          const role = guildMember.roles.cache.find((i) => i.name === "custom");

          await sleep(250);
          await guildMember.roles.remove(role);
          if (role.members.size === 0) await role.delete();
        }
      }

      let requiredRole = "none";
      switch (await getTier(guildMember)) {
        case 1:
          requiredRole = Constants.BRONZE_ROLE_ID;
          break;
        case 2:
          requiredRole = Constants.SILVER_ROLE_ID;
          break;
        case 3:
          requiredRole = Constants.GOLD_ROLE_ID;
          break;
        case 4:
          requiredRole = Constants.PLATINUM_ROLE_ID;
          break;
      }

      if (requiredRole != "none" && !roleIds.includes(requiredRole)) {
        logger.info(`premium: adding ${requiredRole} to ${guildMember.user.id}`);
        await sleep(250);
        await guildMember.roles.add(requiredRole);
      }

      for (const role of guildMember.roles.cache.values()) {
        let requiredLevel = 0;
        switch (role.id) {
          case Constants.PLATINUM_ROLE_ID:
            requiredLevel = 4;
            break;
          case Constants.GOLD_ROLE_ID:
            requiredLevel = 3;
            break;
          case Constants.SILVER_ROLE_ID:
            requiredLevel = 2;
            break;
          case Constants.BRONZE_ROLE_ID:
            requiredLevel = 1;
            break;
        }

        if (requiredLevel !== 0) {
          if ((await getTier(guildMember)) != requiredLevel) {
            logger.info(`premium: removing ${role.id} from ${guildMember.user.id}`);
            await sleep(250);
            await guildMember.roles.remove(role.id);
          }
        }
      }

      const totalSpend = await getTotalSpend(guildMember);

      if (guildMember.roles.cache.has(Constants.HIGHROLLER_ROLE)) {
        if (totalSpend < Constants.HIGHROLLER_REQUIREMENT) {
          if ((await getTags(guildMember)).find((i) => i.tagId === "highroller")) {
            logger.info(`premium: removing highroller tag from ${guildMember.user.id}`);
            await removeTag(guildMember, "highroller");
          }
          logger.info(`premium: removing highroller role from ${guildMember.user.id}`);
          await sleep(250);
          await guildMember.roles.remove(Constants.HIGHROLLER_ROLE);
        }
      } else {
        if (totalSpend >= Constants.HIGHROLLER_REQUIREMENT) {
          if (!(await getTags(guildMember)).find((i) => i.tagId === "highroller")) {
            logger.info(`premium: adding highroller tag to ${guildMember.user.id}`);
            await addTag(guildMember, "highroller");
          }
          logger.info(`premium: adding highroller role to ${guildMember.user.id}`);
          await sleep(250);
          await guildMember.roles.add(Constants.HIGHROLLER_ROLE);
          if (guildMember.roles.cache.has(Constants.SUPPORTER_ROLE)) {
            logger.info(`premium: removing supporter role from ${guildMember.user.id}`);
            await sleep(250);
            await guildMember.roles.remove(Constants.SUPPORTER_ROLE);
          }
        }
      }

      if (guildMember.roles.cache.has(Constants.SUPPORTER_ROLE) && totalSpend <= 0) {
        logger.info(`premium: removing supporter role from ${guildMember.user.id}`);
        await sleep(250);
        await guildMember.roles.remove(Constants.SUPPORTER_ROLE);
      } else if (
        totalSpend > 0 &&
        !guildMember.roles.cache.has(Constants.HIGHROLLER_ROLE) &&
        !guildMember.roles.cache.has(Constants.SUPPORTER_ROLE)
      ) {
        logger.info(`premium: adding supporter role to ${guildMember.user.id}`);
        await sleep(250);
        await guildMember.roles.add(Constants.SUPPORTER_ROLE);
      }

      const colour = await getEmbedColor(guildMember);

      if (colour === "default") {
        const role = guildMember.roles.cache.find((i) => i.name === "custom");

        if (role) {
          await sleep(250);
          if (role.members.size === 1) {
            logger.info(`premium: removing custom role from ${guildMember.user.id}`);
            await guildMember.guild.roles.delete(role.id);
          } else {
            logger.info(`premium: removing custom role from ${guildMember.user.id}`);
            await guildMember.roles.remove(
              guildMember.roles.cache.find((i) => i.name === "custom"),
            );
          }
        }
      } else if (!guildMember.roles.cache.find((i) => i.name === "custom")) {
        await sleep(250);

        const separatorRole = guildMember.guild.roles.cache.get("1329425677614845972");

        logger.info(`premium: adding custom role to ${guildMember.user.id}`);

        const tag = await getActiveTag(guildMember);
        const tagEmoji = tag ? getTagsData()[tag.tagId].emoji : null;
        const isTagUnicode = Constants.EMOJI_REGEX.test(tagEmoji || "");
        let emojiBuffer: Buffer<ArrayBufferLike>;

        if (tagEmoji && !isTagUnicode) {
          emojiBuffer = buffers[tagEmoji];

          if (!emojiBuffer) {
            emojiBuffer = await readFile(`data/emojis/${getTagsData()[tag.tagId].image}`);
            buffers[tagEmoji] = emojiBuffer;
          }
        }

        const role = await guildMember.guild.roles.create({
          name: "custom",
          color: colour,
          position: separatorRole.position + 1,
          permissions: [],
          unicodeEmoji: tagEmoji && isTagUnicode ? tagEmoji : undefined,
          icon: tagEmoji && !isTagUnicode ? emojiBuffer : undefined,
        });

        await guildMember.roles.add(role);
      } else {
        const role = guildMember.roles.cache.find((i) => i.name === "custom");

        if (role.hexColor !== colour) {
          await sleep(250);
          await guildMember.guild.roles.edit(role, { color: colour });
        }
      }
    }

    for (const role of message.guild.roles.cache
      .filter((i) => i.name === "custom" && i.members.size === 0)
      .values()) {
      await sleep(250);
      await role.delete("no members");
    }

    doingRoles = false;
  };

  const defaultMessage = async () => {
    if (message.guild.id == Constants.NYPSI_SERVER_ID) {
      checkRoles();
    }

    if (await isPremium(message.member)) {
      const embed = new CustomEmbed(message.member);

      embed.setHeader("premium status", message.author.avatarURL());

      const [profile, aliases] = await Promise.all([
        getPremiumProfile(message.member),
        getUserAliases(message.member),
      ]);

      const expire = dayjs(profile.expireDate)
        .add(1, "day")
        .set("hours", 0)
        .set("minutes", 0)
        .set("seconds", 0)
        .subtract(15, "minutes");

      let expiresText = `<t:${expire.unix()}> (<t:${expire.unix()}:R>)`;

      if (expire.isBefore(dayjs())) {
        expiresText = expiresText.split(">")[0] + "> (using credits)";
      }

      let description =
        `**tier** ${levelString(profile.level)}` +
        `\n**booster** ${await isBooster(message.member)}` +
        `\n**started** <t:${Math.floor(profile.startDate.getTime() / 1000)}> (<t:${Math.floor(
          profile.startDate.getTime() / 1000,
        )}:R>)` +
        `\n**expires** ${expiresText}` +
        `\n**credit** ${profile.credit}` +
        `\n\n**color** ${profile.embedColor} - /premium color` +
        `\n**aliases** ${aliases.length.toLocaleString()}`;

      if (profile.level > 2) {
        const cmd = await getUserCommand(message.member);
        description += `\n**custom command** ${cmd ? cmd.trigger : "none"}`;
      }

      if (profile.level < 4) {
        description += "\n\nyou can upgrade your tier at [ko-fi](https://ko-fi.com/nypsi/tiers)";
      }

      embed.setDescription(description);
      embed.setFooter({ text: "thank you so much for supporting!" });

      return send({ embeds: [embed] });
    } else if (await isBooster(message.member)) {
      const embed = new CustomEmbed(
        message.member,
        "you are currently boosting the nypsi server!! thank you, your booster rewards are separate from premium, meaning that they can stack together.\n\nyou currently have no premium membership, this is what helps keep nypsi running. i (max) am massively grateful for any donations :heart:",
      );

      embed.addField(
        "payment methods",
        "[ko-fi](https://ko-fi.com/nypsi/tiers)\n\n" +
          `if you'd like to pay another way (crypto, paypal, etc) join the [support server](${Constants.NYPSI_SERVER_INVITE_LINK})\nif you are just looking to buy crates, you can do so from the [nypsi shop](https://ko-fi.com/U7U4AEDXM/shop)`,
      );

      return send({ embeds: [embed] });
    } else {
      const embed = new CustomEmbed(
        message.member,
        "you currently have no premium membership, this is what helps keep nypsi running. i (max) am massively grateful for any donations :heart:",
      );

      embed.addField(
        "payment methods",
        "[ko-fi](https://ko-fi.com/nypsi/tiers)\n\n" +
          `if you'd like to pay another way (crypto, paypal, etc) join the [support server](${Constants.NYPSI_SERVER_INVITE_LINK})\nif you are just looking to buy crates, you can do so from the [nypsi shop](https://ko-fi.com/U7U4AEDXM/shop)`,
      );

      return send({ embeds: [embed] });
    }
  };

  const setColor = async () => {
    if (!(await isPremium(message.member))) {
      return send({
        embeds: [new ErrorEmbed("you must be **BRONZE** tier to set a custom color")],
      });
    }

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed("/premium color <#color>")] });
    }

    let color = args[1].split("#").join("");

    if (color.toLowerCase() == "reset") color = "default";

    if (color.length > 6 && color != "default") {
      color = color.substring(0, 6);
    }

    if (!color.startsWith("#") && color != "default") color = `#${color}`;

    if (!color.match(Constants.COLOUR_REGEX) && color !== "default")
      return send({ embeds: [new ErrorEmbed("invalid hex color code. example: #abcdef")] });

    const embed = new CustomEmbed();

    try {
      if (color != "default") {
        embed.setColor(color as ColorResolvable);
      }
    } catch {
      return send({
        embeds: [new ErrorEmbed("invalid color, please use a hex color")],
      });
    }

    await setEmbedColor(message.member, color.toLowerCase());

    if (message.guildId === Constants.NYPSI_SERVER_ID) {
      const existingRole = message.member.roles.cache.find((i) => i.name === "custom");

      const tag = await getActiveTag(message.member);
      const tagEmoji = tag ? getTagsData()[tag.tagId].emoji : null;
      const isTagUnicode = Constants.EMOJI_REGEX.test(tagEmoji || "");
      let emojiBuffer: Buffer<ArrayBufferLike>;

      if (tagEmoji && !isTagUnicode) {
        emojiBuffer = await readFile(`data/emojis/${getTagsData()[tag.tagId].image}`);
      }

      if (existingRole) {
        if (color !== "default") {
          await existingRole.edit({ color: color as ColorResolvable });

          if (tagEmoji) {
            if (isTagUnicode) {
              await existingRole.setUnicodeEmoji(tagEmoji);
              await existingRole.setIcon(null);
            } else {
              await existingRole.setUnicodeEmoji(null);
              await existingRole.setIcon(emojiBuffer);
            }
          }
        } else {
          await message.member.roles.remove(existingRole);
        }
      } else {
        const seperatorRole = message.guild.roles.cache.get("1329425677614845972");

        const newRole = await message.guild.roles.create({
          name: "custom",
          color: color as ColorResolvable,
          position: seperatorRole.position + 1,
          permissions: [],
          unicodeEmoji: tagEmoji && isTagUnicode ? tagEmoji : undefined,
          icon: tagEmoji && !isTagUnicode ? emojiBuffer : undefined,
        });

        await message.member.roles.add(newRole);
      }
    }

    embed.setDescription(
      `your color has been updated to **${await getEmbedColor(message.member)}**`,
    );

    return send({
      embeds: [embed],
    });
  };

  const doCustomCommand = async () => {
    if ((await getTier(message.member)) < 3) {
      return send({
        embeds: [new ErrorEmbed("you must be **GOLD** tier to create a custom command")],
      });
    }
    if (!(message instanceof CommandInteraction)) {
      return send({ embeds: [new ErrorEmbed("you must use /premium mycmd for this")] });
    }
    if (!message.isChatInputCommand()) return;

    if (args[1].toLowerCase() === "view") {
      const cmd = await getUserCommand(message.member);

      const embed = new CustomEmbed(message.member);

      if (cmd) {
        if (cmd.content) {
          embed.addField("content", cmd.content, true);
          embed.addField("trigger", cmd.trigger, true);
          embed.addField("uses", cmd.uses ? cmd.uses.toLocaleString() : "0", true);
        } else {
          embed.setDescription("you don't have a custom command");
        }
      } else {
        embed.setDescription("you don't have a custom command");
      }

      return send({ embeds: [embed] });
    } else {
      const commandTrigger = cleanString(
        message.options.getString("trigger").toLowerCase().normalize("NFD"),
      ).trim();
      const commandContent = message.options.getString("value").normalize("NFD").trim();

      if (commandTrigger.length === 0 || commandContent.length === 0) {
        return send({ embeds: [new ErrorEmbed("content or trigger cannot be empty")] });
      }

      for (const word of commandFilter) {
        if (commandContent.includes(word) || commandTrigger.includes(word)) {
          return send({ embeds: [new ErrorEmbed("explicit content 🙄")] });
        }
      }

      if (commandContent.match(/^#+\s/gm)) {
        return send({ embeds: [new ErrorEmbed("spammy content 🙄")] });
      }

      if (commandExists(commandTrigger) || commandAliasExists(commandTrigger))
        return send({ embeds: [new ErrorEmbed("this is already a nypsi command")] });

      const cmd = await getCommand(commandTrigger);

      if (cmd && cmd.owner !== message.author.id)
        return send({ embeds: [new ErrorEmbed("this custom command already exists")] });

      await setCommand(message.member, commandTrigger, commandContent);

      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            "✅ your command has been updated\n\n" +
              "please note that if your custom command is used **abusively** or contains **explicit or spammy content**, your command will be removed and your premium could be revoked with **zero** compensation",
          ),
        ],
      });
    }
  };

  const doAliases = async () => {
    if ((await getTier(message.member)) < 1) {
      return send({
        embeds: [new ErrorEmbed("you must be **BRONZE** tier to create a custom alias")],
      });
    }
    if (!(message instanceof CommandInteraction)) {
      return send({ embeds: [new ErrorEmbed("you must use /premium alias for this")] });
    }

    if (!message.isChatInputCommand()) return;

    const aliases = await getUserAliases(message.member);

    const prefix = (await getPrefix(message.guild))[0];

    if (args[1].toLowerCase() === "list") {
      if (aliases.length === 0) return send({ embeds: [new ErrorEmbed("you have no aliases")] });
      const pages = PageManager.createPages(
        aliases.map((i) => `\`${prefix}${i.alias}\` -> \`${prefix}${i.command}\``),
      );

      const embed = new CustomEmbed(message.member, pages.get(1).join("\n"));

      if (pages.size === 1) {
        return await send({ embeds: [embed] });
      }

      const row = PageManager.defaultRow();

      const msg = await send({ embeds: [embed], components: [row] });

      const manager = new PageManager({
        embed,
        message: msg,
        row,
        userId: message.author.id,
        pages,
      });

      return manager.listen();
    } else if (args[1].toLowerCase() === "add") {
      let max = 3;

      const tier = await getTier(message.member);

      for (let i = 0; i < tier; i++) {
        max *= 1.75;
        if (i === 3) max *= 2;
      }

      max = Math.floor(max);

      if (aliases.length >= max) {
        return send({
          embeds: [new ErrorEmbed(`you have reached your limit of custom aliases (${max})`)],
        });
      }

      const trigger = cleanString(
        message.options.getString("alias").toLowerCase().normalize("NFD").split(" ")[0],
      );

      if (commandExists(trigger) || commandAliasExists(trigger)) {
        return send({ embeds: [new ErrorEmbed("this command already exists")] });
      }

      let command = message.options
        .getString("command")
        .toLowerCase()
        .replace(/[^a-z0-9.\s]/g, "")
        .replace(/^(\S+)/, (firstWord) => firstWord.replace(/\./g, ""))
        .normalize("NFD");

      for (const word of commandFilter) {
        if (trigger.includes(word) || command.toLowerCase().includes(word)) {
          return send({ embeds: [new ErrorEmbed("explicit content 🙄")] });
        }
      }

      if (aliases.find((i) => i.alias === trigger))
        return send({ embeds: [new ErrorEmbed("you already have this alias set")] });

      const commandName = command.split(" ")[0];

      if (!commandExists(commandName)) {
        if (commandAliasExists(commandName)) {
          command = command.replace(commandName, getCommandFromAlias(commandName));
        } else
          return send({
            embeds: [new ErrorEmbed(`\`${commandName}\` is not a command`)],
          });
      }

      await addUserAlias(message.member, trigger, command);

      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            `✅ added \`${prefix}${trigger}\` -> \`${prefix}${command}\``,
          ),
        ],
      });
    } else if (args[1].toLowerCase() === "del") {
      const trigger = cleanString(
        message.options.getString("alias").toLowerCase().normalize("NFD").split(" ")[0],
      );
      const foundAlias = aliases.find((i) => i.alias === trigger);

      if (!foundAlias) {
        return send({ embeds: [new ErrorEmbed(`couldnt find alias \`${prefix}${trigger}\``)] });
      }

      await removeUserAlias(message.member, trigger);

      return send({
        embeds: [new CustomEmbed(message.member, `✅ removed \`${prefix}${trigger}\``)],
      });
    }
  };

  if (args.length == 0 || args[0].toLowerCase() == "view") {
    return defaultMessage();
  } else if (args[0].toLowerCase() == "check" || args[0].toLowerCase() == "status") {
    if (message.author.id != Constants.OWNER_ID) {
      return defaultMessage();
    }

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed("invalid syntax bro")] });
    }

    const user = await message.client.users.fetch(args[1]);

    if (!user) return send({ embeds: [new ErrorEmbed("user doesnt exist")] });

    if (await isPremium(user)) {
      const embed = new CustomEmbed(message.member);

      embed.setHeader(`premium status of ${user.id}`);

      const profile = await getPremiumProfile(user);

      const timeStarted = formatDate(profile.startDate);
      const timeAgo = daysAgo(profile.startDate);
      const expires = formatDate(profile.expireDate);
      const timeUntil = daysUntil(profile.expireDate);

      let description = `**tier** ${levelString(
        profile.level,
      )}\n**started** ${timeStarted} (${timeAgo} ${pluralize("day", timeAgo)} ago)\n**expires** ${expires} (${timeUntil} ${pluralize("day", timeUntil)} left)\n**credit** ${
        profile.credit
      }`;

      if (profile.level > 2) {
        const cmd = await getUserCommand(user);
        description += `\n**custom command** ${cmd ? cmd.content : "none"}`;
      }

      embed.setDescription(description);

      return send({ embeds: [embed] });
    } else {
      const embed = new CustomEmbed(message.member, "no premium membership");

      return send({ embeds: [embed] });
    }
  } else if (args[0].toLowerCase() == "update") {
    if (message.author.id != Constants.OWNER_ID) {
      return defaultMessage();
    }

    if (args.length < 4) {
      return send({ embeds: [new ErrorEmbed("invalid syntax bro")] });
    }

    if (!(await isPremium(args[2]))) {
      return send({
        embeds: [
          new ErrorEmbed(
            "this user does not have a profile, use $premium add dumbass check it before u update it",
          ),
        ],
      });
    }

    switch (args[1].toLowerCase()) {
      case "level":
        await setTier(args[2], parseInt(args[3]));
        return send({
          embeds: [new CustomEmbed(message.member, `✅ tier changed to ${args[3]}`)],
        });
      case "embed":
        await setEmbedColor(args[2], args[3]);
        return send({
          embeds: [new CustomEmbed(message.member, `✅ embed color changed to ${args[3]}`)],
        });
      case "setcreds":
        await setCredits(args[2], parseInt(args[3]));
        return send({
          embeds: [new CustomEmbed(message.member, `✅ credits: ${await getCredits(args[2])}`)],
        });
    }
  } else if (args[0].toLowerCase() == "add") {
    if (message.author.id != Constants.OWNER_ID) {
      return defaultMessage();
    }

    if (args.length < 3) {
      return send({ embeds: [new ErrorEmbed("invalid syntax bro")] });
    }

    await addMember(args[1], parseInt(args[2]));

    return send({
      embeds: [new CustomEmbed(message.member, "✅ created profile at tier " + args[2])],
    });
  } else if (args[0].toLowerCase() == "renew") {
    if (message.author.id != Constants.OWNER_ID) {
      return defaultMessage();
    }

    if (args.length != 2) {
      return send({ embeds: [new ErrorEmbed("invalid syntax bro")] });
    }

    await renewUser(args[1]);

    return send({ embeds: [new CustomEmbed(message.member, "✅ membership renewed")] });
  } else if (args[0].toLowerCase() == "expire") {
    if (message.author.id != Constants.OWNER_ID) {
      return defaultMessage();
    }

    if (args.length != 2) {
      return send({ embeds: [new ErrorEmbed("invalid syntax bro")] });
    }

    await expireUser(args[1], message.client as NypsiClient);

    return send({ embeds: [new CustomEmbed(message.member, "✅ membership expired")] });
  } else if (args[0].toLowerCase() == "color") {
    return setColor();
  } else if (args[0].toLowerCase() === "mycmd") {
    return doCustomCommand();
  } else if (args[0].toLowerCase() === "alias") {
    return doAliases();
  }
}

cmd.setRun(run);

module.exports = cmd;

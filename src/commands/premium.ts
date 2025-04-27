import {
  BaseMessageOptions,
  ColorResolvable,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { daysAgo, daysUntil, formatDate } from "../utils/functions/date";
import { getPrefix } from "../utils/functions/guilds/utils";
import PageManager from "../utils/functions/page";
import { addUserAlias, getUserAliases, removeUserAlias } from "../utils/functions/premium/aliases";
import { isBooster, setBooster } from "../utils/functions/premium/boosters";
import { getEmbedColor, setEmbedColor } from "../utils/functions/premium/color";
import { getCommand, getUserCommand, setCommand } from "../utils/functions/premium/command";
import {
  addMember,
  getCredits,
  getPremiumProfile,
  getTier,
  isPremium,
  levelString,
  renewUser,
  setCredits,
  setExpireDate,
  setTier,
} from "../utils/functions/premium/premium";
import sleep from "../utils/functions/sleep";
import { cleanString } from "../utils/functions/string";
import { getTotalSpend } from "../utils/functions/users/email";
import { addTag, getTags, removeTag } from "../utils/functions/users/tags";
import { commandExists } from "../utils/handlers/commandhandler";
import dayjs = require("dayjs");

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
  .setDocs("https://nypsi.xyz/docs/premium");

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

  const checkRoles = async () => {
    if (doingRoles) return;
    if (message.guildId !== Constants.NYPSI_SERVER_ID) return;
    doingRoles = true;

    let members = await message.guild.members.fetch();

    if (members.size !== message.guild.memberCount) members = await message.guild.members.fetch();

    for (const guildMember of members.values()) {
      if (guildMember.user.id === Constants.TEKOH_ID) continue; // no roles for me teehee
      const roleIds = Array.from(guildMember.roles.cache.keys());

      if (roleIds.includes(Constants.BOOST_ROLE_ID)) {
        if (!(await isBooster(guildMember.user.id)))
          await setBooster(guildMember.user.id, true).catch(() => {});
      } else if (await isBooster(guildMember.user.id)) {
        await setBooster(guildMember.user.id, false);
      }

      if (!(await isPremium(guildMember))) {
        if (roleIds.includes(Constants.PLATINUM_ROLE_ID)) {
          await sleep(250);
          await guildMember.roles.remove(Constants.PLATINUM_ROLE_ID);
        }

        if (roleIds.includes(Constants.GOLD_ROLE_ID)) {
          await sleep(250);
          await guildMember.roles.remove(Constants.GOLD_ROLE_ID);
        }

        if (roleIds.includes(Constants.SILVER_ROLE_ID)) {
          await sleep(250);
          await guildMember.roles.remove(Constants.SILVER_ROLE_ID);
        }

        if (roleIds.includes(Constants.BRONZE_ROLE_ID)) {
          await sleep(250);
          await guildMember.roles.remove(Constants.BRONZE_ROLE_ID);
        }

        if (guildMember.roles.cache.find((i) => i.name === "custom")) {
          await sleep(250);
          await guildMember.roles.remove(guildMember.roles.cache.find((i) => i.name === "custom"));
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
            await sleep(250);
            await guildMember.roles.remove(role.id);
          }
        }
      }

      const totalSpend = await getTotalSpend(guildMember.id);

      if (guildMember.roles.cache.has(Constants.HIGHROLLER_ROLE)) {
        if (totalSpend < Constants.HIGHROLLER_REQUIREMENT) {
          if ((await getTags(guildMember.id)).find((i) => i.tagId === "highroller"))
            await removeTag(guildMember.id, "highroller");
          await sleep(250);
          await guildMember.roles.remove(Constants.HIGHROLLER_ROLE);
        }
      } else {
        if (totalSpend >= Constants.HIGHROLLER_REQUIREMENT) {
          if (!(await getTags(guildMember.id)).find((i) => i.tagId === "highroller"))
            await addTag(guildMember.id, "highroller");
          await sleep(250);
          await guildMember.roles.add(Constants.HIGHROLLER_ROLE);
          if (guildMember.roles.cache.has(Constants.SUPPORTER_ROLE)) {
            await sleep(250);
            await guildMember.roles.remove(Constants.SUPPORTER_ROLE);
          }
        }
      }

      if (guildMember.roles.cache.has(Constants.SUPPORTER_ROLE) && totalSpend <= 0) {
        await sleep(250);
        await guildMember.roles.remove(Constants.SUPPORTER_ROLE);
      } else if (
        totalSpend > 0 &&
        !guildMember.roles.cache.has(Constants.HIGHROLLER_ROLE) &&
        !guildMember.roles.cache.has(Constants.SUPPORTER_ROLE)
      ) {
        await sleep(250);
        await guildMember.roles.add(Constants.SUPPORTER_ROLE);
      }

      const colour = await getEmbedColor(guildMember.user.id);

      if (colour === "default") {
        if (guildMember.roles.cache.find((i) => i.name === "custom")) {
          await sleep(250);
          await guildMember.roles.remove(guildMember.roles.cache.find((i) => i.name === "custom"));
        }
      } else if (!guildMember.roles.cache.find((i) => i.name === "custom")) {
        await sleep(250);

        const existingRole = guildMember.guild.roles.cache.find(
          (i) => i.name === "custom" && i.hexColor === colour,
        );

        if (existingRole) {
          await guildMember.roles.add(existingRole);
        } else {
          const seperatorRole = guildMember.guild.roles.cache.get("1329425677614845972");

          const role = await guildMember.guild.roles.create({
            name: "custom",
            color: colour,
            position: seperatorRole.position + 1,
            permissions: [],
          });

          await guildMember.roles.add(role);
        }
      } else {
        const role = guildMember.roles.cache.find((i) => i.name === "custom");

        if (role.hexColor !== colour) {
          if (role.members.size === 1) {
            await sleep(250);
            await guildMember.guild.roles.edit(role, { color: colour });
          } else {
            await sleep(250);
            await guildMember.roles.remove(role);

            const existingRole = guildMember.guild.roles.cache.find(
              (i) => i.name === "custom" && i.hexColor === colour,
            );

            if (existingRole) {
              await sleep(250);
              await guildMember.roles.add(existingRole);
            } else {
              const seperatorRole = guildMember.guild.roles.cache.get("1329425677614845972");

              await sleep(250);

              const role = await guildMember.guild.roles.create({
                name: "custom",
                color: colour,
                position: seperatorRole.position + 1,
                permissions: [],
              });

              await sleep(250);

              await guildMember.roles.add(role);
            }
          }
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
        `\n**booster** ${await isBooster(message.author.id)}` +
        `\n**started** <t:${Math.floor(profile.startDate.getTime() / 1000)}> (<t:${Math.floor(
          profile.startDate.getTime() / 1000,
        )}:R>)` +
        `\n**expires** ${expiresText}` +
        `\n**credit** ${profile.credit}` +
        `\n\n**color** ${profile.embedColor} - /premium color` +
        `\n**aliases** ${aliases.length.toLocaleString()}`;

      if (profile.level > 2) {
        const cmd = await getUserCommand(message.author.id);
        description += `\n**custom command** ${cmd ? cmd.trigger : "none"}`;
      }

      if (profile.level < 4) {
        description += "\n\nyou can upgrade your tier at [ko-fi](https://ko-fi.com/tekoh/tiers)";
      }

      embed.setDescription(description);
      embed.setFooter({ text: "thank you so much for supporting!" });

      return send({ embeds: [embed] });
    } else if (await isBooster(message.author.id)) {
      const embed = new CustomEmbed(
        message.member,
        "you are currently boosting the nypsi server!! thank you, your booster rewards are separate from premium, meaning that they can stack together.\n\nyou currently have no premium membership, this is what helps keep nypsi running. i (max) am massively grateful for any donations :heart:",
      );

      embed.addField(
        "payment methods",
        "[ko-fi](https://ko-fi.com/tekoh/tiers)\n\n" +
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
        "[ko-fi](https://ko-fi.com/tekoh/tiers)\n\n" +
          `if you'd like to pay another way (crypto, paypal, etc) join the [support server](${Constants.NYPSI_SERVER_INVITE_LINK})\nif you are just looking to buy crates, you can do so from the [nypsi shop](https://ko-fi.com/U7U4AEDXM/shop)`,
      );

      return send({ embeds: [embed] });
    }
  };

  const setColor = async () => {
    if (!(await isPremium(message.author.id))) {
      return send({
        embeds: [
          new ErrorEmbed(
            "you must be a BRONZE tier patreon for this command\n\nhttps://www.patreon.com/nypsi",
          ),
        ],
      });
    }

    if ((await getTier(message.author.id)) < 1) {
      return send({
        embeds: [
          new ErrorEmbed(
            "you must be at least BRONZE tier for this command, you are BRONZE\n\nhttps://www.patreon.com/nypsi",
          ),
        ],
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

    await setEmbedColor(message.author.id, color.toLowerCase());

    if (message.guildId === Constants.NYPSI_SERVER_ID) {
      if (message.member.roles.cache.find((i) => i.name === message.author.id)) {
        const role = message.member.roles.cache.find((i) => i.name === message.author.id);
        if (color === "default") {
          await role.delete();
        } else {
          await role.edit({ color: color as ColorResolvable });
        }
      } else {
        const seperatorRole = message.guild.roles.cache.get("1329425677614845972");

        const role = await message.guild.roles.create({
          name: message.author.id,
          color: color as ColorResolvable,
          position: seperatorRole.position + 1,
        });

        await message.member.roles.add(role);
      }
    }

    embed.setDescription(
      `your color has been updated to **${await getEmbedColor(message.author.id)}**`,
    );

    return send({
      embeds: [embed],
    });
  };

  const doCustomCommand = async () => {
    if ((await getTier(message.author.id)) < 3) {
      return send({
        embeds: [new ErrorEmbed("you must be **GOLD** tier to create a custom command")],
      });
    }
    if (!(message instanceof CommandInteraction)) {
      return send({ embeds: [new ErrorEmbed("you must use /premium mycmd for this")] });
    }
    if (!message.isChatInputCommand()) return;

    if (args[1].toLowerCase() === "view") {
      const cmd = await getUserCommand(message.author.id);

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

      if (commandExists(commandTrigger))
        return send({ embeds: [new ErrorEmbed("this is already a nypsi command")] });

      const cmd = await getCommand(commandTrigger);

      if (cmd && cmd.owner !== message.author.id)
        return send({ embeds: [new ErrorEmbed("this custom command already exists")] });

      await setCommand(message.author.id, commandTrigger, commandContent);

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
    if ((await getTier(message.author.id)) < 1) {
      return send({
        embeds: [new ErrorEmbed("you must be **BRONZE** tier to create a custom alias")],
      });
    }
    if (!(message instanceof CommandInteraction)) {
      return send({ embeds: [new ErrorEmbed("you must use /premium alias for this")] });
    }

    if (!message.isChatInputCommand()) return;

    const aliases = await getUserAliases(message.author.id);

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

      const tier = await getTier(message.author.id);

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
      const command = cleanString(
        message.options.getString("command").toLowerCase().normalize("NFD"),
      );

      for (const word of commandFilter) {
        if (trigger.includes(word) || command.toLowerCase().includes(word)) {
          return send({ embeds: [new ErrorEmbed("explicit content 🙄")] });
        }
      }

      if (aliases.find((i) => i.alias === trigger))
        return send({ embeds: [new ErrorEmbed("you already have this alias set")] });

      if (!commandExists(command.split(" ")[0])) {
        return send({
          embeds: [
            new ErrorEmbed(
              `\`${
                command.split(" ")[0]
              }\` is not a command. use $help <alias> to find the actual command name`,
            ),
          ],
        });
      }

      await addUserAlias(message.author.id, trigger, command);

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

      await removeUserAlias(message.author.id, trigger);

      return send({
        embeds: [new CustomEmbed(message.member, `✅ removed \`${prefix}${trigger}\``)],
      });
    }
  };

  if (args.length == 0 || args[0].toLowerCase() == "view") {
    return defaultMessage();
  } else if (args[0].toLowerCase() == "check" || args[0].toLowerCase() == "status") {
    if (message.author.id != Constants.TEKOH_ID) {
      return defaultMessage();
    }

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed("invalid syntax bro")] });
    }

    const user = await message.client.users.fetch(args[1]);

    if (!user) return send({ embeds: [new ErrorEmbed("user doesnt exist")] });

    if (await isPremium(user.id)) {
      const embed = new CustomEmbed(message.member);

      embed.setHeader(`premium status of ${user.id}`);

      const profile = await getPremiumProfile(user.id);

      const timeStarted = formatDate(profile.startDate);
      const timeAgo = daysAgo(profile.startDate);
      const expires = formatDate(profile.expireDate);
      const timeUntil = daysUntil(profile.expireDate);

      let description = `**tier** ${levelString(
        profile.level,
      )}\n**started** ${timeStarted} (${timeAgo} days ago)\n**expires** ${expires} (${timeUntil} days left)\n**credit** ${
        profile.credit
      }`;

      if (profile.level > 2) {
        const cmd = await getUserCommand(user.id);
        description += `\n**custom command** ${cmd ? cmd.content : "none"}`;
      }

      embed.setDescription(description);

      return send({ embeds: [embed] });
    } else {
      const embed = new CustomEmbed(message.member, "no premium membership");

      return send({ embeds: [embed] });
    }
  } else if (args[0].toLowerCase() == "update") {
    if (message.author.id != Constants.TEKOH_ID) {
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
    if (message.author.id != Constants.TEKOH_ID) {
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
    if (message.author.id != Constants.TEKOH_ID) {
      return defaultMessage();
    }

    if (args.length != 2) {
      return send({ embeds: [new ErrorEmbed("invalid syntax bro")] });
    }

    await renewUser(args[1]);

    return send({ embeds: [new CustomEmbed(message.member, "✅ membership renewed")] });
  } else if (args[0].toLowerCase() == "expire") {
    if (message.author.id != Constants.TEKOH_ID) {
      return defaultMessage();
    }

    if (args.length != 2) {
      return send({ embeds: [new ErrorEmbed("invalid syntax bro")] });
    }

    setExpireDate(args[1], new Date(0));

    return send({ embeds: [new CustomEmbed(message.member, "✅ membership will expire soon")] });
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

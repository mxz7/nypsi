import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  ColorResolvable,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { NypsiClient } from "../models/Client";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { daysAgo, daysUntil, formatDate } from "../utils/functions/date";
import PageManager from "../utils/functions/page";
import { addUserAlias, getUserAliases, removeUserAlias } from "../utils/functions/premium/aliases";
import { getEmbedColor, setEmbedColor } from "../utils/functions/premium/color";
import { getCommand, getUserCommand, setCommand } from "../utils/functions/premium/command";
import {
  addMember,
  getPremiumProfile,
  getTier,
  isPremium,
  renewUser,
  setExpireDate,
  setStatus,
  setTier,
} from "../utils/functions/premium/premium";
import { cleanString } from "../utils/functions/string";
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

const cmd = new Command("premium", "view your premium status", Categories.INFO)
  .setAliases(["patreon", "donate", "prem", "kofi"])
  .setDocs("https://docs.nypsi.xyz/premium");

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((view) => view.setName("view").setDescription("view your premium status"))
  .addSubcommand((color) =>
    color
      .setName("color")
      .setDescription("set your custom color")
      .addStringOption((option) =>
        option.setName("color").setDescription("color you want to be used on all messages (hex format)").setRequired(true)
      )
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
            option.setName("trigger").setDescription("trigger for your command").setRequired(true)
          )
          .addStringOption((option) =>
            option.setName("value").setDescription("set the content for your custom command").setRequired(true)
          )
      )
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
            option.setName("alias").setDescription("alias for your command").setRequired(true).setMaxLength(15)
          )
          .addStringOption((option) =>
            option
              .setName("command")
              .setDescription("command you would like to run when doing your alias")
              .setRequired(true)
              .setMaxLength(50)
          )
      )
      .addSubcommand((del) =>
        del
          .setName("del")
          .setDescription("delete a custom alias")
          .addStringOption((option) =>
            option.setName("alias").setDescription("alias for your command").setRequired(true).setMaxLength(15)
          )
      )
  );

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

  const checkRoles = async () => {
    if (doingRoles) return;
    doingRoles = true;
    for (const guildMember of message.guild.members.cache.values()) {
      const roleIds = Array.from(guildMember.roles.cache.keys());
      if (!(await isPremium(guildMember)) || guildMember.user.id == Constants.TEKOH_ID) {
        // i dont want plat role lol
        if (roleIds.includes(Constants.PLATINUM_ROLE_ID)) guildMember.roles.remove(Constants.PLATINUM_ROLE_ID);
        if (roleIds.includes(Constants.GOLD_ROLE_ID)) guildMember.roles.remove(Constants.GOLD_ROLE_ID);
        if (roleIds.includes(Constants.SILVER_ROLE_ID)) guildMember.roles.remove(Constants.SILVER_ROLE_ID);
        if (roleIds.includes(Constants.BRONZE_ROLE_ID)) guildMember.roles.remove(Constants.BRONZE_ROLE_ID);
        continue;
      }

      let requiredRole = "none";
      switch (await getTier(guildMember)) {
        case 1:
          requiredRole = Constants.BRONZE_ROLE_ID;
          break;
        case 2:
          if (!roleIds.includes(Constants.BOOST_ROLE_ID)) requiredRole = Constants.SILVER_ROLE_ID;
          break;
        case 3:
          requiredRole = Constants.GOLD_ROLE_ID;
          break;
        case 4:
          requiredRole = Constants.PLATINUM_ROLE_ID;
          break;
      }

      if (requiredRole != "none" && !roleIds.includes(requiredRole)) guildMember.roles.add(requiredRole);

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
            if (roleIds.includes(Constants.BOOST_ROLE_ID)) guildMember.roles.remove(Constants.SILVER_ROLE_ID);
            requiredLevel = 2;
            break;
          case Constants.BRONZE_ROLE_ID:
            requiredLevel = 1;
            break;
        }
        if (requiredLevel !== 0) {
          if ((await getTier(guildMember)) != requiredLevel) guildMember.roles.remove(role.id);
        }
      }
    }
    doingRoles = false;
  };

  const defaultMessage = async () => {
    if (await isPremium(message.member)) {
      if (message.guild.id == Constants.NYPSI_SERVER_ID) {
        checkRoles();
      }

      const embed = new CustomEmbed(message.member);

      embed.setHeader("premium status", message.author.avatarURL());

      const profile = await getPremiumProfile(message.member);

      const timeStarted = formatDate(profile.startDate);
      const timeAgo = daysAgo(profile.startDate);
      const expires = formatDate(profile.expireDate);
      const timeUntil = daysUntil(profile.expireDate);
      const embedColor = profile.embedColor;

      let description = `**tier** ${profile.getLevelString()}\n**started** ${timeStarted} (${timeAgo} days ago)\n**expires** ${expires} (${timeUntil} days left)`;

      description += `\n\n**color** ${embedColor} - /premium color`;

      if (profile.level > 2) {
        const cmd = await getUserCommand(message.author.id);
        description += `\n**custom command** ${cmd ? cmd.content : "none"}`;
      }

      if (profile.level < 4) {
        description +=
          "\n\nyou can upgrade your tier at [patreon](https://www.patreon.com/nypsi) or [ko-fi](https://ko-fi.com/tekoh/tiers)";
      }

      embed.setDescription(description);
      embed.setFooter({ text: "thank you so much for supporting!" });

      return send({ embeds: [embed] });
    } else {
      const embed = new CustomEmbed(
        message.member,
        "you currently have no premium membership, this is what helps keep nypsi running, any donations are massively greatful :heart:"
      );

      embed.addField(
        "payment methods",
        "[ko-fi](https://ko-fi.com/tekoh/tiers)\n[patreon](https://patreon.com/join/nypsi)\n\n" +
          "if you'd like to pay another way (crypto, paypal) join the [support server](https://discord.gg/hJTDNST)"
      );

      return send({ embeds: [embed] });
    }
  };

  const setColor = async () => {
    if (!(await isPremium(message.author.id))) {
      return send({
        embeds: [new ErrorEmbed("you must be a BRONZE tier patreon for this command\n\nhttps://www.patreon.com/nypsi")],
      });
    }

    if ((await getTier(message.author.id)) < 1) {
      return send({
        embeds: [
          new ErrorEmbed(
            "you must be atleast BRONZE tier for this command, you are BRONZE\n\nhttps://www.patreon.com/nypsi"
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

    if (!color.match(Constants.COLOUR_REGEX))
      return send({ embeds: [new ErrorEmbed("invalid hex color code. example: #abcdef")] });

    const embed = new CustomEmbed();

    try {
      if (color != "default") {
        embed.setColor(color as ColorResolvable);
      }
    } catch {
      return send({
        embeds: [new ErrorEmbed("invalid color, please use a hex color ([color.tekoh.net](https://color.tekoh.net))")],
      });
    }

    await setEmbedColor(message.author.id, color);

    return send({
      embeds: [
        new CustomEmbed(message.member, `your color has been updated to **${await getEmbedColor(message.author.id)}**`),
      ],
    });
  };

  const doCustomCommand = async () => {
    if ((await getTier(message.author.id)) < 3) {
      return send({ embeds: [new ErrorEmbed("you must be **GOLD** tier to create a custom command")] });
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
      const commandTrigger = cleanString(message.options.getString("trigger").toLowerCase().normalize("NFD")).trim();
      const commandContent = cleanString(message.options.getString("value").toLowerCase().normalize("NFD")).trim();

      if (commandTrigger.length === 0 || commandContent.length === 0) {
        return send({ embeds: [new ErrorEmbed("content or trigger cannot be empty")] });
      }

      for (const word of commandFilter) {
        if (commandContent.includes(word) || commandTrigger.includes(word)) {
          return send({ embeds: [new ErrorEmbed("explicit content 🙄")] });
        }
      }

      if (commandExists(commandTrigger)) return send({ embeds: [new ErrorEmbed("this is already a nypsi command")] });

      const cmd = await getCommand(commandTrigger);

      if (cmd) return send({ embeds: [new ErrorEmbed("this custom command already exists")] });

      await setCommand(message.author.id, commandTrigger, commandContent);

      return send({ embeds: [new CustomEmbed(message.member, "✅ your command has been updated")] });
    }
  };

  const doAliases = async () => {
    if ((await getTier(message.author.id)) < 1) {
      return send({ embeds: [new ErrorEmbed("you must be **BRONZE** tier to create a custom alias")] });
    }
    if (!(message instanceof CommandInteraction)) {
      return send({ embeds: [new ErrorEmbed("you must use /premium alias for this")] });
    }

    if (!message.isChatInputCommand()) return;

    const aliases = await getUserAliases(message.author.id);

    if (args[1].toLowerCase() === "list") {
      if (aliases.length === 0) return send({ embeds: [new ErrorEmbed("you have no aliases")] });
      const pages = PageManager.createPages(aliases.map((i) => `\`${i.alias}\` -> \`${i.command}\``));

      const embed = new CustomEmbed(message.member, pages.get(1).join("\n"));

      const msg = await send({ embeds: [embed] });

      if (pages.size === 1) return;

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
      );

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
        return send({ embeds: [new ErrorEmbed(`you have reached your limit of custom aliases (${max})`)] });
      }

      const trigger = cleanString(message.options.getString("alias").toLowerCase().normalize("NFD").split(" ")[0]);
      const command = cleanString(message.options.getString("command").toLowerCase().normalize("NFD"));

      for (const word of commandFilter) {
        if (trigger.includes(word) || command.includes(word)) {
          return send({ embeds: [new ErrorEmbed("explicit content 🙄")] });
        }
      }

      if (aliases.find((i) => i.alias === trigger))
        return send({ embeds: [new ErrorEmbed("you already have this alias set")] });

      if (!commandExists(command.split(" ")[0])) {
        return send({
          embeds: [
            new ErrorEmbed(
              `\`${command.split(" ")[0]}\` is not a command. use $help <alias> to find the actual command name`
            ),
          ],
        });
      }

      await addUserAlias(message.author.id, trigger, command);

      return send({ embeds: [new CustomEmbed(message.member, `✅ added \`${trigger}\` -> \`${command}\``)] });
    } else if (args[1].toLowerCase() === "del") {
      const foundAlias = aliases.find((i) => i.alias === args[2]);

      if (!foundAlias) {
        return send({ embeds: [new ErrorEmbed(`couldnt find alias \`${args[2]}\``)] });
      }

      await removeUserAlias(message.author.id, args[2]);

      return send({ embeds: [new CustomEmbed(message.member, `✅ removed \`${args[2]}\``)] });
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

      let description = `**tier** ${profile.getLevelString()}\n**started** ${timeStarted} (${timeAgo} days ago)\n**expires** ${expires} (${timeUntil} days left)`;

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
        embeds: [new ErrorEmbed("this user does not have a profile, use $premium add dumbass check it before u update it")],
      });
    }

    const expire = (await getPremiumProfile(args[2])).expireDate;
    let date: dayjs.Dayjs;

    switch (args[1].toLowerCase()) {
      case "level":
        await setTier(args[2], parseInt(args[3]), message.client as NypsiClient);
        return send({
          embeds: [new CustomEmbed(message.member, `✅ tier changed to ${args[3]}`)],
        });
      case "embed":
        await setEmbedColor(args[2], args[3]);
        return send({
          embeds: [new CustomEmbed(message.member, `✅ embed color changed to ${args[3]}`)],
        });
      case "status":
        await setStatus(args[2], parseInt(args[3]));
        return send({
          embeds: [new CustomEmbed(message.member, `✅ status changed to ${args[3]}`)],
        });
      case "adddays":
        date = dayjs(expire);

        date = date.add(parseInt(args[3]), "days");

        await setExpireDate(args[2], date.toDate(), message.client as NypsiClient);
        return send({
          embeds: [new CustomEmbed(message.member, `✅ expire date changed to ${date.toDate()}`)],
        });
      case "remdays":
        date = dayjs(expire);

        date = date.subtract(parseInt(args[3]), "days");

        await setExpireDate(args[2], date.toDate(), message.client as NypsiClient);
        return send({
          embeds: [new CustomEmbed(message.member, `✅ expire date changed to ${date.toDate()}`)],
        });
    }
  } else if (args[0].toLowerCase() == "add") {
    if (message.author.id != Constants.TEKOH_ID) {
      return defaultMessage();
    }

    if (args.length < 3) {
      return send({ embeds: [new ErrorEmbed("invalid syntax bro")] });
    }

    await addMember(args[1], parseInt(args[2]), message.client as NypsiClient);

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

    await renewUser(args[1], message.client as NypsiClient);

    return send({ embeds: [new CustomEmbed(message.member, "✅ membership renewed")] });
  } else if (args[0].toLowerCase() == "expire") {
    if (message.author.id != Constants.TEKOH_ID) {
      return defaultMessage();
    }

    if (args.length != 2) {
      return send({ embeds: [new ErrorEmbed("invalid syntax bro")] });
    }

    setExpireDate(args[1], new Date(0), message.client as NypsiClient);

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

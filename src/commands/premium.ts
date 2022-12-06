import { BaseMessageOptions, ColorResolvable, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import { NypsiClient } from "../models/Client";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { daysAgo, daysUntil, formatDate } from "../utils/functions/date";
import { getEmbedColor, setEmbedColor } from "../utils/functions/premium/color";
import { getUserCommand } from "../utils/functions/premium/command";
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
import dayjs = require("dayjs");

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
    for (const guildMember of message.guild.members.cache.values()) {
      let requiredRole: string;

      switch (await getTier(guildMember.user.id)) {
        case 0:
          requiredRole = "none";
          break;
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

      for (const role of guildMember.roles.cache.values()) {
        let requiredLevel: number;
        switch (role.id) {
          case Constants.BRONZE_ROLE_ID:
            requiredLevel = 1;
            break;
          case Constants.SILVER_ROLE_ID:
            requiredLevel = 2;
            break;
          case Constants.GOLD_ROLE_ID:
            requiredLevel = 3;
            break;
          case Constants.PLATINUM_ROLE_ID:
            requiredLevel = 4;
            break;
        }

        if (requiredLevel) {
          if ((await getTier(guildMember)) != requiredLevel) await guildMember.roles.remove(role);

          if (
            requiredLevel === 2 &&
            guildMember.roles.cache.has(Constants.BOOST_ROLE_ID) &&
            guildMember.roles.cache.has(Constants.SILVER_ROLE_ID)
          ) {
            await guildMember.roles.remove(Constants.SILVER_ROLE_ID);
          }
        }
      }

      if ((await getTier(message.member)) == 2 && guildMember.roles.cache.has(Constants.BOOST_ROLE_ID)) return;

      if (requiredRole != "none" && !Array.from(guildMember.roles.cache.keys()).includes(requiredRole)) {
        await guildMember.roles.add(requiredRole);
      }
    }
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
      return send({ embeds: [new ErrorEmbed("/premium setcolor <#color>")] });
    }

    let color = args[1].split("#").join("");

    if (color.toLowerCase() == "reset") color = "default";

    if (color.length > 6 && color != "default") {
      color = color.substr(0, 6);
    }

    if (!color.startsWith("#")) color = `#${color}`;

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
  }
}

cmd.setRun(run);

module.exports = cmd;

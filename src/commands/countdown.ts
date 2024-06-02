import { CommandInteraction, Message, PermissionFlagsBits } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { daysUntil, formatDate } from "../utils/functions/date";
import { addCountdown, deleteCountdown, getCountdowns } from "../utils/functions/guilds/countdowns";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getTier, isPremium } from "../utils/functions/premium/premium";

const cmd = new Command("countdown", "create and manage your server countdowns", "admin")
  .setAliases(["countdowns"])
  .setPermissions(["MANAGE_SERVER"]);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      message.channel.send({ embeds: [new ErrorEmbed("you need the `manage server` permission")] });
    }
    return;
  }

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    const countdowns = await getCountdowns(message.guild);

    const embed = new CustomEmbed(message.member).setHeader("countdown");

    if (countdowns.length == 0) {
      embed.setDescription(`use ${prefix}**countdown create** to create a countdown`);
    } else {
      for (const countdown of countdowns) {
        const date = formatDate(new Date(countdown.date).getTime());

        embed.addField(
          countdown.id.toString(),
          `**id** \`${countdown.id}\`\n**channel** \`${countdown.channel}\`\n**format** \`${countdown.format}\`\n**final format** \`${countdown.finalFormat}\`\n**date** \`${date}\``,
        );
      }
    }

    embed.setFooter({ text: `use ${prefix}countdown help for more commands` });

    return message.channel.send({ embeds: [embed] });
  } else if (args[0].toLowerCase() == "create" || args[0].toLowerCase() == "new") {
    const countdowns = await getCountdowns(message.guild);

    let max = 1;

    if (await isPremium(message.author.id)) {
      max += await getTier(message.author.id);
    }

    if (countdowns.length >= max) {
      let error = `you have reached the maximum amount of countdowns for this server (${max})`;

      if (max == 1) {
        error += "\n\nbecome a patreon to upgrade this limit (https://patreon.com/join/nypsi)";
      } else if (max != 5) {
        error +=
          "\n\nyou can upgrade your subscription to get access to more countdowns per server";
      }

      return message.channel.send({ embeds: [new ErrorEmbed(error)] });
    }

    const embed = new CustomEmbed(
      message.member,
      "what date do you want to count down to?\n\nplease use the following format: `MM/DD/YYYY` - example: 12/25/2069",
    );

    await message.channel.send({ embeds: [embed] });

    const filter = (msg: Message) => message.author.id == msg.author.id;

    let fail = false;

    let res: any = await message.channel
      .awaitMessages({ filter, max: 1, time: 60000, errors: ["time"] })
      .catch(() => {
        fail = true;
        message.channel.send({ embeds: [new ErrorEmbed("you ran out of time - cancelled")] });
      });

    if (fail) return;

    res = res.first().content.split(" ")[0];

    if (!res.includes("/")) {
      return message.channel.send({ embeds: [new ErrorEmbed("invalid date")] });
    }

    if (res.includes(":")) {
      return message.channel.send({ embeds: [new ErrorEmbed("invalid date")] });
    }

    const date = new Date(Date.parse(res));

    if (isNaN(date.getTime())) {
      return message.channel.send({ embeds: [new ErrorEmbed("invalid date")] });
    }

    const now = new Date().getTime();

    if (date.getTime() < now) {
      return message.channel.send({
        embeds: [new ErrorEmbed("unfortunately i cant go back in time")],
      });
    }

    if (date.getTime() - now < 172800000) {
      return message.channel.send({ embeds: [new ErrorEmbed("thats less than 2 days away bro")] });
    }

    if (date.getTime() - now > 63072000000) {
      return message.channel.send({
        embeds: [
          new ErrorEmbed("thats more than 2 years away man. i might not live that long").setFooter({
            text: "so become a patreon 😏",
          }),
        ],
      });
    }

    embed.setDescription(
      "which channel would you like to send countdown messages to\n\nplease mention the channel using # - and make sure i have permission to send messages there",
    );

    await message.channel.send({ embeds: [embed] });

    res = await message.channel
      .awaitMessages({ filter, max: 1, time: 60000, errors: ["time"] })
      .catch(() => {
        fail = true;
        message.channel.send({ embeds: [new ErrorEmbed("you ran out of time - cancelled")] });
      });

    if (fail) return;

    res = res.first();

    if (!res.mentions.channels.first()) {
      return message.channel.send({
        embeds: [new ErrorEmbed("invalid channel, please mention the channel using #")],
      });
    }

    const channel = res.mentions.channels.first();

    embed.setDescription(
      "what format would you like to use?\n\n%days% will be replaced with how many days are left",
    );

    await message.channel.send({ embeds: [embed] });

    res = await message.channel
      .awaitMessages({ filter, max: 1, time: 60000, errors: ["time"] })
      .catch(() => {
        fail = true;
        message.channel.send({ embeds: [new ErrorEmbed("you ran out of time - cancelled")] });
      });

    if (fail) return;

    res = res.first().content;

    if (!res.includes("%days%")) {
      return message.channel.send({ embeds: [new ErrorEmbed("could not find %days%")] });
    }

    if (res.length > 250) {
      return message.channel.send({
        embeds: [new ErrorEmbed("cannot be longer than 250 characters")],
      });
    }

    const format = res;

    embed.setDescription(
      "what final format would you like to use?\n\nthe final format is what will be used on the final day",
    );

    await message.channel.send({ embeds: [embed] });

    res = await message.channel
      .awaitMessages({ filter, max: 1, time: 60000, errors: ["time"] })
      .catch(() => {
        fail = true;
        message.channel.send({ embeds: [new ErrorEmbed("you ran out of time - cancelled")] });
      });

    if (fail) return;

    res = res.first().content;

    if (res.length > 250) {
      return message.channel.send({
        embeds: [new ErrorEmbed("cannot be longer than 250 characters")],
      });
    }

    const finalFormat = res;

    const embedd = new CustomEmbed();

    embedd.setDescription(format.split("%days%").join(daysUntil(date) + 1));
    embedd.setColor(Constants.TRANSPARENT_EMBED_COLOR);

    await channel.send({ embeds: [embedd] }).catch(() => {
      fail = true;
      return message.channel.send({
        embeds: [new ErrorEmbed("failed to send countdown - check my permissions")],
      });
    });

    if (fail) return;

    await addCountdown(message.guild, date, format, finalFormat, channel.id);

    embed.setDescription("✅ countdown added");

    return message.channel.send({ embeds: [embed] });
  } else if (
    args[0].toLowerCase() == "del" ||
    args[0].toLowerCase() == "-" ||
    args[0].toLowerCase() == "delete"
  ) {
    if (args.length == 1 || isNaN(parseInt(args[1]))) {
      return message.channel.send({
        embeds: [new ErrorEmbed(`${prefix}countdown delete <countdown id>`)],
      });
    }

    const countdowns = await getCountdowns(message.guild);

    if (!countdowns[parseInt(args[1]) - 1]) {
      return message.channel.send({
        embeds: [new ErrorEmbed("invalid countdown - use the countdown id")],
      });
    }

    await deleteCountdown(message.guild, args[1].toString());

    return message.channel.send({
      embeds: [new CustomEmbed(message.member, "✅ countdown deleted")],
    });
  } else {
    const embed = new CustomEmbed(message.member);

    embed.setHeader("countdown");
    embed.setDescription(
      `${prefix}**countdown create** *create a countdown*\n${prefix}**countdown del <id>** *delete a countdown*\n${prefix}**countdown** *list all active countdowns*`,
    );

    return message.channel.send({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;

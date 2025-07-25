import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Channel,
  Collection,
  CommandInteraction,
  ComponentType,
  GuildMember,
  MessageActionRowComponentBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { setBirthdayChannel } from "../utils/functions/guilds/birthday";
import PageManager from "../utils/functions/page";
import {
  getBirthday,
  getTodaysBirthdays,
  getUpcomingBirthdays,
  isBirthdayEnabled,
  setBirthday,
  setBirthdayEnabled,
} from "../utils/functions/users/birthday";
import dayjs = require("dayjs");
import ms = require("ms");

const cmd = new Command(
  "birthday",
  "set your birthday and set up a birthday announcement channel",
  "info",
).setAliases(["bday"]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((set) =>
    set
      .setName("set")
      .setDescription("set your birthday")
      .addStringOption((birthday) =>
        birthday
          .setName("birthday")
          .setDescription("your birthday in the format YYYY-MM-DD")
          .setRequired(true),
      ),
  )
  .addSubcommand((toggle) =>
    toggle.setName("toggle").setDescription("toggle birthday announcements for yourself on/off"),
  )
  .addSubcommand((channel) =>
    channel
      .setName("channel")
      .setDescription("set the channel for birthday announcements in the server")
      .addChannelOption((channel) =>
        channel
          .setName("channel")
          .setDescription("channel for birthday announcements")
          .setRequired(true),
      ),
  )
  .addSubcommand((disable) =>
    disable.setName("disable").setDescription("disable birthday announcements in this server"),
  )
  .addSubcommand((upcoming) =>
    upcoming.setName("upcoming").setDescription("view upcoming birthdays in the server"),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (args[0]?.toLowerCase() === "set") {
    if (args.length === 1) {
      return send({ embeds: [new ErrorEmbed("you forgot your birthday..... idiot.....")] });
    }

    let birthday = new Date(args[1].trim().replaceAll("/", "-").replaceAll(" ", "-"));

    if (isNaN(birthday as unknown as number))
      return send({ embeds: [new ErrorEmbed("invalid date, use the format YYYY-MM-DD")] });

    birthday = dayjs(birthday)
      .set("hours", 0)
      .set("minute", 0)
      .set("second", 0)
      .set("millisecond", 0)
      .toDate();

    const years = dayjs().diff(birthday, "years");

    if (years < 13)
      return send({ embeds: [new ErrorEmbed("you must be at least 13 to use discord")] });

    if (years > 60) return send({ embeds: [new ErrorEmbed("HAHAHA")] });

    if (message.author.createdTimestamp > Date.now() - ms("30 days"))
      return send({ embeds: [new ErrorEmbed("your account is too new to use this feature ☹️")] });

    const birthdayCheck = await getBirthday(message.member);

    if (birthdayCheck)
      return send({
        embeds: [
          new ErrorEmbed(
            "you already have a birthday set\n\nsend me a DM to create a support ticket if this is an error",
          ),
        ],
      });

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("confirm").setLabel("confirm").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("cancel").setLabel("cancel").setStyle(ButtonStyle.Danger),
    );

    const confirmationMsg = await send({
      embeds: [
        new CustomEmbed(
          message.member,
          `confirm that your birthday is ${dayjs(birthday).format("MMMM D, YYYY")}, you are ${years} years old`,
        ),
      ],
      components: [row],
    });

    const interaction = await confirmationMsg
      .awaitMessageComponent({
        filter: (i) => i.user.id === message.author.id,
        time: 30000,
        componentType: ComponentType.Button,
      })
      .catch(() => {
        row.components.forEach((b) => b.setDisabled(true));
        confirmationMsg.edit({ components: [row] });
      });

    if (!interaction) return;

    if (interaction.customId === "confirm") {
      await setBirthday(message.member, birthday);

      interaction.update({
        embeds: [
          new CustomEmbed(
            message.member,
            `your birthday has been set to ${dayjs(birthday).format("MMMM D, YYYY")}`,
          ),
        ],
        components: [],
      });
    } else {
      row.components.forEach((b) => b.setDisabled(true));
      interaction.update({ components: [row] });
    }
  } else if (args[0]?.toLowerCase() === "toggle") {
    const current = await isBirthdayEnabled(message.member);

    await setBirthdayEnabled(message.member, !current);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          current
            ? "birthday announcements turned off for all servers"
            : "birthday announcements turned on for all servers",
        ),
      ],
    });
  } else if (args[0]?.toLowerCase() === "disable") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return;

    await setBirthdayChannel(message.guild.id, null);

    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          "birthday announcements have been turned off in this server",
        ),
      ],
    });
  } else if (args[0]?.toLowerCase() === "channel") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return;

    if (args.length === 1)
      return send({ embeds: [new ErrorEmbed("you forgot the channel you silly little guy!!!!")] });

    let channel: string | Channel = args[1];

    if (!message.guild.channels.cache.get(channel)) {
      if (!message.mentions.channels.first()) {
        return send({
          embeds: [
            new ErrorEmbed(
              "you need to mention a channel, you can use the channel ID, or mention the channel by putting a # before the channel name",
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      } else {
        channel = message.mentions.channels.first();
      }
    } else {
      channel = message.guild.channels.cache.find((ch) => ch.id == channel);
    }

    if (!channel) {
      return send({ embeds: [new ErrorEmbed("invalid channel")], flags: MessageFlags.Ephemeral });
    }

    if (!channel.isTextBased()) {
      return send({ embeds: [new ErrorEmbed("invalid channel")], flags: MessageFlags.Ephemeral });
    }

    if (channel.isDMBased()) return;

    if (channel.isThread()) {
      return send({ embeds: [new ErrorEmbed("invalid channel")], flags: MessageFlags.Ephemeral });
    }

    let fail = false;

    const hook = await channel
      .createWebhook({
        name: "nypsi",
        avatar: channel.client.user.avatarURL(),
      })
      .catch((e) => {
        fail = true;
        send({
          embeds: [
            new ErrorEmbed(
              "i was unable to make a webhook in that channel, please check my permissions\n" +
                `\`\`\`${e.rawError.message}\`\`\``,
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      });

    if (fail) return;
    if (!hook) return;

    await setBirthdayChannel(message.guild.id, hook.url);

    return send({
      embeds: [
        new CustomEmbed(message.member, `birthday announcements set to ${channel.toString()}`),
      ],
    });
  } else if (args[0]?.toLowerCase() === "upcoming") {
    const members = await message.guild.members.fetch().catch(() => {
      return new Collection<string, GuildMember>();
    });

    const birthdays = await getUpcomingBirthdays(members.map((m) => m.id));

    if (birthdays.length === 0) {
      return send({ embeds: [new ErrorEmbed("no upcoming birthdays")] });
    }

    const embed = new CustomEmbed(message.member).setHeader(
      "upcoming birthdays",
      message.guild.iconURL(),
    );

    const pages = PageManager.createPages(
      birthdays.map(
        (i) =>
          `**${i.lastKnownUsername}** <t:${dayjs(i.birthday).set("year", dayjs().year()).unix()}:R>`,
      ),
    );

    embed.setDescription(pages.get(1).join("\n"));

    if (pages.size === 1) {
      return send({ embeds: [embed] });
    }

    const row = PageManager.defaultRow();

    const msg = await send({ embeds: [embed], components: [row] });

    const manager = new PageManager({
      embed,
      pages,
      row,
      message: msg,
      userId: message.author.id,
      allowMessageDupe: true,
    });

    manager.listen();
    return;
  } else {
    const birthday = await getBirthday(message.member);

    const embed = new CustomEmbed(
      message.member,
      birthday
        ? `your birthday is ${dayjs(birthday).format("MMMM D, YYYY")}\n\n`
        : "/**birthday set <YYYY-MM-DD>** *set your birthday*\n" +
          "/**birthday toggle** *enable/disable your birthday from being announced in servers*\n" +
          "/**birthday channel <channel>** *set a channel to be used as the birthday announcement channel*\n" +
          "/**birthday disable** *disable birthday announcements in your server*\n" +
          "/**birthday upcoming** *view upcoming birthdays in the server*",
    );

    const todaysBirthdays = await getTodaysBirthdays();

    if (todaysBirthdays.length > 0) {
      const members = await message.guild.members
        .fetch({ user: todaysBirthdays.map((i) => i.id) })
        .catch(() => new Collection<string, GuildMember>());

      if (members.size > 0) {
        embed.addField(
          "today's birthdays",
          Array.from(members.mapValues((i) => i.toString()).values()).join("\n"),
        );
      }
    }

    return send({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;

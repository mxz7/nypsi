import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Channel,
  Collection,
  CommandInteraction,
  ComponentType,
  GuildMember,
  LabelBuilder,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { setBirthdayChannel } from "../utils/functions/guilds/birthday";
import { getAllMembers } from "../utils/functions/guilds/members";
import PageManager from "../utils/functions/page";
import {
  getBirthday,
  getFormattedBirthday,
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
  .addSubcommand((view) => view.setName("view").setDescription("view or set your birthday"))
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
  )
  .addSubcommand((set) => set.setName("set").setDescription("set your birthday"));

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (args[0]?.toLowerCase() === "toggle") {
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
    const members = await getAllMembers(message.guild);

    const birthdays = await getUpcomingBirthdays(members);

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
    let birthday = await getBirthday(message.member);

    const embed = new CustomEmbed(
      message.member,
      (birthday
        ? `your birthday is **${await getFormattedBirthday(birthday)}**\n-# incorrect? [make a support ticket](https://nypsi.xyz/docs/faq#how-do-i-make-a-support-ticket)\n\n`
        : "") +
        "/**birthday toggle** *enable/disable your birthday from being announced in servers*\n" +
        "/**birthday channel <channel>** *set a channel to be used as the birthday announcement channel*\n" +
        "/**birthday disable** *disable birthday announcements in your server*\n" +
        "/**birthday upcoming** *view upcoming birthdays in the server*",
    );

    let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("set-birthday")
        .setLabel("set birthday")
        .setStyle(ButtonStyle.Success),
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

    if (birthday) return send({ embeds: [embed] });

    let msg = await send({
      embeds: [embed],
      components: [row],
    });

    let interaction = await msg
      .awaitMessageComponent({
        filter: (i) => i.user.id === message.author.id,
        time: 30000,
        componentType: ComponentType.Button,
      })
      .catch(() => {
        msg.edit({ components: [] });
      });

    if (!interaction) return;

    msg.edit({ components: [] });

    if (interaction.customId !== "set-birthday") return;

    const id = `set-birthday-${Math.floor(Math.random() * 69420)}`;
    const modal = new ModalBuilder()
      .setCustomId(id)
      .setTitle("your birthday")
      .addLabelComponents(
        new LabelBuilder()
          .setLabel("what month?")
          .setStringSelectMenuComponent(
            new StringSelectMenuBuilder()
              .setCustomId("month")
              .setPlaceholder("month")
              .setRequired(true)
              .addOptions(
                new StringSelectMenuOptionBuilder().setLabel("january").setValue("01"),
                new StringSelectMenuOptionBuilder().setLabel("february").setValue("02"),
                new StringSelectMenuOptionBuilder().setLabel("march").setValue("03"),
                new StringSelectMenuOptionBuilder().setLabel("april").setValue("04"),
                new StringSelectMenuOptionBuilder().setLabel("may").setValue("05"),
                new StringSelectMenuOptionBuilder().setLabel("june").setValue("06"),
                new StringSelectMenuOptionBuilder().setLabel("july").setValue("07"),
                new StringSelectMenuOptionBuilder().setLabel("august").setValue("08"),
                new StringSelectMenuOptionBuilder().setLabel("september").setValue("09"),
                new StringSelectMenuOptionBuilder().setLabel("october").setValue("10"),
                new StringSelectMenuOptionBuilder().setLabel("november").setValue("11"),
                new StringSelectMenuOptionBuilder().setLabel("december").setValue("12"),
              ),
          ),
        new LabelBuilder()
          .setLabel(`what day of the month?`)
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId("day")
              .setPlaceholder("day")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(2),
          ),
        new LabelBuilder()
          .setLabel(`what year?`)
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId("year")
              .setPlaceholder("year")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(4),
          ),
      );

    await interaction.showModal(modal);

    const filter = (i: ModalSubmitInteraction) =>
      i.user.id == (interaction as ButtonInteraction).user.id && i.customId === id;

    const res = await interaction.awaitModalSubmit({ filter, time: 30000 }).catch(() => {});

    if (!res) return;

    const month = res.fields.getStringSelectValues("month");
    const day = res.fields.getTextInputValue("day").padStart(2, "0");
    const year = res.fields.getTextInputValue("year") || "0069";

    if (!parseInt(day) || isNaN(parseInt(day)) || parseInt(day) < 1) {
      return res.reply({
        embeds: [new ErrorEmbed("invalid day")],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!parseInt(year) || isNaN(parseInt(year)) || parseInt(year) < 1) {
      return res.reply({
        embeds: [new ErrorEmbed("invalid year")],
        flags: MessageFlags.Ephemeral,
      });
    }
    birthday = new Date(`${year}-${month}-${day}`);

    if (isNaN(birthday.getTime()))
      return res.reply({
        embeds: [new ErrorEmbed("invalid date")],
        flags: MessageFlags.Ephemeral,
      });

    const yearSet = birthday.getFullYear() !== 69;

    birthday = dayjs(birthday)
      .set("hours", 0)
      .set("minute", 0)
      .set("second", 0)
      .set("millisecond", 0)
      .toDate();

    const years = dayjs().diff(birthday, "years");

    if (years < 13)
      return res.reply({
        embeds: [new ErrorEmbed("you must be at least 13 to use discord")],
        flags: MessageFlags.Ephemeral,
      });

    if (years > 60 && yearSet)
      return res.reply({
        embeds: [new ErrorEmbed("HAHAHA")],
        flags: MessageFlags.Ephemeral,
      });

    if (message.author.createdTimestamp > Date.now() - ms("30 days"))
      return res.reply({
        embeds: [new ErrorEmbed("your account is too new to use this feature ☹️")],
        flags: MessageFlags.Ephemeral,
      });

    const birthdayCheck = await getBirthday(message.member);

    if (birthdayCheck)
      return res.reply({
        embeds: [
          new ErrorEmbed(
            "you already have a birthday set\n\nsend me a DM to create a support ticket if this is an error",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });

    row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("confirm").setLabel("confirm").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("cancel").setLabel("cancel").setStyle(ButtonStyle.Danger),
    );

    await res.deferUpdate();

    msg = await res.editReply({
      embeds: [
        new CustomEmbed(
          message.member,
          `confirm that your birthday is **${await getFormattedBirthday(birthday)}**${yearSet ? `, you are ${years} years old` : ""}`,
        ),
      ],
      components: [row],
    });

    interaction = await msg
      .awaitMessageComponent({
        filter: (i) => i.user.id === message.author.id,
        time: 30000,
        componentType: ComponentType.Button,
      })
      .catch(() => {
        row.components.forEach((b) => b.setDisabled(true));
        msg.edit({ components: [row] });
      });

    if (!interaction) return;

    if (interaction.customId === "confirm") {
      await setBirthday(message.member, birthday);

      interaction.update({
        embeds: [
          new CustomEmbed(
            message.member,
            `your birthday has been set to **${await getFormattedBirthday(birthday)}**`,
          ),
        ],
        components: [],
      });
    } else {
      row.components.forEach((b) => b.setDisabled(true));
      interaction.update({ components: [row] });
    }
  }
}

cmd.setRun(run);

module.exports = cmd;

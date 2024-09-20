import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  Channel,
  CommandInteraction,
  ComponentType,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { setBirthdayChannel } from "../utils/functions/guilds/birthday";
import {
  getBirthday,
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
);

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

  if (args.length === 0) {
    const birthday = await getBirthday(message.author.id);

    const embed = new CustomEmbed(
      message.member,
      birthday
        ? `your birthday is ${dayjs(birthday).format("MMMM D, YYYY")}\n\n`
        : "" +
          "/**birthday set <YYYY-MM-DD>** *set your birthday*\n" +
          "/**birthday toggle** *enable/disable your birthday from being announced in servers*\n" +
          "/**birthday channel <channel>** *set a channel to be used as the birthday announcement channel*\n" +
          "/**birthday disable** *disable birthday announcements in your server*",
    );

    return send({ embeds: [embed] });
  }

  if (args[0].toLowerCase() === "set") {
    if (args.length === 1) {
      return send({ embeds: [new ErrorEmbed("you forgot your birthday..... idiot.....")] });
    }

    let birthday = new Date(args[1]);

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

    const birthdayCheck = await getBirthday(message.author.id);

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
      await setBirthday(message.author.id, birthday);

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
  } else if (args[0].toLowerCase() === "toggle") {
    const current = await isBirthdayEnabled(message.author.id);

    await setBirthdayEnabled(message.author.id, !current);

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
  } else if (args[0].toLowerCase() === "disable") {
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
  } else if (args[0].toLowerCase() === "channel") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return;

    if (args.length === 1)
      return send({ embeds: [new ErrorEmbed("you forgot the channel you silly little guy!!!!")] });

    let channel: string | Channel = args[1];

    if (!message.guild.channels.cache.get(channel)) {
      if (!message.mentions.channels.first()) {
        return message.channel.send({
          embeds: [
            new ErrorEmbed(
              "you need to mention a channel, you can use the channel ID, or mention the channel by putting a # before the channel name",
            ),
          ],
        });
      } else {
        channel = message.mentions.channels.first();
      }
    } else {
      channel = message.guild.channels.cache.find((ch) => ch.id == channel);
    }

    if (!channel) {
      return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
    }

    if (!channel.isTextBased()) {
      return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
    }

    if (channel.isDMBased()) return;

    if (channel.isThread()) {
      return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
    }

    let fail = false;

    const hook = await channel
      .createWebhook({
        name: "nypsi",
        avatar: channel.client.user.avatarURL(),
      })
      .catch((e) => {
        fail = true;
        message.channel.send({
          embeds: [
            new ErrorEmbed(
              "i was unable to make a webhook in that channel, please check my permissions\n" +
                `\`\`\`${e.rawError.message}\`\`\``,
            ),
          ],
        });
      });

    if (fail) return;
    if (!hook) return;

    await setBirthdayChannel(message.guild.id, hook.url);

    return message.channel.send({
      embeds: [
        new CustomEmbed(message.member, `birthday announcements set to ${channel.toString()}`),
      ],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;

import { DMSettings } from "@prisma/client";
import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import redis from "../init/redis";
import { NypsiClient } from "../models/Client";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { calcMaxBet, getDefaultBet, getRequiredBetForXp, setDefaultBet } from "../utils/functions/economy/balance";
import { isPassive, setPassive } from "../utils/functions/economy/passive";
import { createUser, formatNumber, userExists } from "../utils/functions/economy/utils";
import { setSlashOnly } from "../utils/functions/guilds/slash";
import { cleanString } from "../utils/functions/string";
import { checkPurchases, getEmail, setEmail } from "../utils/functions/users/email";
import { getLastfmUsername, setLastfmUsername } from "../utils/functions/users/lastfm";
import { getDmSettings, getNotificationsData, updateDmSettings } from "../utils/functions/users/notifications";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import ms = require("ms");

const cmd = new Command("settings", "manage nypsi settings for your server and you", Categories.UTILITY);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommandGroup((me) =>
    me
      .setName("me")
      .setDescription("modify your own settings")
      .addSubcommand((notifications) =>
        notifications.setName("notifications").setDescription("manage your notifications settings")
      )
      .addSubcommand((passive) =>
        passive
          .setName("passive")
          .setDescription("enable/disasble passive mode")
          .addStringOption((option) =>
            option
              .setName("toggle")
              .setDescription("on/off")
              .setChoices({ name: "on", value: "on" }, { name: "off", value: "off" })
          )
      )
      .addSubcommand((defaultbet) =>
        defaultbet
          .setName("defaultbet")
          .setDescription("set or reset your default bet")
          .addStringOption((option) =>
            option.setName("bet").setDescription("type reset to disable your default bet").setRequired(false)
          )
      )
      .addSubcommand((email) => email.setName("email").setDescription("get/set your email for purchases"))
  )
  .addSubcommand((lastfm) =>
    lastfm
      .setName("lastfm")
      .setDescription("set your last.fm username")
      .addStringOption((option) => option.setName("username").setDescription("your username on last.fm").setRequired(false))
  )
  .addSubcommandGroup((server) =>
    server
      .setName("server")
      .setDescription("modify settings for the server")
      .addSubcommand((slashonly) =>
        slashonly
          .setName("slash-only")
          .setDescription("set the server to only use slash commands")
          .addBooleanOption((option) => option.setName("value").setDescription("yes/no").setRequired(true))
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

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed] });
  }

  await addCooldown(cmd.name, message.member, 5);

  const showDmSettings = async (settingId?: string) => {
    const notificationsData = getNotificationsData();

    const showSetting = async (
      settings: DMSettings,
      settingId: string,
      options: StringSelectMenuOptionBuilder[],
      msg?: Message
    ) => {
      const embed = new CustomEmbed(message.member).setHeader(notificationsData[settingId].name);

      embed.setDescription(
        // @ts-expect-error loser
        notificationsData[settingId].description.replace("{VALUE}", settings[settingId].toLocaleString())
      );

      const userSelection = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("enable-setting").setLabel("enable").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("disable-setting").setLabel("disable").setStyle(ButtonStyle.Danger)
      );

      // @ts-expect-error hate life innit
      if (typeof settings[settingId] === "number") {
        const boobies = [
          new ButtonBuilder().setCustomId("enable").setLabel("set value").setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("disable")
            .setLabel("disable")
            .setStyle(ButtonStyle.Danger)
            // @ts-expect-error gay
            .setDisabled(settings[settingId] === 0),
        ];

        userSelection.setComponents(boobies);
      } else if (notificationsData[settingId].types) {
        const boobies: StringSelectMenuOptionBuilder[] = [];

        for (const type of notificationsData[settingId].types) {
          const option = new StringSelectMenuOptionBuilder()
            .setLabel(type.name)
            .setDescription(type.description)
            .setValue(type.value);

          //@ts-expect-error silly ts
          if (settings[settingId] == type.value) {
            option.setDefault(true);
          }

          boobies.push(option);
        }

        userSelection.setComponents(new StringSelectMenuBuilder().setCustomId("typesetting").setOptions(boobies));
      } else {
        // @ts-expect-error annoying grr
        if (settings[settingId]) {
          userSelection.components[0].setDisabled(true);
        } else {
          userSelection.components[1].setDisabled(true);
        }
      }

      if (!msg) {
        return await send({
          embeds: [embed],
          components: [
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new StringSelectMenuBuilder().setCustomId("setting").setOptions(options)
            ),
            userSelection,
          ],
        });
      } else {
        return await msg.edit({
          embeds: [embed],
          components: [
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new StringSelectMenuBuilder().setCustomId("setting").setOptions(options)
            ),
            userSelection,
          ],
        });
      }
    };

    let settings = await getDmSettings(message.member);

    const options: StringSelectMenuOptionBuilder[] = [];

    for (const settingId of Object.keys(notificationsData)) {
      options.push(new StringSelectMenuOptionBuilder().setValue(settingId).setLabel(notificationsData[settingId].name));
    }

    if (settingId) {
      options.find((o) => o.data.value == settingId).setDefault(true);
    } else {
      options[0].setDefault(true);
    }

    let msg = await showSetting(settings, settingId || options[0].data.value, options);

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
      const res = await msg.awaitMessageComponent({ filter, time: 30_000 }).catch(() => {});

      if (!res) {
        msg.edit({ components: [] });
        return;
      }

      if (res.isStringSelectMenu() && res.customId == "setting") {
        for (const option of options) {
          option.setDefault(false);

          if (option.data.value == res.values[0]) option.setDefault(true);
        }

        await res.deferUpdate();

        msg = await showSetting(settings, res.values[0], options, res.message);
        return pageManager();
      } else if (res.isStringSelectMenu() && res.customId == "typesetting") {
        const selected = options.find((o) => o.data.default).data.value;
        const value = notificationsData[selected].types.find((x) => x.value == res.values[0]);

        // @ts-expect-error silly ts
        settings[selected] = value.value;
        await res.deferUpdate();

        settings = await updateDmSettings(message.member, settings);
        msg = await showSetting(settings, selected, options, res.message);

        return pageManager();
      } else if (res.customId.startsWith("enable")) {
        const selected = options.find((o) => o.data.default).data.value;

        // @ts-expect-error grr
        if (typeof settings[selected] == "number") {
          const modal = new ModalBuilder().setCustomId("settings-update").setTitle("net worth notifications");

          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("val")
                .setLabel("amount to be notified for")
                .setPlaceholder("number")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(0)
            )
          );

          await res.showModal(modal);

          const filter = (i: Interaction) => i.user.id == res.user.id;

          const modalResponse = await res.awaitModalSubmit({ filter, time: 120000 }).catch(() => {});

          if (!modalResponse) return;

          if (!modalResponse.isModalSubmit()) return;

          const value = formatNumber(modalResponse.fields.fields.first().value.toLowerCase());

          if (typeof value !== "number") {
            await modalResponse.reply({ embeds: [new ErrorEmbed("invalid value. must a number. use 0 to disable")] });
          } else {
            // @ts-expect-error ts is a loser !
            settings[selected] = value;
            await modalResponse.deferUpdate();
          }
        } else {
          // @ts-expect-error doesnt like doing this!
          settings[selected] = true;
          await res.deferUpdate();
        }

        settings = await updateDmSettings(message.member, settings);
        msg = await showSetting(settings, selected, options, res.message);

        return pageManager();
      } else if (res.customId.startsWith("disable")) {
        const selected = options.find((o) => o.data.default).data.value;

        await res.deferUpdate();

        // @ts-expect-error doesnt like doing this!
        if (typeof settings[selected] === "number") {
          // @ts-expect-error doesnt like doing this!
          settings[selected] = 0;
        } else {
          // @ts-expect-error doesnt like doing this!
          settings[selected] = false;
        }

        settings = await updateDmSettings(message.member, settings);
        msg = await showSetting(settings, selected, options, res.message);

        return pageManager();
      }
    };

    return pageManager();
  };

  const defaultBet = async () => {
    if (!(await userExists(message.member))) await createUser(message.member);

    const defaultBet = await getDefaultBet(message.member);

    if (args.length == 2) {
      const requiredBet = await getRequiredBetForXp(message.member);

      if (!defaultBet) {
        const embed = new CustomEmbed(message.member).setHeader("default bet", message.author.avatarURL());

        embed.setDescription(
          "you do not currently have a default bet. use `/settings me defaultbet <amount/reset>` to set your default bet\n\n" +
            `you must bet at least $**${requiredBet.toLocaleString()}** to earn xp`
        );

        return send({ embeds: [embed] });
      } else {
        const embed = new CustomEmbed(message.member).setHeader("default bet", message.author.avatarURL());

        embed.setDescription(
          `your default bet is $**${defaultBet.toLocaleString()}**` +
            "\n\nuse `/settings me defaultbet <amount/reset>` to change this\n" +
            `you must bet at least $**${requiredBet.toLocaleString()}** to earn xp`
        );

        return send({ embeds: [embed] });
      }
    }

    if (args[2].toLocaleLowerCase() == "reset") {
      await setDefaultBet(message.member, null);

      const embed = new CustomEmbed(message.member);

      embed.setDescription(":white_check_mark: your default bet has been reset");

      return send({ embeds: [embed] });
    }

    const maxBet = await calcMaxBet(message.member);

    const bet = formatNumber(args[2]);

    if (!bet || isNaN(bet)) {
      return send({ embeds: [new ErrorEmbed("invalid amount")] });
    }

    if (bet <= 0) {
      return send({ embeds: [new ErrorEmbed("your default bet must be greater than 0")] });
    }

    if (bet > maxBet) {
      return send({
        embeds: [
          new ErrorEmbed(`your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`),
        ],
      });
    }

    await addCooldown(cmd.name, message.member, 5);

    await setDefaultBet(message.member, bet);

    const embed = new CustomEmbed(message.member);

    embed.setDescription(`:white_check_mark: your default bet has been set to $${bet.toLocaleString()}`);

    return send({ embeds: [embed] });
  };

  const slashOnly = async () => {
    if (message.author.id != message.guild.ownerId) {
      return send({ embeds: [new ErrorEmbed("you must be the server owner to do this")] });
    }

    if (message instanceof Message) {
      return await send({ embeds: [new ErrorEmbed("please use /settings server slash-only")] });
    }

    if (!message.isChatInputCommand()) return;

    await setSlashOnly(message.guild, message.options.getBoolean("value"));

    return await send({
      embeds: [
        new CustomEmbed(
          message.member,
          `✅ this server will now use ${
            message.options.getBoolean("value") ? "slash commands only" : "slash commands and message commands"
          }`
        ),
      ],
    });
  };

  const setLastFm = async () => {
    if (args.length == 2) {
      const embed = new CustomEmbed(message.member);

      const username = await getLastfmUsername(message.member);

      if (username) {
        embed.setDescription(`your last.fm username is set to \`${username}\``);
      } else {
        embed.setDescription("your username has not been set, /settings me lastfm");
      }

      return message.channel.send({ embeds: [embed] });
    }

    const res = await setLastfmUsername(message.member, args[2]);

    const embed = new CustomEmbed(message.member);

    if (res) {
      embed.setDescription(`your last.fm username has been set to \`${cleanString(args[2])}\``);
    } else {
      embed.setDescription(`\`${cleanString(args[2])}\` is not a valid last.fm username`);
    }

    return send({ embeds: [embed] });
  };

  const doEmail = async () => {
    const email = await getEmail(message.author.id);

    const embed = new CustomEmbed(message.member);
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("setemail").setLabel("set email").setStyle(ButtonStyle.Success)
    );

    if (email) {
      embed.setDescription(
        "your email has been set. if you would like to view it, use the button below. this will be sent in your dms."
      );
      row.addComponents(new ButtonBuilder().setCustomId("viewemail").setLabel("view email").setStyle(ButtonStyle.Danger));
    } else {
      embed.setDescription(
        "your email as not been set. use the button to set it below via form. this will not be shared with anyone.\n\nnypsi uses your email address for purchases only. if you do not intend to make any purchases, do not set your email address."
      );
    }

    const msg = await send({ embeds: [embed], components: [row] });

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const res = await msg.awaitMessageComponent({ filter, time: 15_000 }).catch(() => {});

    if (!res || !res.isButton()) {
      return msg.edit({ components: [] });
    }

    if (res.customId == "viewemail") {
      await res.deferUpdate();

      let fail = false;

      await message.author.send({ embeds: [new CustomEmbed(message.member, `your email: \`${email}\``)] }).catch(() => {
        fail = true;
      });

      if (fail) {
        return msg.edit({
          embeds: [new CustomEmbed(message.member, "please turn on your direct messages")],
          components: [],
        });
      }

      return msg.edit({ embeds: [new CustomEmbed(message.member, "sent in dms")], components: [] });
    } else if (res.customId == "setemail") {
      const modal = new ModalBuilder()
        .setCustomId("email")
        .setTitle("email")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("emailtext")
              .setLabel("enter your email below")
              .setPlaceholder("nypsi@example.com")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(50)
          )
        );

      await res.showModal(modal);

      const modalSubmit = await res.awaitModalSubmit({ filter, time: 90_000 }).catch(() => {});

      if (!modalSubmit) return;

      if (!modalSubmit.isModalSubmit()) return;

      const value = modalSubmit.fields.fields.first().value;

      if (!value) return;

      let fail = false;

      await modalSubmit.deferUpdate();

      await setEmail(message.author.id, value.toLowerCase()).catch(() => {
        fail = true;
      });

      if (fail) {
        return res.message.edit({ embeds: [new ErrorEmbed("that email has already been set")], components: [] });
      }

      checkPurchases(message.author.id, message.client as NypsiClient);

      return res.message.edit({ embeds: [new CustomEmbed(message.member, "✅ your email has been set")], components: [] });
    }
  };

  const doPassiveMode = async () => {
    const enabled = await isPassive(message.member);
    if (args.length === 2) {
      return send({
        embeds: [
          new CustomEmbed(message.member, enabled ? "you are currently in passive mode" : "you are not in passive mode"),
        ],
      });
    }

    if (args[2].toLowerCase() === "on") {
      if (await redis.exists(`cd:passive_toggle:${message.author.id}`)) {
        return send({ embeds: [new ErrorEmbed("you have already toggled passive mode recently")] });
      }
      await setPassive(message.member, true);
      await redis.set(`cd:passive_toggle:${message.author.id}`, "boobs");
      await redis.expire(`cd:passive_toggle:${message.author.id}`, Math.floor(ms("20 minutes") / 1000));
      return send({
        embeds: [
          new CustomEmbed(message.member, "you are now in passive mode").addField(
            "effects",
            " - cannot be robbed\n - reduced multiplier\n - reduced xp gain"
          ),
        ],
      });
    } else if (args[2].toLowerCase() === "off") {
      if (await redis.exists(`cd:passive_toggle:${message.author.id}`)) {
        return send({ embeds: [new ErrorEmbed("you have already toggled passive mode recently")] });
      }
      await setPassive(message.member, false);
      await redis.set(`cd:passive_toggle:${message.author.id}`, "boobs");
      await redis.expire(`cd:passive_toggle:${message.author.id}`, Math.floor(ms("20 minutes") / 1000));
      return send({ embeds: [new CustomEmbed(message.member, "you are no longer in passive mode and can be robbed")] });
    }
  };

  if (args.length == 0) {
    return send({ embeds: [new CustomEmbed(message.member, "/settings me\n/settings server")] });
  } else if (args[0].toLowerCase() == "me") {
    if (args[1].toLowerCase() == "notifications") {
      return showDmSettings();
    } else if (args[1].toLowerCase() == "defaultbet") {
      return defaultBet();
    } else if (args[1].toLowerCase() == "lastfm") {
      return setLastFm();
    } else if (args[1].toLowerCase() == "email") {
      return doEmail();
    } else if (args[1].toLowerCase() == "passive") {
      return doPassiveMode();
    }
  } else if (args[0].toLowerCase() == "server") {
    if (args[1].toLowerCase() == "slash-only") {
      return slashOnly();
    }
  }
}

cmd.setRun(run);

module.exports = cmd;

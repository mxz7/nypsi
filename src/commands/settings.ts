import { DMSettings, Preferences } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Channel,
  CommandInteraction,
  Interaction,
  Message,
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
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import {
  calcMaxBet,
  getDefaultBet,
  getRequiredBetForXp,
  setDefaultBet,
} from "../utils/functions/economy/balance";
import { isPassive, setPassive } from "../utils/functions/economy/passive";
import { createUser, formatNumber, userExists } from "../utils/functions/economy/utils";
import { setAltPunish } from "../utils/functions/guilds/altpunish";
import { getDisabledChannels, setDisabledChannels } from "../utils/functions/guilds/channels";
import { setSlashOnly } from "../utils/functions/guilds/slash";
import { getPrefix, setPrefix } from "../utils/functions/guilds/utils";
import {
  getLogsChannelHook,
  getModLogsHook,
  setLogsChannelHook,
  setModLogs,
} from "../utils/functions/moderation/logs";
import { cleanString } from "../utils/functions/string";
import { checkPurchases, getEmail, setEmail } from "../utils/functions/users/email";
import { getLastfmUsername, setLastfmUsername } from "../utils/functions/users/lastfm";
import {
  getDmSettings,
  getNotificationsData,
  getPreferences,
  getPreferencesData,
  updateDmSettings,
  updatePreferences,
} from "../utils/functions/users/notifications";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import ms = require("ms");

const cmd = new Command("settings", "manage nypsi settings for your server and you", "utility");

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommandGroup((me) =>
    me
      .setName("me")
      .setDescription("modify your own settings")
      .addSubcommand((notifications) =>
        notifications.setName("notifications").setDescription("manage your notifications settings"),
      )
      .addSubcommand((notifications) =>
        notifications.setName("preferences").setDescription("manage your personal preferences"),
      )
      .addSubcommand((passive) =>
        passive
          .setName("passive")
          .setDescription("enable/disable passive mode")
          .addStringOption((option) =>
            option
              .setName("toggle")
              .setDescription("on/off")
              .setChoices({ name: "on", value: "on" }, { name: "off", value: "off" }),
          ),
      )
      .addSubcommand((defaultbet) =>
        defaultbet
          .setName("defaultbet")
          .setDescription("set or reset your default bet")
          .addStringOption((option) =>
            option
              .setName("bet")
              .setDescription("type reset to disable your default bet")
              .setRequired(false),
          ),
      )
      .addSubcommand((email) =>
        email.setName("email").setDescription("get/set your email for purchases"),
      )
      .addSubcommand((lastfm) =>
        lastfm
          .setName("lastfm")
          .setDescription("set your last.fm username")
          .addStringOption((option) =>
            option
              .setName("username")
              .setDescription("your username on last.fm")
              .setRequired(false),
          ),
      ),
  )

  .addSubcommandGroup((server) =>
    server
      .setName("server")
      .setDescription("modify settings for the server")
      .addSubcommand((slashonly) =>
        slashonly
          .setName("slash-only")
          .setDescription("set the server to only use slash commands")
          .addBooleanOption((option) =>
            option.setName("value").setDescription("yes/no").setRequired(true),
          ),
      )
      .addSubcommand((altpunish) =>
        altpunish
          .setName("alt-punish")
          .setDescription("automatically punish a user's alts set with $alts when punished")
          .addBooleanOption((option) =>
            option.setName("value").setDescription("yes/no").setRequired(true),
          ),
      )
      .addSubcommand((disableChannels) =>
        disableChannels
          .setName("disabled-channels")
          .setDescription("configure the disabled channels in the server")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("toggle the channel's disabled status")
              .setRequired(false),
          ),
      )
      .addSubcommand((modlogs) =>
        modlogs
          .setName("modlogs")
          .setDescription("set the modlogs channel in the server")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("select the channel for modlogs")
              .setRequired(false),
          ),
      )
      .addSubcommand((logs) =>
        logs
          .setName("logs")
          .setDescription("set the logs channel in the server")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("select the channel for logs")
              .setRequired(false),
          ),
      )
      .addSubcommand((prefix) =>
        prefix
          .setName("prefix")
          .setDescription("manage nypsi prefixes")
          .addStringOption((option) =>
            option
              .setName("prefix")
              .setDescription("toggle a prefix on/off")
              .setRequired(false)
              .setMaxLength(3),
          ),
      ),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  await addCooldown(cmd.name, message.member, 5);

  const showDmSettings = async (settingId?: string) => {
    const notificationsData = getNotificationsData();

    const showSetting = async (
      settings: DMSettings,
      settingId: string,
      options: StringSelectMenuOptionBuilder[],
      msg?: Message,
    ) => {
      const embed = new CustomEmbed(message.member).setHeader(notificationsData[settingId].name);

      embed.setDescription(
        notificationsData[settingId].description.replace(
          "{VALUE}",
          // @ts-expect-error loser
          settings[settingId].toLocaleString(),
        ),
      );

      const userSelection = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("enable-setting")
          .setLabel("enable")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("disable-setting")
          .setLabel("disable")
          .setStyle(ButtonStyle.Danger),
      );

      // @ts-expect-error hate life innit
      if (typeof settings[settingId] === "number" || typeof settings[settingId] === "bigint") {
        const boobies = [
          new ButtonBuilder()
            .setCustomId("enable")
            .setLabel("set value")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("disable")
            .setLabel("disable")
            .setStyle(ButtonStyle.Danger)
            // @ts-expect-error gay
            .setDisabled(settings[settingId] === 0 || settings[settingId] === 0n),
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

        userSelection.setComponents(
          new StringSelectMenuBuilder().setCustomId("typesetting").setOptions(boobies),
        );
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
              new StringSelectMenuBuilder().setCustomId("setting").setOptions(options),
            ),
            userSelection,
          ],
        });
      } else {
        return await msg.edit({
          embeds: [embed],
          components: [
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new StringSelectMenuBuilder().setCustomId("setting").setOptions(options),
            ),
            userSelection,
          ],
        });
      }
    };

    let settings = await getDmSettings(message.member);

    const options: StringSelectMenuOptionBuilder[] = [];

    for (const settingId of Object.keys(notificationsData)) {
      options.push(
        new StringSelectMenuOptionBuilder()
          .setValue(settingId)
          .setLabel(notificationsData[settingId].name),
      );
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
          const modal = new ModalBuilder()
            .setCustomId("settings-update")
            .setTitle("net worth notifications");

          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("val")
                .setLabel("amount to be notified for")
                .setPlaceholder("number")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(0),
            ),
          );

          await res.showModal(modal);

          const filter = (i: ModalSubmitInteraction) =>
            i.user.id == res.user.id && i.customId === "settings-update";

          const modalResponse = await res
            .awaitModalSubmit({ filter, time: 120000 })
            .catch(() => {});

          if (!modalResponse) return;

          if (!modalResponse.isModalSubmit()) return;

          const value = formatNumber(modalResponse.fields.fields.first().value.toLowerCase());

          if (typeof value !== "number" || value < 0) {
            await modalResponse.reply({
              embeds: [new ErrorEmbed("invalid value. must a number. use 0 to disable")],
              flags: MessageFlags.Ephemeral,
            });
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
        if (typeof settings[selected] === "number" || typeof settings[selected] === "bigint") {
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

  const showPreferences = async (settingId?: string) => {
    const preferencesData = getPreferencesData();

    const showSetting = async (
      settings: Preferences,
      settingId: string,
      options: StringSelectMenuOptionBuilder[],
      msg?: Message,
    ) => {
      const embed = new CustomEmbed(message.member).setHeader(preferencesData[settingId].name);

      embed.setDescription(
        preferencesData[settingId].description.replace(
          "{VALUE}",
          // @ts-expect-error loser
          settings[settingId].toLocaleString(),
        ),
      );

      const userSelection = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("enable-setting")
          .setLabel("enable")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("disable-setting")
          .setLabel("disable")
          .setStyle(ButtonStyle.Danger),
      );

      // @ts-expect-error hate life innit
      if (typeof settings[settingId] === "number" || typeof settings[settingId] === "bigint") {
        const boobies = [
          new ButtonBuilder()
            .setCustomId("enable")
            .setLabel("set value")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("disable")
            .setLabel("disable")
            .setStyle(ButtonStyle.Danger)
            // @ts-expect-error gay
            .setDisabled(settings[settingId] === 0 || settings[settingId] === 0n),
        ];

        userSelection.setComponents(boobies);
      } else if (preferencesData[settingId].types) {
        const boobies: StringSelectMenuOptionBuilder[] = [];

        for (const type of preferencesData[settingId].types) {
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

        userSelection.setComponents(
          new StringSelectMenuBuilder().setCustomId("typesetting").setOptions(boobies),
        );
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
              new StringSelectMenuBuilder().setCustomId("setting").setOptions(options),
            ),
            userSelection,
          ],
        });
      } else {
        return await msg.edit({
          embeds: [embed],
          components: [
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new StringSelectMenuBuilder().setCustomId("setting").setOptions(options),
            ),
            userSelection,
          ],
        });
      }
    };

    let settings = await getPreferences(message.member);

    const options: StringSelectMenuOptionBuilder[] = [];

    for (const settingId of Object.keys(preferencesData)) {
      options.push(
        new StringSelectMenuOptionBuilder()
          .setValue(settingId)
          .setLabel(preferencesData[settingId].name),
      );
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
        const value = preferencesData[selected].types.find((x) => x.value == res.values[0]);

        // @ts-expect-error silly ts
        settings[selected] = value.value;
        await res.deferUpdate();

        settings = await updatePreferences(message.member, settings);
        msg = await showSetting(settings, selected, options, res.message);

        return pageManager();
      } else if (res.customId.startsWith("enable")) {
        const selected = options.find((o) => o.data.default).data.value;

        // @ts-expect-error grr
        if (typeof settings[selected] == "number" || typeof settings[selected] === "bigint") {
          const modal = new ModalBuilder().setCustomId("settings-update").setTitle("update amount");

          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("val")
                .setLabel(
                  selected === "marketDelay" ? "time in seconds" : "amount to be notified for",
                )
                .setPlaceholder("number")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(0),
            ),
          );

          await res.showModal(modal);

          const filter = (i: ModalSubmitInteraction) =>
            i.user.id == res.user.id && i.customId === "settings-update";

          const modalResponse = await res
            .awaitModalSubmit({ filter, time: 120000 })
            .catch(() => {});

          if (!modalResponse) return;

          if (!modalResponse.isModalSubmit()) return;

          const value = formatNumber(modalResponse.fields.fields.first().value.toLowerCase());

          if (typeof value !== "number" || value < 0) {
            await modalResponse.reply({
              embeds: [new ErrorEmbed("invalid value. must a number.")],
              flags: MessageFlags.Ephemeral,
            });
          } else if (selected === "marketDelay" && value > 86400) {
            await modalResponse.reply({
              embeds: [new ErrorEmbed("must be less than 24 hours")],
              flags: MessageFlags.Ephemeral,
            });
          } else if (selected === "marketDelay" && value < 60) {
            await modalResponse.reply({
              embeds: [new ErrorEmbed("must be more than 1 minute")],
              flags: MessageFlags.Ephemeral,
            });
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

        settings = await updatePreferences(message.member, settings);
        msg = await showSetting(settings, selected, options, res.message);

        return pageManager();
      } else if (res.customId.startsWith("disable")) {
        const selected = options.find((o) => o.data.default).data.value;

        await res.deferUpdate();

        if (selected === "marketDelay") {
          settings[selected] = 300;
        } else if (
          // @ts-expect-error doesnt like doing this!
          typeof settings[selected] === "number" ||
          // @ts-expect-error doesnt like doing this!
          typeof settings[selected] === "bigint"
        ) {
          // @ts-expect-error doesnt like doing this!
          settings[selected] = 0;
        } else {
          // @ts-expect-error doesnt like doing this!
          settings[selected] = false;
        }

        settings = await updatePreferences(message.member, settings);
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
        const embed = new CustomEmbed(message.member).setHeader(
          "default bet",
          message.author.avatarURL(),
        );

        embed.setDescription(
          "you do not currently have a default bet. use `/settings me defaultbet <amount/reset>` to set your default bet\n\n" +
            `you must bet at least $**${requiredBet.toLocaleString()}** to earn xp`,
        );

        return send({ embeds: [embed] });
      } else {
        const embed = new CustomEmbed(message.member).setHeader(
          "default bet",
          message.author.avatarURL(),
        );

        embed.setDescription(
          `your default bet is $**${defaultBet.toLocaleString()}**` +
            "\n\nuse `/settings me defaultbet <amount/reset>` to change this\n" +
            `you must bet at least $**${requiredBet.toLocaleString()}** to earn xp`,
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
          new ErrorEmbed(
            `your max bet is $**${maxBet.toLocaleString()}**\nyou can upgrade this by prestiging and voting`,
          ),
        ],
      });
    }

    await addCooldown(cmd.name, message.member, 5);

    await setDefaultBet(message.member, bet);

    const embed = new CustomEmbed(message.member);

    embed.setDescription(
      `:white_check_mark: your default bet has been set to $${bet.toLocaleString()}`,
    );

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
            message.options.getBoolean("value")
              ? "slash commands only"
              : "slash commands and message commands"
          }`,
        ),
      ],
    });
  };

  const altPunish = async () => {
    if (message.author.id != message.guild.ownerId) {
      return send({ embeds: [new ErrorEmbed("you must be the server owner to do this")] });
    }

    if (message instanceof Message) {
      return await send({ embeds: [new ErrorEmbed("please use /settings server alt-punish")] });
    }

    if (!message.isChatInputCommand()) return;

    await setAltPunish(message.guild, message.options.getBoolean("value"));

    return await send({
      embeds: [
        new CustomEmbed(
          message.member,
          `✅ ${
            message.options.getBoolean("value")
              ? "alts will be automatically punished as a group\n\n[more info](https://nypsi.xyz/docs/moderation/alt-punish?ref=bot-help)"
              : "alts will not be automatically punished as a group\n\n[more info](https://nypsi.xyz/docs/moderation/alt-punish?ref=bot-help)"
          }`,
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

      return send({ embeds: [embed] });
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
    const email = await getEmail(message.member);

    const embed = new CustomEmbed(message.member);
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("setemail")
        .setLabel("set email")
        .setStyle(ButtonStyle.Success),
    );

    if (email) {
      embed.setDescription(
        "your email has been set. if you would like to view it, use the button below. this will be sent in your dms.",
      );
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("viewemail")
          .setLabel("view email")
          .setStyle(ButtonStyle.Danger),
      );
    } else {
      embed.setDescription(
        "your email as not been set. use the button to set it below via form. this will not be shared with anyone.\n\nnypsi uses your email address for purchases only. if you do not intend to make any purchases, do not set your email address.",
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

      await message.author
        .send({ embeds: [new CustomEmbed(message.member, `your email: \`${email}\``)] })
        .catch(() => {
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
              .setMaxLength(50),
          ),
        );

      await res.showModal(modal);

      const modalSubmit = await res.awaitModalSubmit({ filter, time: 90_000 }).catch(() => {});

      if (!modalSubmit) return;

      if (!modalSubmit.isModalSubmit()) return;

      const value = modalSubmit.fields.fields.first().value;

      if (!value) return;

      let fail = false;

      await modalSubmit.deferUpdate();

      await setEmail(message.member, value.toLowerCase()).catch(() => {
        fail = true;
      });

      if (fail) {
        return res.message.edit({
          embeds: [new ErrorEmbed("that email has already been set")],
          components: [],
        });
      }

      checkPurchases(message.member);

      return res.message.edit({
        embeds: [new CustomEmbed(message.member, "✅ your email has been set")],
        components: [],
      });
    }
  };

  const doPassiveMode = async () => {
    const enabled = await isPassive(message.member);
    if (args.length === 2) {
      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            enabled ? "you are currently in passive mode" : "you are not in passive mode",
          ),
        ],
      });
    }

    if (args[2].toLowerCase() === "on" || args[2].toLowerCase() === "enable") {
      if (await redis.exists(`cd:passive_toggle:${message.author.id}`)) {
        return send({ embeds: [new ErrorEmbed("you have already toggled passive mode recently")] });
      }
      if (await redis.exists(`cd:rob:${message.author.id}`))
        return send({ embeds: [new ErrorEmbed("you have robbed somebody recently")] });
      await setPassive(message.member, true);
      await redis.set(
        `cd:passive_toggle:${message.author.id}`,
        "boobs",
        "EX",
        ms("20 minutes") / 1000,
      );
      return send({
        embeds: [
          new CustomEmbed(message.member, "you are now in passive mode").addField(
            "effects",
            "- cannot be robbed\n- reduced multiplier\n- reduced xp gain\n- reduced cookie production",
          ),
        ],
      });
    } else if (args[2].toLowerCase() === "off" || args[2].toLowerCase() === "disable") {
      if (await redis.exists(`cd:passive_toggle:${message.author.id}`)) {
        return send({ embeds: [new ErrorEmbed("you have already toggled passive mode recently")] });
      }
      await setPassive(message.member, false);
      await redis.set(
        `cd:passive_toggle:${message.author.id}`,
        "boobs",
        "EX",
        ms("20 minutes") / 1000,
      );
      return send({
        embeds: [
          new CustomEmbed(message.member, "you are no longer in passive mode and can be robbed"),
        ],
      });
    } else
      return send({
        embeds: [new ErrorEmbed("/settings me passive on/off")],
      });
  };

  const doDisabledChannels = async () => {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return send({
          embeds: [new ErrorEmbed("you need the `manage server` permission")],
        });
      }
      return;
    }

    let disabledChannels = await getDisabledChannels(message.guild);

    const showChannels = async () => {
      if (disabledChannels.length === 0) {
        return send({
          embeds: [new CustomEmbed(message.member, "there are no disabled channels")],
        });
      }

      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            "disabled channels:\n" + disabledChannels.map((i) => `<#${i}>`).join("\n"),
          ),
        ],
      });
    };

    let updated = false;
    for (const channelId of disabledChannels) {
      if (!message.guild.channels.cache.has(channelId)) {
        updated = true;
        await setDisabledChannels(
          message.guild,
          disabledChannels.filter((c) => c !== channelId),
        );
      }
    }

    if (updated) {
      disabledChannels = await getDisabledChannels(message.guild);
    }

    if (args.length === 2) {
      return showChannels();
    }

    const channel = message.mentions.channels.first();

    if (!channel) {
      return send({ embeds: [new ErrorEmbed("/settings server disabled-channels <channel>")] });
    }

    if (disabledChannels.includes(channel.id)) {
      await setDisabledChannels(
        message.guild,
        disabledChannels.filter((c) => c !== channel.id),
      );
      disabledChannels = await getDisabledChannels(message.guild);

      return showChannels();
    } else {
      await setDisabledChannels(message.guild, [...disabledChannels, channel.id]);
      disabledChannels = await getDisabledChannels(message.guild);

      return showChannels();
    }
  };

  const doModlogs = async () => {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return send({
          embeds: [new ErrorEmbed("you need the `manage server` permission")],
        });
      }
      return;
    }

    if (
      !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageWebhooks) ||
      !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)
    ) {
      return send({
        embeds: [
          new ErrorEmbed(
            "i need the `manage webhooks` and `manage channels` permissions for this command",
          ),
        ],
      });
    }

    if (args.length == 2) {
      const current = await getModLogsHook(message.guild);

      const embed = new CustomEmbed(message.member);

      embed.setHeader("mod logs");

      const notEnabled = `mod logs have not been enabled\n\nuse **/settings server modlogs <channel>** to enable them`;

      if (!current) {
        embed.setDescription(notEnabled);

        return send({ embeds: [embed] });
      } else {
        try {
          const hookMsg = await current.send({ content: "fetching channel..." });

          const channel = message.guild.channels.cache.get(hookMsg.channel_id);

          embed.setDescription(
            `current channel: ${channel ? channel.toString() : `${hookMsg.channel_id}`}\n\n**/settings server modlogs <channel>** to change the channel`,
          );

          try {
            await current.deleteMessage(hookMsg.id);
          } catch {
            // silent fail
          }

          const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("d").setLabel("disable").setStyle(ButtonStyle.Danger),
          );

          const msg = await send({ embeds: [embed], components: [row] });

          const filter = (i: Interaction) => i.user.id == message.author.id;

          const pageManager: any = async () => {
            let fail = false;

            const response = await msg
              .awaitMessageComponent({ filter, time: 60000 })
              .then(async (collected) => {
                await collected.deferUpdate().catch(() => {
                  fail = true;
                  return pageManager();
                });
                return { res: collected.customId };
              })
              .catch(async () => {
                fail = true;
                await msg.edit({ embeds: [embed], components: [] });
              });

            if (fail) return;
            if (!response) return;

            const { res } = response;

            if (res == "d") {
              await setModLogs(message.guild, null);

              embed.setDescription(notEnabled);
              return msg.edit({ embeds: [embed], components: [] });
            }
          };

          return pageManager();
        } catch {
          await setModLogs(message.guild, null);
          embed.setDescription(notEnabled);
          return send({ embeds: [embed] });
        }
      }
    } else {
      let channel: string | Channel = args[0];

      if (!message.guild.channels.cache.get(args[0])) {
        if (!message.mentions.channels.first()) {
          return send({
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

      if (!channel || !channel.isTextBased() || channel.isThread()) {
        return send({ embeds: [new ErrorEmbed("invalid channel")] });
      }

      if (channel.isDMBased()) return;

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
          });
        });

      if (fail) return;
      if (!hook) return;

      await setModLogs(message.guild, hook.url);

      return send({
        embeds: [new CustomEmbed(message.member, `✅ modlogs set to ${channel.toString()}`)],
      });
    }
  };

  const doLogs = async () => {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return send({
          embeds: [new ErrorEmbed("you need the `manage server` permission")],
        });
      }
      return;
    }

    if (
      !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageWebhooks) ||
      !message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)
    ) {
      return send({
        embeds: [
          new ErrorEmbed(
            "i need the `manage webhooks` and `manage channels` permissions for this command",
          ),
        ],
      });
    }

    if (args.length == 2) {
      const current = await getLogsChannelHook(message.guild);

      const embed = new CustomEmbed(message.member);

      embed.setHeader("logs");

      const notEnabled = `logs have not been enabled\n\nuse **/settings server logs <channel>** to enable them`;

      if (!current) {
        embed.setDescription(notEnabled);

        return send({ embeds: [embed] });
      } else {
        try {
          const hookMsg = await current.send({ content: "fetching channel..." });

          const channel = message.guild.channels.cache.get(hookMsg.channel_id);

          embed.setDescription(
            `current channel: ${channel ? channel.toString() : `${hookMsg.channel_id}`}\n\n**/settings server logs <channel>** to change the channel`,
          );

          try {
            await current.deleteMessage(hookMsg.id);
          } catch {
            // silent fail
          }

          const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder().setCustomId("d").setLabel("disable").setStyle(ButtonStyle.Danger),
          );

          const msg = await send({ embeds: [embed], components: [row] });

          const filter = (i: Interaction) => i.user.id == message.author.id;

          const pageManager: any = async () => {
            let fail = false;

            const response = await msg
              .awaitMessageComponent({ filter, time: 60000 })
              .then(async (collected) => {
                await collected.deferUpdate().catch(() => {
                  fail = true;
                  return pageManager();
                });
                return { res: collected.customId };
              })
              .catch(async () => {
                fail = true;
                await msg.edit({ embeds: [embed], components: [] });
              });

            if (fail) return;
            if (!response) return;

            const { res } = response;

            if (res == "d") {
              await setLogsChannelHook(message.guild, null);

              embed.setDescription(notEnabled);
              return msg.edit({ embeds: [embed], components: [] });
            }
          };

          return pageManager();
        } catch {
          await setLogsChannelHook(message.guild, null);
          embed.setDescription(notEnabled);
          return send({ embeds: [embed] });
        }
      }
    } else {
      let channel: string | Channel = args[0];

      if (!message.guild.channels.cache.get(args[0])) {
        if (!message.mentions.channels.first()) {
          return send({
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

      if (!channel || !channel.isTextBased() || channel.isThread()) {
        return send({ embeds: [new ErrorEmbed("invalid channel")] });
      }

      if (channel.isDMBased()) return;

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
          });
        });

      if (fail) return;
      if (!hook) return;

      await setLogsChannelHook(message.guild, hook.url);

      return send({
        embeds: [new CustomEmbed(message.member, `✅ logs channel set to ${channel.toString()}`)],
      });
    }
  };

  const doPrefix = async () => {
    const prefixes = await getPrefix(message.guild);

    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return send({
          embeds: [new ErrorEmbed("you need the `manage server` permission")],
        });
      }
      return;
    }

    if (args.length == 2) {
      const embed = new CustomEmbed(
        message.member,
        "current prefixes: \n" +
          prefixes.map((i) => "`" + i + "`").join("\n") +
          `\n\n**/settings server prefix <prefix>** *toggle a prefix on/off*`,
      ).setHeader("prefix", message.guild.iconURL());

      return send({ embeds: [embed] });
    } else {
      if (prefixes.includes(args[2])) {
        if (prefixes.length === 1)
          return send({
            embeds: [
              new ErrorEmbed("are you really trying to remove your ONLY prefix???").setFooter({
                text: "psst... /settings server slash-only",
              }),
            ],
          });

        const index = prefixes.findIndex((i) => i === args[2]);

        if (index < 0) return send({ embeds: [new ErrorEmbed("couldn't find that prefix")] });

        prefixes.splice(index, 1);

        await setPrefix(message.guild, prefixes);

        return send({ embeds: [new CustomEmbed(message.member, `✅ removed \`${args[2]}\``)] });
      } else {
        if (prefixes.length >= 5)
          return send({ embeds: [new ErrorEmbed("you can have a max of 5 prefixes")] });

        if (args[2].length > 3)
          return send({
            embeds: [new ErrorEmbed("prefix cannot be longer than 3 characters")],
          });

        if (args[2].includes("`") || args[2].includes("*") || args[2].includes("_"))
          return send({
            embeds: [new ErrorEmbed("prefix includes illegal character")],
          });

        prefixes.push(args[2]);

        await setPrefix(message.guild, prefixes);

        return send({
          embeds: [new CustomEmbed(message.member, `✅ added \`${args[2]}\` as a prefix`)],
        });
      }
    }
  };

  if (args.length == 0) {
    return send({ embeds: [new CustomEmbed(message.member, "/settings me\n/settings server")] });
  } else if (args[0].toLowerCase() == "me") {
    if (args[1]?.toLowerCase() == "notifications") {
      return showDmSettings();
    } else if (args[1]?.toLowerCase() == "preferences") {
      return showPreferences();
    } else if (args[1]?.toLowerCase() == "defaultbet") {
      return defaultBet();
    } else if (args[1]?.toLowerCase() == "lastfm") {
      return setLastFm();
    } else if (args[1]?.toLowerCase() == "email") {
      return doEmail();
    } else if (args[1]?.toLowerCase() == "passive") {
      return doPassiveMode();
    } else {
      const subcommands = [
        "notifications",
        "preferences",
        "defaultbet",
        "lastfm",
        "email",
        "passive",
      ];
      return send({
        embeds: [
          new CustomEmbed(message.member, subcommands.map((c) => `/settings me ${c}`).join("\n")),
        ],
      });
    }
  } else if (args[0].toLowerCase() == "server") {
    if (args[1]?.toLowerCase() == "slash-only") {
      return slashOnly();
    } else if (args[1]?.toLowerCase() == "alt-punish") {
      return altPunish();
    } else if (args[1]?.toLowerCase() === "disabled-channels") {
      return doDisabledChannels();
    } else if (args[1]?.toLowerCase() === "modlogs") {
      return doModlogs();
    } else if (args[1]?.toLowerCase() === "logs") {
      return doLogs();
    } else if (args[1]?.toLowerCase() === "prefix") {
      return doPrefix();
    } else {
      const subcommands = ["slash-only", "alt-punish", "disabled-channels", "modlogs"];
      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            subcommands.map((c) => `/settings server ${c}`).join("\n"),
          ),
        ],
      });
    }
  }
}

cmd.setRun(run);

module.exports = cmd;

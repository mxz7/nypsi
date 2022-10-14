import { ActionRowBuilder, ButtonBuilder, SelectMenuBuilder } from "@discordjs/builders";
import { DMSettings } from "@prisma/client";
import {
  BaseMessageOptions,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  SelectMenuOptionBuilder,
} from "discord.js";
import { getDmSettings, getNotificationsData, updateDmSettings } from "../utils/functions/users/notifications";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("settings", "manage nypsi settings for your server and you", Categories.UTILITY);

cmd.slashEnabled = true;
cmd.slashData.addSubcommandGroup((me) =>
  me.addSubcommand((notifications) =>
    notifications.setName("notifications").setDescription("manage your notifications settings")
  )
);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      if (message.deferred) {
        await message.editReply(data);
      } else {
        await message.reply(data as InteractionReplyOptions);
      }
      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  const showDmSettings = async (settingId?: string) => {
    const notificationsData = getNotificationsData();

    const showSetting = async (
      settings: DMSettings,
      settingId: string,
      options: SelectMenuOptionBuilder[],
      msg?: Message
    ) => {
      const embed = new CustomEmbed(message.member).setHeader(notificationsData[settingId].name);

      embed.setDescription(notificationsData[settingId].description);

      const buttons = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("enable-setting").setLabel("enable").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("disable-setting").setLabel("disable").setStyle(ButtonStyle.Danger)
      );

      // @ts-expect-error annoying grr
      if (settings[settingId]) {
        buttons.components[0].setDisabled(true);
      } else {
        buttons.components[1].setDisabled(true);
      }

      if (!msg) {
        return await send({
          embeds: [embed],
          components: [
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new SelectMenuBuilder().setCustomId("setting").setOptions(options)
            ),
            buttons,
          ],
        });
      } else {
        return await msg.edit({
          embeds: [embed],
          components: [
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              new SelectMenuBuilder().setCustomId("setting").setOptions(options)
            ),
            buttons,
          ],
        });
      }
    };

    let settings = await getDmSettings(message.member);

    const options: SelectMenuOptionBuilder[] = [];

    for (const settingId of Object.keys(notificationsData)) {
      options.push(new SelectMenuOptionBuilder().setValue(settingId).setLabel(notificationsData[settingId].name));
    }

    if (settingId) {
      options.find((o) => o.data.value == settingId).setDefault(true);
    } else {
      options[0].setDefault(true);
    }

    let msg = await showSetting(settings, settingId || options[0].data.value, options);

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
      const res = await msg
        .awaitMessageComponent({ filter, time: 30_000 })
        .then(async (i) => {
          await i.deferUpdate();
          return i;
        })
        .catch(() => {});

      if (!res) {
        msg.edit({ components: [] });
        return;
      }

      if (res.isSelectMenu()) {
        for (const option of options) {
          option.setDefault(false);

          if (option.data.value == res.values[0]) option.setDefault(true);
        }

        msg = await showSetting(settings, res.values[0], options, res.message);
        return pageManager();
      } else if (res.customId.startsWith("enable")) {
        const selected = options.find((o) => o.data.default).data.value;

        // @ts-expect-error doesnt like doing this!
        settings[selected] = true;

        settings = await updateDmSettings(message.member, settings);
        msg = await showSetting(settings, selected, options, res.message);

        return pageManager();
      } else if (res.customId.startsWith("disable")) {
        const selected = options.find((o) => o.data.default).data.value;

        // @ts-expect-error doesnt like doing this!
        settings[selected] = false;

        settings = await updateDmSettings(message.member, settings);
        msg = await showSetting(settings, selected, options, res.message);

        return pageManager();
      }
    };

    return pageManager();
  };

  if (args.length == 0) {
    return send({ embeds: [new CustomEmbed(message.member, "/settings me\n/settings server")] });
  } else if (args[0].toLowerCase() == "me") {
    if (args[1].toLowerCase() == "notifications") {
      return showDmSettings();
    }
  }
}

cmd.setRun(run);

module.exports = cmd;

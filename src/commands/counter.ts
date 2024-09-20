import { TrackingType } from "@prisma/client";
import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
  PermissionFlagsBits,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getItems } from "../utils/functions/economy/utils";
import {
  createGuildCounter,
  deleteGuildCounter,
  getGuildCounters,
} from "../utils/functions/guilds/counters";
import { getTier, isPremium } from "../utils/functions/premium/premium";

const cmd = new Command("counter", "create updating count channels for your server", "admin")
  .setAliases(["counters"])
  .setPermissions(["MANAGE_SERVER"]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((del) =>
    del
      .setName("delete")
      .setDescription("delete a guild counter")
      .addChannelOption((option) =>
        option.setName("channel").setDescription("channel to delete").setRequired(true),
      ),
  )
  .addSubcommand((list) => list.setName("list").setDescription("list all active counters"))
  .addSubcommand((create) =>
    create
      .setName("create")
      .setDescription("create a counter")
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription("what would you like to track?")
          .setChoices(
            { name: "member count", value: "MEMBERS" },
            { name: "human count", value: "HUMANS" },
            { name: "boosts", value: "BOOSTS" },
            { name: "richest member in server", value: "RICHEST_MEMBER" },
            { name: "total item of server", value: "TOTAL_ITEM" },
            { name: "total balance of server", value: "TOTAL_BALANCE" },
          )
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("format")
          .setDescription("format of the channel name. use %value% for the number")
          .setMaxLength(50)
          .setRequired(true),
      )
      .addStringOption((option) =>
        option.setName("item-global").setDescription("item to show").setAutocomplete(true),
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

  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return send({ embeds: [new ErrorEmbed("you need the `manage server` permission")] });
    }
    return;
  }

  if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return send({
      embeds: [new ErrorEmbed("i need the `manage channels` permission for this command to work")],
    });
  }

  if (message instanceof Message || !message.isChatInputCommand()) {
    return send({
      embeds: [
        new ErrorEmbed(
          "unfortunately you must use this command as a slash command (/counter) due to the complexities involved",
        ),
      ],
    });
  }

  if (args.length === 0) {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          "**/counters create** *create a counter*\n" +
            "**/counters list** *list all counters*\n" +
            "**/counters delete** *delete a counter*\n" +
            "**/counters setting** *update a setting for a counter*",
        ).setFooter({ text: "counters update every 10 minutes" }),
      ],
    });
  } else if (args[0].toLowerCase() === "list") {
    const counters = await getGuildCounters(message.guild);
    const embed = new CustomEmbed(message.member).setHeader(
      `counters in ${message.guild.name}`,
      message.guild.iconURL(),
    );

    if (counters.length === 0) {
      embed.setDescription("this server has no counters");
    } else {
      for (const counter of counters) {
        const channel = await message.guild.channels.cache.get(counter.channel);
        embed.addField(
          counter.channel,
          `**type** \`${counter.tracks}\` ${
            counter.tracks === TrackingType.TOTAL_ITEM ? `\n**item** \`${counter.totalItem}\`` : ""
          }\n` +
            `**format** ${counter.format}\n` +
            `**channel** ${channel?.toString()}`,
        );
      }
    }

    return send({ embeds: [embed] });
  } else if (args[0].toLowerCase() === "create") {
    const mode = message.options.getString("mode") as TrackingType;
    const format = message.options.getString("format");
    const item = message.options.getString("item-global");

    if (!format.includes("%value%"))
      return send({ embeds: [new ErrorEmbed("invalid format. use %value%")] });

    const counters = await getGuildCounters(message.guild);

    let max = 3;

    if (await isPremium(message.member)) max += await getTier(message.member);

    if (counters.length >= max) {
      return send({
        embeds: [
          new ErrorEmbed(
            `you have reached the limit of counters (\`${max}\`)${
              (await getTier(message.member)) < 4
                ? "\nupgrade your tier (/premium) to get more"
                : ""
            }`,
          ),
        ],
      });
    }

    if (mode == TrackingType.TOTAL_ITEM && (!item || !getItems()[item])) {
      return send({
        embeds: [
          new ErrorEmbed(
            "since you have chosen the mode as total item, you must choose a valid item to show the total of",
          ),
        ],
      });
    }

    const res = await createGuildCounter(message.guild, mode, item, format);

    if (!res)
      return send({
        embeds: [new ErrorEmbed("failed to create counter")],
      });

    return send({ embeds: [new CustomEmbed(message.member, "✅ successfully created counter.")] });
  } else if (args[0].toLowerCase() === "delete") {
    const channel = message.options.getChannel("channel");

    const res = await deleteGuildCounter(channel.id);

    if (!res)
      return send({ embeds: [new ErrorEmbed("that channel does not have a counter tied to it")] });
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          "✅ counter removed, you will have to manually delete the channel",
        ),
      ],
    });
  }
}

cmd.setRun(run);

module.exports = cmd;

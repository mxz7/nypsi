import { CommandInteraction } from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders.js";
import { formatDate } from "../utils/functions/date";
import { getPeaks, updateGuild } from "../utils/functions/guilds/utils";
import { logger } from "../utils/logger";

const cmd = new Command("server", "view information about the server", "info").setAliases([
  "serverinfo",
  "membercount",
]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const server = message.guild;

  await updateGuild(server);

  const created = formatDate(server.createdAt).toLowerCase();

  let members;

  if (message.guild.memberCount == message.guild.members.cache.size) {
    members = server.members.cache;
  } else {
    members = await server.members.fetch().catch((e) => {
      logger.error("failed to fetch members for guild peaks on $server", e);
      return message.guild.members.cache;
    });
  }

  const users = members.filter((member) => !member.user.bot);
  const bots = members.filter((member) => member.user.bot);

  if (args.length == 1 && args[0] == "-id") {
    const embed = new CustomEmbed(message.member)
      .setHeader(server.name)
      .setDescription("`" + server.id + "`");

    return message.channel.send({ embeds: [embed] });
  }

  if (args.length == 1 && args[0] == "-m") {
    const embed = new CustomEmbed(message.member)
      .setThumbnail(server.iconURL({ size: 128 }))
      .setHeader(server.name)

      .addField(
        "member info",
        `**total** ${server.memberCount.toLocaleString()}\n` +
          `**humans** ${users.size.toLocaleString()}\n` +
          `**bots** ${bots.size.toLocaleString()}\n` +
          `**member peak** ${(await getPeaks(message.guild)).toLocaleString()}`,
      );

    return message.channel.send({ embeds: [embed] });
  }

  const embed = new CustomEmbed(message.member)
    .setThumbnail(server.iconURL({ size: 128 }))
    .setHeader(server.name)

    .addField(
      "info",
      "**owner** " +
        server.members.cache.get(server.ownerId).user.username +
        "\n" +
        "**created** " +
        created,
      true,
    )

    .addField(
      "info",
      "**roles** " +
        server.roles.cache.size +
        "\n" +
        "**channels** " +
        server.channels.cache.size +
        "\n" +
        "**id** " +
        server.id,
      true,
    )

    .addField(
      "member info",
      `**total** ${server.memberCount.toLocaleString()}\n` +
        `**humans** ${users.size.toLocaleString()}\n` +
        `**bots** ${bots.size.toLocaleString()}\n` +
        `**member peak** ${(await getPeaks(message.guild)).toLocaleString()}`,
    );

  if (server.memberCount >= 25000) {
    embed.setFooter({ text: "humans and bots may be inaccurate due to server size" });
  }

  message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;

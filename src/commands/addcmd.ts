import { CategoryChannel, ChannelType, Message, TextChannel } from "discord.js";
import { Command } from "../models/Command";
import Constants from "../utils/Constants";

const cmd = new Command("addcmd", "add a commands channel", "none").setPermissions(["bot owner"]);

cmd.setRun(async (message) => {
  if (message.author.id !== Constants.TEKOH_ID) return;
  if (message.guildId !== Constants.NYPSI_SERVER_ID) return;

  const category = (await message.guild.channels.fetch("1246516186171314337")) as CategoryChannel;
  const archive = (await message.guild.channels.fetch("1060585526945665197")) as CategoryChannel;

  const { children } = category;

  const name = `cmds-${children.cache.size}`;

  let channel: TextChannel;

  const archivedChannel = archive.children.cache.find((i) => i.name === name) as TextChannel;

  if (archivedChannel) {
    await archivedChannel.setParent("1246516186171314337");

    channel = archivedChannel;
  } else {
    channel = await children.create({ name, type: ChannelType.GuildText });
  }

  console.log(children.cache.size);

  console.log(channel.position);

  await channel.setPosition(children.cache.size - 2);

  console.log(channel.position);

  (message as Message).react("✅");
});

module.exports = cmd;

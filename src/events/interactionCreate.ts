import {
  ApplicationCommandOptionType,
  Collection,
  CommandInteraction,
  CommandInteractionOption,
  GuildBasedChannel,
  GuildMember,
  Interaction,
  InteractionType,
  Role,
} from "discord.js";
import { NypsiCommandInteraction, createNypsiInteraction } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import { isUserBlacklisted } from "../utils/functions/users/blacklist";
import { runCommand } from "../utils/handlers/commandhandler";
import { runInteraction } from "../utils/handlers/interactions";

export default async function interactionCreate(interaction: Interaction) {
  if (await isUserBlacklisted(interaction.user.id)) return;

  if (
    [InteractionType.ApplicationCommandAutocomplete, InteractionType.MessageComponent].includes(
      interaction.type,
    )
  ) {
    return runInteraction(interaction);
  }

  if (interaction.type != InteractionType.ApplicationCommand) return;

  if (interaction.createdTimestamp < Date.now() - 2500) return;

  if (!interaction.guild) {
    const embed = new CustomEmbed()
      .setHeader("nypsi")
      .setColor(Constants.TRANSPARENT_EMBED_COLOR)
      .setDescription(
        "unfortunately you can't do commands in direct messages ):\n\n" +
          "if you need support or help for nypsi, please join the official nypsi server: https://discord.gg/hJTDNST",
      );
    return await interaction.reply({ embeds: [embed] });
  }

  const message: CommandInteraction & NypsiCommandInteraction = createNypsiInteraction(interaction);

  const args = [""];

  setTimeout(async () => {
    if (!interaction.isCommand()) return;
    if (interaction.replied) return;
    if (interaction.deferred) return;

    await interaction.deferReply().catch(() => {});
  }, 2000);

  const parseArgument = async (arg: CommandInteractionOption) => {
    switch (arg.type) {
      case ApplicationCommandOptionType.User:
        const user = arg.user;
        const guildMember = await interaction.guild.members.fetch(user.id).catch(() => {});

        if (guildMember) {
          args.push(`<@${user.id}>`);
          const collection: Collection<string, GuildMember> = new Collection();
          collection.set(user.id, guildMember);
          message.mentions = {
            members: collection,
          };
        } else {
          args.push(user.id);
        }
        break;
      case ApplicationCommandOptionType.Channel:
        const channel = arg.channel;
        args.push(`<#${channel.id}>`);

        const collection = new Collection<string, GuildBasedChannel>();
        collection.set(channel.id, channel as GuildBasedChannel);
        message.mentions = {
          channels: collection,
        };

        break;
      case ApplicationCommandOptionType.Role:
        const role = arg.role;
        args.push(`<@${role.id}>`);

        const roleCollection = new Collection<string, Role>();
        roleCollection.set(role.id, role as Role);
        message.mentions = {
          roles: roleCollection,
        };

        break;
      case ApplicationCommandOptionType.String:
        for (const str of arg.value.toString().split(" ")) {
          args.push(str);
        }
        break;
      case ApplicationCommandOptionType.Integer:
        args.push(arg.value.toString());
        break;
      case ApplicationCommandOptionType.SubcommandGroup:
        args.push(arg.name);
        for (const arg1 of arg.options) {
          await parseArgument(arg1);
        }
        break;
      case ApplicationCommandOptionType.Subcommand:
        args.push(arg.name);
        for (const arg1 of arg.options) {
          await parseArgument(arg1);
        }
        break;
    }
  };

  for (const arg of interaction.options.data) {
    await parseArgument(arg);
  }

  message.content = `[/]${interaction.commandName} ${args.join(" ")}`;

  return runCommand(interaction.commandName, message, args);
}

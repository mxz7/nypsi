import { ReactionRole, ReactionRoleMode, ReactionRoleRoles } from "@prisma/client";
import {
  BaseMessageOptions,
  CommandInteraction,
  GuildTextBasedChannel,
  InteractionReplyOptions,
  Message,
  PermissionFlagsBits,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import Constants from "../utils/Constants";
import {
  addRoleToReactionRole,
  createReactionRole,
  deleteReactionRole,
  deleteRoleFromReactionRole,
  getReactionRolesByGuild,
  sendReactionRole,
  setReactionRoleColour,
  setReactionRoleDescription,
  setReactionRoleMode,
  setReactionRoleTitle,
  setReactionRoleWhitelist,
} from "../utils/functions/guilds/reactionroles";
import { getRole } from "../utils/functions/member";
import { getTier, isPremium } from "../utils/functions/premium/premium";

const cmd = new Command("reactionroles", "create & manage the server's reaction roles", "admin")
  .setPermissions(["MANAGE_SERVER"])
  .setAliases(["rr"]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((list) => list.setName("list").setDescription("list all reaction roles"))
  .addSubcommand((create) => create.setName("create").setDescription("create a reaction role"))
  .addSubcommand((addrole) =>
    addrole
      .setName("addrole")
      .setDescription("add a role to a reaction role")
      .addStringOption((option) =>
        option
          .setName("reaction-role")
          .setDescription("reaction role to effect")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addRoleOption((option) =>
        option.setName("role").setDescription("role to add").setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("label")
          .setDescription("either an emoji or some text")
          .setRequired(true)
          .setMaxLength(80),
      ),
  )
  .addSubcommand((update) =>
    update
      .setName("update")
      .setDescription("update a reaction role setting")
      .addStringOption((option) =>
        option
          .setName("reaction-role")
          .setDescription("reaction role to effect")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((option) =>
        option
          .setName("setting")
          .setDescription("the setting you want to change")
          .setChoices(
            { name: "mode", value: "mode" },
            { name: "title", value: "title" },
            { name: "description", value: "description" },
            { name: "color", value: "color" },
          )
          .setRequired(true),
      )
      .addStringOption((option) =>
        option.setName("value").setDescription("new value").setRequired(true),
      ),
  )
  .addSubcommand((send) =>
    send
      .setName("send")
      .setDescription("resend a reaction role")
      .addStringOption((option) =>
        option
          .setName("reaction-role")
          .setDescription("reaction role to effect")
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((del) =>
    del
      .setName("delete")
      .setDescription("delete a reaction role")
      .addStringOption((option) =>
        option
          .setName("reaction-role")
          .setDescription("reaction role to effect")
          .setRequired(true)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((removerole) =>
    removerole
      .setName("removerole")
      .setDescription("remove a role from a reaction role")
      .addStringOption((option) =>
        option
          .setName("reaction-role")
          .setDescription("reaction role to effect")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addRoleOption((option) =>
        option.setName("role").setDescription("role to remove").setRequired(true),
      ),
  )
  .addSubcommandGroup((whitelist) =>
    whitelist
      .setName("whitelist")
      .setDescription("whitelist settings")
      .addSubcommand((add) =>
        add
          .setName("add")
          .setDescription("add a role to the whitelist")
          .addStringOption((option) =>
            option
              .setName("reaction-role")
              .setDescription("reaction role to effect")
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addRoleOption((option) =>
            option.setName("role").setDescription("role to add to the whitelist").setRequired(true),
          ),
      )
      .addSubcommand((remove) =>
        remove
          .setName("remove")
          .setDescription("remove a role from the whitelist")
          .addStringOption((option) =>
            option
              .setName("reaction-role")
              .setDescription("reaction role to effect")
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addRoleOption((option) =>
            option
              .setName("role")
              .setDescription("role to remove from the whitelist")
              .setRequired(true),
          ),
      )
      .addSubcommand((list) =>
        list
          .setName("list")
          .setDescription("list all whitelisted roles")
          .addStringOption((option) =>
            option
              .setName("reaction-role")
              .setDescription("reaction role to effect")
              .setRequired(true)
              .setAutocomplete(true),
          ),
      ),
  );

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
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
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      await send({
        embeds: [new ErrorEmbed("you need `manage server` permission for this command")],
      });
    return;
  }

  const listReactionRoles = async () => {
    const embed = new CustomEmbed(message.member).setHeader(
      "reaction roles",
      message.author.avatarURL(),
    );
    const reactionRoles = await getReactionRolesByGuild(message.guild);

    if (reactionRoles.length == 0) {
      embed.setDescription("there is currently no reaction roles set up");
    } else {
      for (const reactionRole of reactionRoles) {
        const fieldDesc: string[] = [
          `**title** ${reactionRole.title}`,
          `**mode** ${reactionRole.mode}`,
          "",
        ];

        for (const role of reactionRole.roles) {
          const roleStr = await message.guild.roles
            .fetch(role.roleId)
            .then((r) => r.toString())
            .catch(() => {});
          fieldDesc.push(`${role.label}: ${roleStr || role.roleId}`);
        }

        embed.addField(reactionRole.messageId, fieldDesc.join("\n"));
      }
    }

    return send({ embeds: [embed] });
  };

  const setupReactionRole = async (msg?: Message) => {
    if (msg) {
      await msg.edit({
        embeds: [
          new CustomEmbed(
            message.member,
            "what would you like the title to be? \n\nuse 'blank' for none\nuse 'cancel' to stop creating a reaction role",
          ),
        ],
      });
    } else {
      msg = await send({
        embeds: [
          new CustomEmbed(
            message.member,
            "what would you like the title to be? \n\nuse 'blank' for none\nuse 'cancel' to stop creating a reaction role",
          ),
        ],
      });
    }

    let fail = false;
    const filter = (m: Message) => m.author.id === message.author.id;

    let title = await message.channel
      .awaitMessages({ filter, max: 1, time: 90_000 })
      .then((m) => {
        m.first()
          .delete()
          .catch(() => {
            fail = true;
            message.channel.send({
              content:
                "i am missing some permissions. if you need support join: https://discord.gg/hJTDNST",
            });
          });
        return m.first().content;
      })
      .catch(() => {
        fail = true;
      });

    if (fail || !title)
      return message.channel.send({
        content: `${message.author.toString()} reaction role creation expired`,
      });

    if (title.length > 100)
      return message.channel.send({ embeds: [new ErrorEmbed("length cannot be longer than 100")] });
    if (title === "blank") title = "";

    await msg.edit({
      embeds: [
        new CustomEmbed(
          message.member,
          "what would you like the description of the message to be? max length: 1000 characters",
        ),
      ],
    });

    const description = await message.channel
      .awaitMessages({ filter, max: 1, time: 90_000 })
      .then((m) => {
        m.first()
          .delete()
          .catch(() => {
            fail = true;
            message.channel.send({
              content:
                "i am missing some permissions. if you need support join: https://discord.gg/hJTDNST",
            });
          });
        return m.first().content;
      })
      .catch(() => {
        fail = true;
      });

    if (fail || !description)
      return message.channel.send({
        content: `${message.author.toString()} reaction role creation expired`,
      });

    if (description.length > 1000)
      return message.channel.send({ embeds: [new ErrorEmbed("length cannot be longer than 100")] });

    await msg.edit({
      embeds: [
        new CustomEmbed(
          message.member,
          "what channel would you like to send the message to? please tag the message using #channel",
        ),
      ],
    });

    const channel = await message.channel
      .awaitMessages({ filter, max: 1, time: 90_000 })
      .then((m) => {
        m.first()
          .delete()
          .catch(() => {
            fail = true;
            message.channel.send({
              content:
                "i am missing some permissions. if you need support join: https://discord.gg/hJTDNST",
            });
          });
        return m.first().mentions.channels.first();
      })
      .catch(() => {
        fail = true;
      });

    if (fail || !channel)
      return message.channel.send({
        content: `${message.author.toString()} reaction role creation expired`,
      });

    if (!channel) return message.channel.send({ embeds: [new ErrorEmbed("invalid channel")] });
    if (!channel.isTextBased())
      return message.channel.send({ embeds: [new ErrorEmbed("must be a text channel")] });
    if (channel.isDMBased()) return;

    await createReactionRole({
      channel,
      guildId: message.guild.id,
      messageDescription: description,
      title: title || undefined,
      mode: "MANY",
    }).catch(() => {
      fail = true;
    });

    if (fail)
      return message.channel.send({
        embeds: [
          new ErrorEmbed(
            "error occurred creating reaction role. does nypsi have permission to send messages in the channel?",
          ),
        ],
      });

    return msg.edit({
      embeds: [
        new CustomEmbed(
          message.member,
          "✅ reaction role created\n\nuse **/reactionroles addrole** to add roles to the reaction role",
        ),
      ],
    });
  };

  const displayReactionRole = async (
    reactionRole: ReactionRole & { roles: ReactionRoleRoles[] },
  ) => {
    const embed = new CustomEmbed(message.member).setHeader(
      "reaction roles",
      message.author.avatarURL(),
    );

    const fieldDesc: string[] = [
      `**title** ${reactionRole.title}`,
      `**mode** ${reactionRole.mode}`,
      "",
    ];

    for (const role of reactionRole.roles) {
      const roleStr = await message.guild.roles
        .fetch(role.roleId)
        .then((r) => r.toString())
        .catch(() => {});
      fieldDesc.push(`${role.label}: ${roleStr || role.roleId}`);
    }

    embed.addField(reactionRole.messageId, fieldDesc.join("\n"));

    return embed;
  };

  if (args.length === 0) {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          "**/reactionroles list** *list all reaction roles*\n" +
            "**/reactionroles create** *start the interactive system to setup a reaction role*\n" +
            "**/reactionroles addrole <message id> <role> <label|emoji>** *add a role to a reaction role*\n" +
            "**/reactionroles send <message id>** *resend the reaction roles message*\n" +
            "**/reactionroles update <message id> <setting> <newvalue>** *update a setting for reaction roles*\n" +
            "**/reactionroles delete <message id>** *delete a reaction role*\n" +
            "**/reactionroles removerole <message id> <role>** *remove a role from a reaction role*\n" +
            "**/reactionroles whitelist add <message id> <role id>** *only allow members of this role to access*\n" +
            "**/reactionroles whitelist remove <message id> <role id>** *unwhitelist a role*\n" +
            "**/reactionroles whitelist list <message id>** *list all whitelisted roles*",
        ).setHeader("reaction roles", message.author.avatarURL()),
      ],
    });
  } else if (args[0].toLowerCase() === "list") {
    return listReactionRoles();
  } else if (args[0].toLowerCase() === "create") {
    const reactionRoles = await getReactionRolesByGuild(message.guild);

    let max = 2;

    if (await isPremium(message.member)) max += await getTier(message.member);

    if (reactionRoles.length >= max)
      return send({
        embeds: [
          new ErrorEmbed(
            `you have reached the max amount of reaction roles in this server (${max})`,
          ),
        ],
      });

    return await setupReactionRole();
  } else if (args[0].toLowerCase() === "addrole") {
    if (args.length < 4) return send({ embeds: [new ErrorEmbed("/reactionroles addrole")] });

    let reactionRoles = await getReactionRolesByGuild(message.guild);
    let reactionRole = reactionRoles.find((r) => r.messageId === args[1]);

    if (!reactionRole)
      return send({
        embeds: [
          new ErrorEmbed("invalid reaction role. you must create one with /reactionrole create"),
        ],
      });

    if (reactionRole.roles.length >= 25)
      return send({ embeds: [new ErrorEmbed("this reaction role already has 25 roles")] });

    if (!reactionRole)
      return send({
        embeds: [
          new ErrorEmbed(`couldn't find the reaction role '${args[1]}', use the message id`),
        ],
      });

    args.shift();

    let role = message.mentions?.roles?.first();

    if (!role) role = await getRole(message.guild, args[2]);

    if (!role)
      return send({
        embeds: [
          new ErrorEmbed(
            `couldn't find the role '${args[2]}', use the role id or mention the role`,
          ),
        ],
      });

    if (reactionRole.roles.find((r) => r.roleId === role.id))
      return send({ embeds: [new ErrorEmbed("this role is already on this reaction role")] });

    args.shift();
    args.shift();

    await addRoleToReactionRole({
      messageId: reactionRole.messageId,
      guildId: message.guild.id,
      role: {
        role,
        label: args.join(" ").substring(0, 80),
      },
    });

    reactionRoles = await getReactionRolesByGuild(message.guild);
    reactionRole = reactionRoles.find((r) => r.messageId === reactionRole.messageId);

    return send({ embeds: [await displayReactionRole(reactionRole)] });
  } else if (args[0].toLowerCase() === "send") {
    if (args.length < 2) return send({ embeds: [new ErrorEmbed("/reactionroles send")] });

    const reactionRoles = await getReactionRolesByGuild(message.guild);
    const reactionRole = reactionRoles.find((r) => r.messageId === args[1]);

    if (!reactionRole)
      return send({ embeds: [new ErrorEmbed(`'${args[1]}' is not a reaction role`)] });

    const channel = message.guild.channels.cache.get(reactionRole.channelId);

    if (!channel) return send({ embeds: [new ErrorEmbed("channel is invalid")] });

    let fail = false;

    await sendReactionRole(reactionRole, channel as GuildTextBasedChannel).catch(() => {
      fail = true;
    });

    if (fail) {
      return send({ embeds: [new ErrorEmbed("failed to resend message. check my permissions?")] });
    }

    return send({ embeds: [new CustomEmbed(message.member, "✅ message resent")] });
  } else if (args[0].toLowerCase() === "delete") {
    if (args.length < 2) return send({ embeds: [new ErrorEmbed("/reactionroles delete")] });

    const reactionRoles = await getReactionRolesByGuild(message.guild);
    const reactionRole = reactionRoles.find((r) => r.messageId === args[1]);

    if (!reactionRole)
      return send({ embeds: [new ErrorEmbed(`'${args[1]}' is not a reaction role message`)] });

    await deleteReactionRole(message.guild.id, args[1]);

    return send({ embeds: [new CustomEmbed(message.member, "✅ deleted reaction role")] });
  } else if (args[0].toLowerCase() === "removerole") {
    if (args.length < 3) return send({ embeds: [new ErrorEmbed("/reactionroles removerole")] });

    let reactionRoles = await getReactionRolesByGuild(message.guild);
    let reactionRole = reactionRoles.find((r) => r.messageId === args[1]);

    if (!reactionRole)
      return send({ embeds: [new ErrorEmbed(`'${args[1]}' is not a reaction role message`)] });

    let role = message.mentions?.roles?.first();

    if (!role) role = await getRole(message.guild, args[2]);

    if (!role)
      return send({
        embeds: [
          new ErrorEmbed(
            `couldn't find the role '${args[2]}', use the role id or mention the role`,
          ),
        ],
      });

    await deleteRoleFromReactionRole(message.guild.id, args[1], role.id);

    reactionRoles = await getReactionRolesByGuild(message.guild);
    reactionRole = reactionRoles.find((r) => r.messageId === args[1]);

    return send({ embeds: [await displayReactionRole(reactionRole)] });
  } else if (args[0].toLowerCase() === "update") {
    if (args.length < 4) return send({ embeds: [new ErrorEmbed("/reactionroles update")] });

    const reactionRoles = await getReactionRolesByGuild(message.guild);
    const reactionRole = reactionRoles.find((r) => r.messageId === args[1]);

    if (!reactionRole)
      return send({ embeds: [new ErrorEmbed(`'${args[1]}' is not a reaction role message`)] });

    if (args[2].toLowerCase() === "mode") {
      if (!["many", "unique"].includes(args[3].toLowerCase()))
        return send({ embeds: [new ErrorEmbed("possible values: many, unique")] });

      if (reactionRole.mode.toLowerCase() === args[3].toLowerCase())
        return send({ embeds: [new ErrorEmbed("already that value lol")] });

      await setReactionRoleMode(
        message.guild.id,
        args[1],
        args[3].toUpperCase() as ReactionRoleMode,
      );

      return send({ embeds: [new CustomEmbed(message.member, "✅ updated mode")] });
    } else if (args[2].toLowerCase() === "title") {
      args.shift();
      args.shift();
      args.shift();

      if (args.join(" ").length > 100) return send({ embeds: [new ErrorEmbed("too long")] });

      await setReactionRoleTitle(message.guild.id, reactionRole.messageId, args.join(" "));

      return send({
        embeds: [
          new CustomEmbed(message.member, "✅ updated title. you will have to resend the message"),
        ],
      });
    } else if (args[2].toLowerCase() === "description") {
      args.shift();
      args.shift();
      args.shift();

      if (args.join(" ").length > 1000) return send({ embeds: [new ErrorEmbed("too long")] });

      await setReactionRoleDescription(message.guild.id, reactionRole.messageId, args.join(" "));

      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            "✅ updated description. you will have to resend the message",
          ),
        ],
      });
    } else if (args[2].toLowerCase() === "color") {
      if (!args[3].match(Constants.COLOUR_REGEX))
        return send({ embeds: [new ErrorEmbed("invalid hex colour. example: #abcdef")] });

      await setReactionRoleColour(message.guild.id, reactionRole.messageId, args[3]);

      return send({
        embeds: [
          new CustomEmbed(message.member, "✅ updated color. you will have to resend the message"),
        ],
      });
    }
  } else if (args[0].toLowerCase() === "whitelist") {
    const reactionRoles = await getReactionRolesByGuild(message.guild);
    const reactionRole = reactionRoles.find((r) => r.messageId === args[2]);

    if (!reactionRole)
      return send({ embeds: [new ErrorEmbed(`'${args[2]}' is not a reaction role message`)] });

    if (args[1].toLowerCase() === "add") {
      if (args.length < 4) return send({ embeds: [new ErrorEmbed("/reactionroles whitelist")] });

      if (reactionRole.whitelist.length >= 25)
        return send({ embeds: [new ErrorEmbed("really? 25 whitelsited roles?")] });

      let role = message.mentions?.roles?.first();

      if (!role) role = await getRole(message.guild, args[3]);

      if (!role)
        return send({
          embeds: [
            new ErrorEmbed(
              `couldn't find the role '${args[3]}', use the role id or mention the role`,
            ),
          ],
        });

      if (reactionRole.whitelist.includes(role.id))
        return send({ embeds: [new ErrorEmbed(`${role.toString()} is already whitelisted`)] });

      reactionRole.whitelist.push(role.id);

      await setReactionRoleWhitelist(
        message.guild.id,
        reactionRole.messageId,
        reactionRole.whitelist,
      );

      return send({
        embeds: [new CustomEmbed(message.member, `✅ added ${role.toString()} to the whitelist`)],
      });
    } else if (args[1].toLowerCase() === "remove") {
      if (args.length < 4) return send({ embeds: [new ErrorEmbed("/reactionroles whitelist")] });

      let role = message.mentions?.roles?.first();

      if (!role) role = await getRole(message.guild, args[3]);

      if (!role)
        return send({
          embeds: [
            new ErrorEmbed(
              `couldn't find the role '${args[3]}', use the role id or mention the role`,
            ),
          ],
        });

      if (!reactionRole.whitelist.includes(role.id))
        return send({ embeds: [new ErrorEmbed(`${role.toString()} is not whitelisted`)] });

      reactionRole.whitelist.splice(reactionRole.whitelist.indexOf(role.id), 1);

      await setReactionRoleWhitelist(
        message.guild.id,
        reactionRole.messageId,
        reactionRole.whitelist,
      );

      return send({
        embeds: [
          new CustomEmbed(message.member, `✅ removed ${role.toString()} from the whitelist`),
        ],
      });
    } else if (args[1].toLowerCase() === "list") {
      const embed = new CustomEmbed(message.member).setHeader("reaction role whitelisted roles");

      if (reactionRole.whitelist.length === 0) {
        embed.setDescription("no roles are whitelisted");
      } else {
        const roles: string[] = [];

        for (const roleId of reactionRole.whitelist) {
          const role = await message.guild.roles
            .fetch(reactionRole.whitelist[0])
            .then((r) => r.toString())
            .catch(async () => {
              reactionRole.whitelist.splice(reactionRole.whitelist.indexOf(roleId), 1);
              await setReactionRoleWhitelist(
                message.guild.id,
                reactionRole.messageId,
                reactionRole.whitelist,
              );
              run(message, args);
              return;
            });

          if (!role) return;

          roles.push(role || roleId);
        }

        embed.setDescription(roles.join("\n"));
      }

      return send({ embeds: [embed] });
    }
  } else {
    return listReactionRoles();
  }
}

cmd.setRun(run);

module.exports = cmd;

import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  GuildMember,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  PermissionFlagsBits,
  Role,
} from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getAutoJoinRoles, getPersistantRoles, setAutoJoinRoles, setPersistantRoles } from "../utils/functions/guilds/roles";
import { addCooldown, inCooldown } from "../utils/functions/guilds/utils";
import { getMember, getRole } from "../utils/functions/member";
import PageManager from "../utils/functions/page";

const cmd = new Command("role", "role utilities", Categories.UTILITY);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((members) =>
    members
      .setName("members")
      .setDescription("view members in a role")
      .addRoleOption((option) => option.setName("role").setDescription("role to show members for").setRequired(true))
  )
  .addSubcommandGroup((add) =>
    add
      .setName("add")
      .setDescription("add a role to members")
      .addSubcommand((all) =>
        all
          .setName("all")
          .setDescription("all members in server")
          .addRoleOption((option) => option.setName("role").setDescription("role to add").setRequired(true))
      )
      .addSubcommand((member) =>
        member
          .setName("member")
          .setDescription("specific member")
          .addUserOption((option) =>
            option.setName("member").setDescription("member you want to add role to").setRequired(true)
          )
          .addRoleOption((option) => option.setName("role").setDescription("role to add").setRequired(true))
      )
  )
  .addSubcommandGroup((remove) =>
    remove
      .setName("remove")
      .setDescription("remove a role from members")
      .addSubcommand((all) =>
        all
          .setName("all")
          .setDescription("all members in server")
          .addRoleOption((option) => option.setName("role").setDescription("role to add").setRequired(true))
      )
      .addSubcommand((member) =>
        member
          .setName("member")
          .setDescription("specific member")
          .addUserOption((option) =>
            option.setName("member").setDescription("member you want to add role to").setRequired(true)
          )
          .addRoleOption((option) => option.setName("role").setDescription("role to add").setRequired(true))
      )
  )
  .addSubcommandGroup((autojoin) =>
    autojoin
      .setName("autojoin")
      .setDescription("autojoin settings")
      .addSubcommand((list) => list.setName("list").setDescription("show all autojoin roles"))
      .addSubcommand((add) =>
        add
          .setName("add")
          .setDescription("add a role to the autojoin list")
          .addRoleOption((option) => option.setName("role").setDescription("role to add to list").setRequired(true))
      )
      .addSubcommand((remove) =>
        remove
          .setName("remove")
          .setDescription("remove a role from the autojoin list")
          .addRoleOption((option) => option.setName("role").setDescription("role to remove from the list").setRequired(true))
      )
  )
  .addSubcommandGroup((persist) =>
    persist
      .setName("persist")
      .setDescription("persist settings")
      .addSubcommand((list) => list.setName("list").setDescription("show all persistant roles"))
      .addSubcommand((add) =>
        add
          .setName("add")
          .setDescription("add a role to the persistance list")
          .addRoleOption((option) => option.setName("role").setDescription("role to add to list").setRequired(true))
      )
      .addSubcommand((remove) =>
        remove
          .setName("remove")
          .setDescription("remove a role from the persistance list")
          .addRoleOption((option) => option.setName("role").setDescription("role to remove from the list").setRequired(true))
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

  if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return send({ embeds: [new ErrorEmbed("i need the manage roles permission")] });
  }

  const getMembers = async () => {
    if (args[1].toLowerCase() == "all") {
      if (message.guild.members.cache.size == message.guild.memberCount) {
        return Array.from(message.guild.members.cache.values());
      } else {
        return await message.guild.members.fetch().then((r) => Array.from(r.values()));
      }
    } else {
      if (message.mentions.members.first()) {
        return [message.mentions.members.first()];
      } else {
        const member = await getMember(message.guild, args[2]);

        if (!member) {
          return [];
        }
      }
    }
  };

  if (args.length == 0) {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          "/role add <member|all> (member - if in member mode) (role) - add roles to members\n" +
            "/role remove <member|all> (member - if in member mode) (role) - remove roles from members\n" +
            "/role autojoin add <role> - set a role to be automatically added when a user joins\n" +
            "/role autojoin remove <role> - remove a role from the autojoin list\n" +
            "/role autojoin list - show all current autojoin roles\n" +
            "/role persist add <role> - add a role to be added back to a user after they leave, if they had it. (data deleted after 30 days)\n" +
            "/role persist remove <role> - remove a role from the persistance list\n" +
            "/role persist list - show all current persistant roles\n" +
            "/role members <role> - show members in a role"
        ),
      ],
    });
  }

  if (args[0].toLowerCase() == "add") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return;
    }

    const members = await getMembers();

    if (!members || members.length == 0) {
      return send({ embeds: [new ErrorEmbed("/role add <member|all> (member - if in member mode) (role)")] });
    }

    let role: Role;

    if (!(message instanceof Message) && message.isChatInputCommand()) {
      role = await message.guild.roles.fetch(message.options.getRole("role").id);
    } else if (message.mentions.roles.first()) {
      role = message.mentions.roles.first();
    } else {
      role = await getRole(message.guild, members.length == 1 ? args[3] : args[2]);
    }

    if (!role) {
      return send({ embeds: [new ErrorEmbed("invalid role")] });
    }

    if (members.length > 50) {
      const msg = await send({
        embeds: [
          new CustomEmbed(message.member, `adding ${role.toString()} to ${members.length.toLocaleString()} members...`),
        ],
      });

      let count = 0;
      let done = false;
      let fail = false;

      const i = setInterval(async () => {
        if (fail) {
          clearInterval(i);

          return msg.edit({
            embeds: [
              new ErrorEmbed(
                "failed while adding roles. make sure my role is above the target role and that i have suitable permissions"
              ),
            ],
          });
        }

        if (done) {
          clearInterval(i);

          return msg.edit({
            embeds: [new CustomEmbed(message.member, `added ${role.toString()} to ${count.toLocaleString()} members`)],
          });
        }

        return msg.edit({
          embeds: [
            new CustomEmbed(
              message.member,
              `adding ${role.toString()} to ${members.length.toLocaleString()} members...\n\nprogress: ${count.toLocaleString()}/${members.length.toLocaleString()}`
            ),
          ],
        });
      }, 5000);

      for (const member of members) {
        await member.roles.add(role).catch(() => {
          fail = true;
        });
        count++;
      }

      done = true;
    }

    let fail = false;

    for (const member of members) {
      await member.roles.add(role).catch(() => {
        fail = true;
      });
    }

    if (fail) {
      return send({
        embeds: [
          new ErrorEmbed(
            "failed while adding roles. make sure my role is above the target role and that i have suitable permissions"
          ),
        ],
      });
    }

    return send({
      embeds: [new CustomEmbed(message.member, `added ${role.toString()} to ${members.length.toLocaleString()} members`)],
    });
  } else if (args[0].toLowerCase() == "remove") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return;
    }

    let members = await getMembers();

    if (!members || members.length == 0) {
      return send({ embeds: [new ErrorEmbed("/role remove <member|all> (member - if in member mode) (role)")] });
    }

    let role: Role;

    if (!(message instanceof Message) && message.isChatInputCommand()) {
      role = await message.guild.roles.fetch(message.options.getRole("role").id);
    } else if (message.mentions.roles.first()) {
      role = message.mentions.roles.first();
    } else {
      role = await getRole(message.guild, members.length == 1 ? args[3] : args[2]);
    }

    if (!role) {
      return send({ embeds: [new ErrorEmbed("invalid role")] });
    }

    members = members.filter((m) => Array.from(m.roles.cache.keys()).includes(role.id));

    if (members.length == 0) {
      return send({ embeds: [new ErrorEmbed("no members to remove role from")] });
    }

    if (members.length > 50) {
      const msg = await send({
        embeds: [
          new CustomEmbed(message.member, `removing ${role.toString()} from ${members.length.toLocaleString()} members...`),
        ],
      });

      let count = 0;
      let done = false;
      let fail = false;

      const i = setInterval(async () => {
        if (fail) {
          clearInterval(i);

          return msg.edit({
            embeds: [
              new ErrorEmbed(
                "failed while removing roles. make sure my role is above the target role and that i have suitable permissions"
              ),
            ],
          });
        }

        if (done) {
          clearInterval(i);

          return msg.edit({
            embeds: [new CustomEmbed(message.member, `removed ${role.toString()} from ${count.toLocaleString()} members`)],
          });
        }

        return msg.edit({
          embeds: [
            new CustomEmbed(
              message.member,
              `removing ${role.toString()} from ${members.length.toLocaleString()} members...\n\nprogress: ${count.toLocaleString()}/${members.length.toLocaleString()}`
            ),
          ],
        });
      }, 5000);

      for (const member of members) {
        await member.roles.remove(role).catch(() => {
          fail = true;
        });
        count++;
      }

      done = true;
    }

    let fail = false;

    for (const member of members) {
      await member.roles.remove(role).catch(() => {
        fail = true;
      });
    }

    if (fail) {
      return send({
        embeds: [
          new ErrorEmbed(
            "failed while removing roles. make sure my role is above the target role and that i have suitable permissions"
          ),
        ],
      });
    }

    return send({
      embeds: [new CustomEmbed(message.member, `removed ${role.toString()} from ${members[0].toLocaleString()} members`)],
    });
  } else if (args[0].toLowerCase() == "autojoin") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return;
    }

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed("use slash commands")] });
    }

    const roles = await getAutoJoinRoles(message.guild);

    if (args[1].toLowerCase() == "list") {
      const rolesDisplay: string[] = [];

      for (const r of roles) {
        const role = await message.guild.roles.fetch(r).catch(() => {});

        if (!role) {
          roles.splice(roles.indexOf(r), 1);
          await setAutoJoinRoles(message.guild, roles);
          break;
        }

        rolesDisplay.push(role.toString());
      }

      const embed = new CustomEmbed(
        message.member,
        `${roles.length > 0 ? rolesDisplay.join("\n") : "no roles will automatically be added to new members"}`
      );

      return send({ embeds: [embed] });
    }

    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return send({ embeds: [new ErrorEmbed("you need the `manage server` permission")] });
    }

    let chosenRole: Role;

    if (message.mentions.roles.first()) {
      chosenRole = message.mentions.roles.first();
    } else {
      chosenRole = await getRole(message.guild, args[2]);
    }

    if (!chosenRole) {
      return send({ embeds: [new ErrorEmbed("invalid role")] });
    }

    if (args[1].toLowerCase() == "add" && roles.length >= 5) {
      return send({ embeds: [new ErrorEmbed("there is a maximum of 5 autojoin roles")] });
    }

    const embed = new CustomEmbed(message.member);

    if (args[1].toLowerCase() == "add") {
      if (roles.includes(chosenRole.id)) {
        return send({ embeds: [new ErrorEmbed("this role is already in the autojoin role list")] });
      }
      roles.push(chosenRole.id);
      embed.setDescription(`✅ added ${chosenRole.toString()} to the autojoin role list`);
    } else {
      if (!roles.includes(chosenRole.id)) {
        return send({ embeds: [new ErrorEmbed("that role is not in the autojoin role list")] });
      }

      roles.splice(roles.indexOf(chosenRole.id), 1);
      embed.setDescription(`✅ removed ${chosenRole.toString()} from the autojoin role list`);
    }

    await setAutoJoinRoles(message.guild, roles);

    return send({ embeds: [embed] });
  } else if (args[0].toLowerCase() == "persist") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return;
    }

    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed("use slash commands")] });
    }

    const roles = await getPersistantRoles(message.guild);

    if (args[1].toLowerCase() == "list") {
      const rolesDisplay: string[] = [];

      for (const r of roles) {
        const role = await message.guild.roles.fetch(r).catch(() => {});

        if (!role) {
          roles.splice(roles.indexOf(r), 1);
          await setPersistantRoles(message.guild, roles);
          break;
        }

        rolesDisplay.push(role.toString());
      }

      const embed = new CustomEmbed(
        message.member,
        `${
          roles.length > 0
            ? rolesDisplay.join("\n")
            : "no roles will be added back to joining members (use /role autojoin if you want roles added to every new member)"
        }`
      );

      return send({ embeds: [embed] });
    }

    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return send({ embeds: [new ErrorEmbed("you need the `manage server` permission")] });
    }

    let chosenRole: Role;

    if (message.mentions.roles.first()) {
      chosenRole = message.mentions.roles.first();
    } else {
      chosenRole = await getRole(message.guild, args[2]);
    }

    if (!chosenRole) {
      return send({ embeds: [new ErrorEmbed("invalid role")] });
    }

    const embed = new CustomEmbed(message.member);

    if (args[1].toLowerCase() == "add") {
      if (roles.includes(chosenRole.id)) {
        return send({ embeds: [new ErrorEmbed("this role is already in the persistant role list")] });
      }
      roles.push(chosenRole.id);
      embed.setDescription(`✅ added ${chosenRole.toString()} to the persistant role list`);
    } else {
      if (!roles.includes(chosenRole.id)) {
        return send({ embeds: [new ErrorEmbed("that role is not in the persistant role list")] });
      }

      roles.splice(roles.indexOf(chosenRole.id), 1);
      embed.setDescription(`✅ removed ${chosenRole.toString()} from the persistant role list`);
    }

    await setPersistantRoles(message.guild, roles);

    return send({ embeds: [embed] });
  } else if (args[0].toLowerCase() == "members") {
    if (args.length == 1) {
      return send({ embeds: [new ErrorEmbed("/role members <role>")] });
    }

    args.shift();

    const role = message.mentions.roles.first() || (await getRole(message.guild, args.join(" ")));

    if (!role) {
      return send({ embeds: [new ErrorEmbed(`couldnt find a role with the name\`${args.join(" ")}\``)] });
    }

    let members: GuildMember[];

    if (
      inCooldown(message.guild) ||
      message.guild.memberCount == message.guild.members.cache.size ||
      message.guild.memberCount <= 250
    ) {
      members = Array.from(message.guild.members.cache.values());
    } else {
      members = Array.from((await message.guild.members.fetch()).values());

      addCooldown(message.guild, 3600);
    }

    const filteredMembers = members.filter((m) => m.roles.cache.has(role.id)).map((m) => `\`${m.user.tag}\``);

    if (filteredMembers.length == 0) {
      return send({ embeds: [new CustomEmbed(message.member, `${role.toString()} has no members`)] });
    }

    const pages = PageManager.createPages(filteredMembers);

    const embed = new CustomEmbed(message.member, pages.get(1).join("\n"))
      .setHeader(`${role.name} [${filteredMembers.length}]`)
      .setFooter({ text: `page 1/${pages.size}` });

    let msg: Message;

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("⬅").setLabel("back").setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary)
    );

    if (pages.size > 1) {
      msg = await message.channel.send({ embeds: [embed], components: [row] });
    } else {
      return await message.channel.send({ embeds: [embed] });
    }

    const manager = new PageManager({
      embed,
      row,
      message: msg,
      userId: message.author.id,
      pages,
      onPageUpdate(manager) {
        manager.embed.setFooter({ text: `page ${manager.currentPage}/${manager.lastPage}` });
        return manager.embed;
      },
    });

    return manager.listen();
  }
}

cmd.setRun(run);

module.exports = cmd;

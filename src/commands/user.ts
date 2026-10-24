import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  GuildMember,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
  SectionBuilder,
} from "discord.js";
import { sort } from "fast-sort";
import { nanoid } from "nanoid";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomContainer, CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { RedisCache } from "../utils/cache";
import Constants from "../utils/Constants";
import { daysAgo, formatDate } from "../utils/functions/date";
import { getRawLevel } from "../utils/functions/economy/levelling";
import { isEcoBanned } from "../utils/functions/economy/utils";
import { getAllMembersRest } from "../utils/functions/guilds/members";
import { getMember } from "../utils/functions/member";
import PageManager from "../utils/functions/page";
import { putObject } from "../utils/functions/s3";
import { escapeFormattingCharacters, pluralize } from "../utils/functions/string";
import {
  addNewAvatar,
  clearAvatarHistory,
  clearUsernameHistory,
  deleteAvatar,
  fetchAvatarHistory,
  fetchUsernameHistory,
  isTracking,
} from "../utils/functions/users/history";
import { hasProfile } from "../utils/functions/users/utils";
import { addView } from "../utils/functions/users/views";
import workerSort from "../utils/functions/workers/sort";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";
import dayjs = require("dayjs");

type JoinOrderEntry = { id: string; joinedTimestamp: number };
const joinOrderCache = new RedisCache<JoinOrderEntry[]>(
  Constants.redis.cache.guild.JOIN_ORDER,
  3600 * 3,
);

const actions = {
  info: { description: "view information about a user", aliases: ["whois", "who"], run: runInfo },
  avatar: {
    description: "view a user's avatar",
    aliases: ["avatar", "av", "pfp", "picture"],
    run: runAvatar,
  },
  banner: { description: "view a user's banner", aliases: ["banner"], run: runBanner },
  "avatar-history": {
    description: "view or clear your avatar history",
    aliases: ["avatarhistory", "avh", "avhistory", "pfphistory", "pfph"],
    run: runAvatarHistory,
  },
  "username-history": {
    description: "view username history or clear your own",
    aliases: ["usernamehistory", "un", "usernames"],
    run: runUsernameHistory,
  },
  join: { description: "view a user's join position", aliases: ["join", "joined"], run: runJoin },
};

const cmd = new Command("user", "view user information, images, and history", "info").setShorthands(
  Object.fromEntries(
    Object.entries(actions).flatMap(([action, data]) =>
      data.aliases.map((alias) => [alias, `user ${action}`]),
    ),
  ),
);

cmd.slashEnabled = true;

for (const [action, data] of Object.entries(actions)) {
  cmd.slashData.addSubcommand((sub) => {
    sub.setName(action).setDescription(data.description);

    if (action !== "avatar-history") {
      sub.addUserOption((option) =>
        option.setName("user").setDescription("user to look up (defaults to you)"),
      );
    }

    if (action === "info") {
      sub.addBooleanOption((option) =>
        option.setName("id-only").setDescription("show only the user's ID"),
      );
    } else if (action === "join") {
      sub.addIntegerOption((option) =>
        option
          .setName("position")
          .setDescription("look up a join position instead of a user")
          .setMinValue(1),
      );
    } else if (action === "avatar-history" || action === "username-history") {
      sub.addBooleanOption((option) =>
        option.setName("clear").setDescription("clear your own history"),
      );

      if (action === "avatar-history") {
        sub.addIntegerOption((option) =>
          option.setName("page").setDescription("avatar history page to open").setMinValue(1),
        );
      }
    }

    return sub;
  });
}

async function runInfo(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  let member;
  const search = args.filter((arg) => arg !== "-id").join(" ");

  if (!search) {
    member = message.member;
  } else {
    member = await getMember(message.guild, search);
  }

  if (!member) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  if (args.includes("-id")) {
    const embed = new CustomEmbed(message.member, "`" + member.user.id + "`").setHeader(
      member.user.username,
    );
    return send({ embeds: [embed] });
  }

  const members = await getAllMembersRest(message.guildId);

  let membersSorted: JoinOrderEntry[] = [];
  let msg: Message;

  const cached = await joinOrderCache.get(message.guildId);
  if (cached) {
    membersSorted = cached;
  } else {
    if (members.length > 2000) {
      if (members.length > 5000)
        msg = await send({
          embeds: [
            new CustomEmbed(message.member, `sorting ${members.length.toLocaleString()} members..`),
          ],
        });

      membersSorted = await workerSort(
        members.map((i) => ({ id: i.userId, joinedTimestamp: i.joinedTimestamp })),
        "joinedTimestamp",
        "asc",
      );
    } else {
      membersSorted = sort(
        members.map((i) => ({ id: i.userId, joinedTimestamp: i.joinedTimestamp })),
      ).asc((i) => i.joinedTimestamp);
    }

    await joinOrderCache.set(message.guildId, membersSorted);
  }

  let joinPos: number | string = membersSorted.findIndex((i) => i.id === member.id) + 1;

  if (joinPos == 0) joinPos = "invalid";

  const joined = formatDate(member.joinedAt);
  const created = formatDate(member.user.createdAt);
  const roles = member.roles.cache;
  const rolesText = roles.reverse().reduce((str, role) => {
    if (str.length > 900) {
      if (!str.endsWith("more")) {
        const currentCount = str.split(" ").length - 1;

        return str + `*+${roles.size - currentCount}* more`;
      }

      return str;
    }

    if (role.name == "@everyone") return str;
    return str + role.toString() + " ";
  }, "");

  const usernameHistory = await fetchUsernameHistory(member, 5);

  const embed = new CustomEmbed(message.member, member.user.toString())
    .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
    .setHeader(member.user.username)

    .addField(
      "account",
      `**id** ${member.user.id}\n**created** ${created.toString().toLowerCase()}`,
      true,
    )

    .addField(
      "server",
      `**joined** ${joined.toString().toLowerCase()}\n**join pos** ${
        joinPos != "invalid" ? joinPos.toLocaleString() : "--"
      }`,
      true,
    )

    .addField("\u200B", "\u200B", true);

  if (member.roles.cache.size > 1) {
    embed.addField("roles [" + (member.roles.cache.size - 1) + "]", rolesText, true);
  }

  if (usernameHistory.length > 1) {
    const text: string[] = [];

    for (const un of usernameHistory) {
      if (text.length > 5) break;
      text.push(`\`${un.value}\` | \`${formatDate(un.createdAt)}\``);
    }

    embed.addField("username history", text.join("\n"), true);
  }

  if (msg) msg.edit({ embeds: [embed] });
  else send({ embeds: [embed] });

  addView(member, message.member, `user in ${message.guild.id}`);
}

async function runAvatar(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  let member: GuildMember;

  if (args.length == 0) {
    member = message.member;
  } else {
    member = await getMember(message.guild, args.join(" "));
  }

  if (!member) {
    return send({ embeds: [new ErrorEmbed("invalid user")], flags: MessageFlags.Ephemeral });
  }

  const avatar = member.user.displayAvatarURL({ size: 256, extension: "png" });

  let serverAvatar = member.displayAvatarURL({ size: 256, extension: "png" });

  if (avatar == serverAvatar) {
    serverAvatar = undefined;
  }

  const embed = new CustomEmbed(member).setHeader(member.user.username).setImage(avatar);

  let showingServerAvatar = false;

  const buildRow = () =>
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("btn-toggle-avatar-source")
        .setLabel(showingServerAvatar ? "show user avatar" : "show server avatar")
        .setStyle(ButtonStyle.Primary),
    );

  if (!serverAvatar) {
    return send({ embeds: [embed] });
  }

  const msg = await send({ embeds: [embed], components: [buildRow()] });

  const filter = (i: Interaction) => i.user.id == message.author.id;

  const listen = async () => {
    const collected = await msg.awaitMessageComponent({ filter, time: 15000 }).catch(async () => {
      await msg.edit({ components: [] });
    });

    if (!collected) return;

    showingServerAvatar = !showingServerAvatar;
    embed.setImage(showingServerAvatar ? serverAvatar : avatar);
    await collected.update({ embeds: [embed], components: [buildRow()] });
    return listen();
  };

  await listen();
}

async function runBanner(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  let member: GuildMember;

  if (args.length == 0) {
    member = message.member;
  } else {
    member = await getMember(message.guild, args.join(" "));
  }

  if (!member) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  const user = await message.client.users.fetch(member.user.id, { force: true });

  if (!user.banner) {
    return send({
      embeds: [
        new ErrorEmbed(
          `${member == message.member ? "you do" : `${escapeFormattingCharacters(user.username)} does`} not have a banner`,
        ),
      ],
    });
  }

  const banner = user.bannerURL({ size: 512 });

  const embed = new CustomEmbed(member).setHeader(member.user.username).setImage(banner);

  return send({ embeds: [embed] });
}

async function runAvatarHistory(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (await onCooldown("avatarhistory", message.member)) {
    const res = await getResponse("avatarhistory", message.member);

    if (res.respond) send({ embeds: [res.embed] });
    return;
  }

  if (["clear", "-clear"].includes(args[0]?.toLowerCase())) {
    await clearAvatarHistory(message.member);
    return send({
      embeds: [new CustomEmbed(message.member, "✅ your avatar history has been cleared")],
    });
  }

  await addCooldown("avatarhistory", message.member, 5);

  if (
    (await getRawLevel(message.member).catch(() => 0)) < 300 ||
    message.client.user.id !== Constants.BOT_USER_ID
  )
    return send({
      embeds: [
        new ErrorEmbed(
          "you require at least level 500 (prestige 5) (/profile) for nypsi to track your avatars\n\nyou can disable avatar tracking with $toggletracking",
        ),
      ],
    });

  let history = await fetchAvatarHistory(message.member);

  if (history.length == 0) {
    if (
      (await isTracking(message.member)) &&
      !(await isEcoBanned(message.member)
        .then((r) => r.banned)
        .catch(() => false))
    ) {
      const avatar = message.author.avatarURL({ size: 256, extension: "png" });
      const arrayBuffer = await fetch(avatar).then((r) => r.arrayBuffer());
      const ext = avatar.split(".").pop().split("?")[0];
      const key = `avatar/${message.author.id}/${nanoid()}.${ext}`;

      const result = await putObject(key, Buffer.from(arrayBuffer), `image/${ext}`);

      if (!result) return;

      await addNewAvatar(message.member, `${Constants.CDN_DOMAIN}/${key}`);
      logger.debug(`avatar-history: added avatar for ${message.author.id}`, {
        userId: message.author.id,
      });

      history = await fetchAvatarHistory(message.member);
    } else return send({ embeds: [new ErrorEmbed("no avatar history")] });
  }

  const requestedPage = parseInt(args[0]) || parseInt(args[1]) || 1;
  const index = requestedPage > 0 && requestedPage <= history.length ? requestedPage - 1 : 0;

  const embed = new CustomEmbed(message.member)
    .setHeader("your avatar history")
    .setImage(history[index].value)
    .setFooter({ text: formatDate(history[index].createdAt) });

  if (history.length > 1) {
    embed.setFooter({
      text: `${formatDate(history[index].createdAt)} | ${index + 1}/${history.length}`,
    });
  }

  if (!(await isTracking(message.member))) {
    embed.setDescription("`[tracking disabled]`");
  }

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("btn-previous-page")
      .setLabel("back")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(index === 0),
    new ButtonBuilder()
      .setCustomId("btn-next-page")
      .setLabel("next")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(index === history.length - 1),
    new ButtonBuilder()
      .setCustomId("btn-delete-avatar")
      .setLabel("delete")
      .setStyle(ButtonStyle.Danger),
  );

  let msg: Message;

  if (history.length == 1) {
    return await send({ embeds: [embed] });
  } else {
    msg = await send({ embeds: [embed], components: [row] });
  }

  const manager = new PageManager({
    message: msg,
    embed,
    row,
    userId: message.author.id,
    allowMessageDupe: false,
    pages: PageManager.createPages(history, 1),
    handleResponses: new Map().set(
      "btn-delete-avatar",
      async (
        manager: PageManager<{
          id: number;
          createdAt: Date;
          value: string;
        }>,
        interaction: ButtonInteraction,
      ) => {
        const res = await deleteAvatar(history[manager.currentPage - 1].id);

        if (res) {
          history = await fetchAvatarHistory(message.member);
          manager.pages = PageManager.createPages(history, 1);
          manager.lastPage = manager.pages.size;

          if (!history.length) {
            await interaction.update({
              embeds: [new CustomEmbed(message.member, "no avatar history")],
              components: [],
            });
            return;
          }

          if (manager.currentPage > manager.lastPage) manager.currentPage = manager.lastPage;

          await manager.render(manager, interaction);

          interaction.followUp({
            embeds: [new CustomEmbed(message.member, "✅ successfully deleted this avatar")],
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction
            .reply({
              embeds: [new CustomEmbed(message.member, "failed to delete this avatar")],
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => {
              interaction.followUp({
                embeds: [new CustomEmbed(message.member, "failed to delete this avatar")],
                flags: MessageFlags.Ephemeral,
              });
            });
        }

        return manager.listen();
      },
    ),
    updateEmbed(page, embed) {
      embed.setImage(page[0].value);
      embed.setFooter({
        text: `${formatDate(page[0].createdAt)} | ${manager.currentPage}/${manager.lastPage}`,
      });

      return embed;
    },
  });

  manager.currentPage = index + 1;

  return manager.listen();
}

async function runUsernameHistory(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (await onCooldown("usernamehistory", message.member)) {
    const res = await getResponse("usernamehistory", message.member);

    if (res.respond) send({ embeds: [res.embed] });
    return;
  }

  let member: GuildMember;

  if (args.length == 0) {
    member = message.member;
  } else {
    if (["clear", "-clear"].includes(args[0].toLowerCase())) {
      await clearUsernameHistory(message.member);
      return send({
        embeds: [new CustomEmbed(message.member, "✅ your username history has been cleared")],
      });
    }

    member = await getMember(message.guild, args.join(" "));
  }

  if (!member) {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  await addCooldown("usernamehistory", message.member, 5);

  if (!(await hasProfile(member))) {
    return send({
      embeds: [new CustomEmbed(message.member, "this user has no username history")],
    });
  }

  const [isUserTracking, history] = await Promise.all([
    isTracking(member),
    fetchUsernameHistory(member),
  ]);

  if (history.length == 0) {
    return send({
      embeds: [new CustomEmbed(message.member, "this user has no username history")],
    });
  }

  if (!isUserTracking) {
    history.unshift({
      value: "[tracking disabled]",
      createdAt: new Date(),
    });
  }

  const pages = PageManager.createPages(history, 7);

  const embed = new CustomEmbed(message.member)
    .setTitle(member.user.username)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }));

  let description = "";

  for (const item of pages.get(1)) {
    description += `\`${item.value}\` | <t:${dayjs(item.createdAt).unix()}:d>\n`;
  }

  embed.setDescription(description);

  if (pages.size > 1) {
    embed.setFooter({ text: `page 1/${pages.size}` });
  }

  let row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("btn-previous-page")
      .setLabel("back")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder().setCustomId("btn-next-page").setLabel("next").setStyle(ButtonStyle.Primary),
  );

  let msg: Message;

  if (pages.size == 1) {
    return await send({ embeds: [embed] });
  } else {
    msg = await send({ embeds: [embed], components: [row] });
  }

  if (pages.size == 1) return;

  let currentPage = 1;
  const lastPage = pages.size;

  const filter = (i: Interaction) => i.user.id == message.author.id;

  const pageManager = async (): Promise<void> => {
    const reaction = await msg
      .awaitMessageComponent({ filter, time: 30000 })
      .then(async (collected) => {
        await collected.deferUpdate();
        return collected.customId;
      })
      .catch(async () => {
        await msg.edit({ components: [] });
      });

    if (!reaction) return;

    const newEmbed = new CustomEmbed(message.member)
      .setTitle(member.user.username)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }));

    if (reaction == "btn-previous-page") {
      if (currentPage <= 1) {
        return pageManager();
      } else {
        currentPage--;

        let description = "";

        for (const item of pages.get(currentPage)) {
          description += `\`${item.value}\` | <t:${dayjs(item.createdAt).unix()}:d>\n`;
        }

        newEmbed.setDescription(description);

        newEmbed.setFooter({ text: `page ${currentPage}/${lastPage}` });
        if (currentPage == 1) {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("btn-previous-page")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId("btn-next-page")
              .setLabel("next")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
          );
        } else {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("btn-previous-page")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
            new ButtonBuilder()
              .setCustomId("btn-next-page")
              .setLabel("next")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
          );
        }
        await msg.edit({ embeds: [newEmbed], components: [row] });
        return pageManager();
      }
    } else if (reaction == "btn-next-page") {
      if (currentPage >= lastPage) {
        return pageManager();
      } else {
        currentPage++;

        let description = "";

        for (const item of pages.get(currentPage)) {
          description += `\`${item.value}\` | <t:${dayjs(item.createdAt).unix()}:d>\n`;
        }

        newEmbed.setDescription(description);

        newEmbed.setFooter({ text: `page ${currentPage}/${lastPage}` });
        if (currentPage == lastPage) {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("btn-previous-page")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
            new ButtonBuilder()
              .setCustomId("btn-next-page")
              .setLabel("next")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),
          );
        } else {
          row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("btn-previous-page")
              .setLabel("back")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
            new ButtonBuilder()
              .setCustomId("btn-next-page")
              .setLabel("next")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(false),
          );
        }
        await msg.edit({ embeds: [newEmbed], components: [row] });
        return pageManager();
      }
    }
  };

  return pageManager();
}

async function runJoin(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  let mode: "member" | "position" = "member";

  let member: GuildMember;

  if (args.length == 0) {
    member = message.member;
  } else if (parseInt(args[0])) {
    mode = "position";
  } else {
    member = await getMember(message.guild, args.join(" "));
  }

  if (!member && mode === "member") {
    return send({ embeds: [new ErrorEmbed("invalid user")] });
  }

  const members = await getAllMembersRest(message.guildId);

  let membersSorted: JoinOrderEntry[] = [];
  let msg: Message;

  const cached = await joinOrderCache.get(message.guildId);
  if (cached) {
    membersSorted = cached;
  } else {
    if (members.length > 2000) {
      if (members.length > 5000)
        msg = await send({
          embeds: [
            new CustomEmbed(message.member, `sorting ${members.length.toLocaleString()} members..`),
          ],
        });

      membersSorted = await workerSort(
        members.map((i) => ({ id: i.userId, joinedTimestamp: i.joinedTimestamp })),
        "joinedTimestamp",
        "asc",
      );
    } else {
      membersSorted = sort(
        members.map((i) => ({ id: i.userId, joinedTimestamp: i.joinedTimestamp })),
      ).asc((i) => i.joinedTimestamp);
    }

    await joinOrderCache.set(message.guildId, membersSorted);
  }

  if (mode === "position") {
    if (!membersSorted[parseInt(args[0]) - 1]) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    member = await message.guild.members.fetch(membersSorted[parseInt(args[0]) - 1].id);
  }

  const joinPos =
    mode === "position"
      ? parseInt(args[0])
      : membersSorted.findIndex((i) => i.id === member.id) + 1;

  const joinedServer = formatDate(member.joinedAt).toLowerCase();
  const timeAgo = daysAgo(new Date(member.joinedAt));

  const container = new CustomContainer(member).addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents((text) =>
        text.setContent(
          `### ${member.user.username}\njoined: **${joinedServer}**` +
            `\n> ${timeAgo.toLocaleString()} ${pluralize("day", timeAgo)} ago` +
            `\nposition: **#${joinPos !== 0 ? joinPos.toLocaleString() : "--"}**`,
        ),
      )
      .setThumbnailAccessory((thumbnail) =>
        thumbnail.setURL(member.user.displayAvatarURL({ size: 128 })),
      ),
  );

  if (msg) msg.edit({ components: [container], embeds: [], flags: MessageFlags.IsComponentsV2 });
  else send({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

cmd.setRun(async (message, send, args) => {
  let action: keyof typeof actions = "info";

  if (!(message instanceof Message) && message.isChatInputCommand()) {
    action = message.options.getSubcommand() as keyof typeof actions;
    const user = message.options.getUser("user");
    args = user ? [`<@${user.id}>`] : [];

    if (action === "info" && message.options.getBoolean("id-only")) {
      args.push("-id");
    } else if (action === "join") {
      const position = message.options.getInteger("position");

      if (user && position !== null) {
        return send({
          embeds: [new ErrorEmbed("choose either a user or a join position")],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (position !== null) args = [position.toString()];
    } else if (action === "avatar-history" || action === "username-history") {
      if (message.options.getBoolean("clear")) {
        if (user && user.id !== message.author.id) {
          return send({
            embeds: [new ErrorEmbed("you can only clear your own history")],
            flags: MessageFlags.Ephemeral,
          });
        }

        args = ["clear"];
      } else if (action === "avatar-history") {
        const page = message.options.getInteger("page");
        args = page === null ? [] : [page.toString()];
      }
    }
  } else if (args[0] && Object.hasOwn(actions, args[0].toLowerCase())) {
    action = args[0].toLowerCase() as keyof typeof actions;
    args = args.slice(1);
  }

  return actions[action].run(message, send, args);
});

module.exports = cmd;

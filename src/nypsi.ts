import { getInfo } from "discord-hybrid-sharding";
import { ActivityType, GatewayIntentBits, Options, Partials } from "discord.js";
import { NypsiClient } from "./models/Client";

const client = new NypsiClient({
  allowedMentions: {
    parse: ["users", "roles"],
  },
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: {
      interval: 45,
      filter: () => (msg) => {
        if (!msg.author) return true;
        if (msg.author?.bot) return true;

        if (msg.createdTimestamp > Date.now() - 30000 || msg.editedTimestamp > Date.now() - 30000)
          return false;

        return true;
      },
    },
    guildMembers: {
      interval: 900,
      filter: () => (member) => {
        if (member.id === member.client.user.id) return false;
        if (!member.user) return true;
        if (member.user.bot) return true;

        if (recentCommands.has(member.id)) return false;
      },
    },
    users: {
      interval: 900,
      filter: () => (user) => {
        if (!user) return true;
        if (user.id === user.client.user.id) return false;
        if (user.bot) return true;

        if (recentCommands.has(user.id)) return false;
      },
    },
  },
  makeCache: Options.cacheWithLimits({
    ApplicationCommandManager: 0,
    BaseGuildEmojiManager: 0,
    GuildBanManager: 0,
    GuildInviteManager: 0,
    GuildStickerManager: 0,
    GuildScheduledEventManager: 0,
    MessageManager: 10,
    GuildMessageManager: 10,
    PresenceManager: 0,
    ReactionManager: 0,
    ReactionUserManager: 0,
    StageInstanceManager: 0,
    ThreadManager: 0,
    ThreadMemberManager: 0,
    VoiceStateManager: 0,
    GuildEmojiManager: 0,
    AutoModerationRuleManager: 0,
    GuildForumThreadManager: 0,
    GuildTextThreadManager: 0,
    DMMessageManager: 0,
    UserManager: {
      maxSize: 2_500,
      keepOverLimit: (user) => {
        if (user.id === user.client.user.id) return true;
        if (user.bot) return false;

        if (recentCommands.has(user.id)) return true;
        else return false;
      },
    },
    GuildMemberManager: {
      maxSize: 2_500,
      keepOverLimit: (user) => {
        if (user.id === user.client.user.id) return true;
        if (user.user.bot) return false;

        if (recentCommands.has(user.id)) return true;
        else return false;
      },
    },
  }),
  presence: {
    status: "dnd",
    activities: [
      {
        name: "loading..",
        type: ActivityType.Custom,
      },
    ],
  },
  rest: {
    offset: 0,
  },
  shards: getInfo().SHARD_LIST,
  shardCount: getInfo().TOTAL_SHARDS,
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel], // for direct messages
});

import { recentCommands } from "./utils/functions/users/commands";
import { loadCommands } from "./utils/handlers/commandhandler";
import { loadInteractions } from "./utils/handlers/interactions";
import { logger } from "./utils/logger";
import ms = require("ms");

loadCommands();
loadInteractions();
client.loadEvents();

setTimeout(() => {
  logger.info("logging in...");
  client.login(process.env.BOT_TOKEN);
}, 500);

process.on("uncaughtException", (error) => {
  logger.error(error.message, { type: error.name, stack: error.stack, error });
});

process.on("unhandledRejection", (error: any) => {
  logger.error(error.message, { type: error.name, stack: error.stack, error });
});

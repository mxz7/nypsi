import { getInfo } from "discord-hybrid-sharding";
import { ActivityType, GatewayIntentBits, Options, Partials } from "discord.js";
import { NypsiClient } from "./models/Client";
import ms = require("ms");

// when first seen in cache
const cacheTimestamp = new Map<string, number>();

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

        return !(
          msg.createdTimestamp > Date.now() - 30000 || msg.editedTimestamp > Date.now() - 30000
        );
      },
    },
    guildMembers: {
      interval: 900,
      filter: () => (member) => {
        if (!member || !member.user) return true;

        const now = Date.now();

        if (!cacheTimestamp.has(member.id)) {
          cacheTimestamp.set(member.id, now);
        }

        if (now - cacheTimestamp.get(member.id) < ms("45 minutes")) return false;

        if (member.id === member.client.user.id) return false;
        if (member.user.bot) return true;

        if (recentCommands.has(member.id)) return false;

        return true;
      },
    },
    users: {
      interval: 900,
      filter: () => (user) => {
        if (!user) return true;

        const now = Date.now();

        if (!cacheTimestamp.has(user.id)) {
          cacheTimestamp.set(user.id, now);
        }

        if (now - cacheTimestamp.get(user.id) < ms("45 minutes")) return false;

        if (user.id === user.client.user.id) return false;
        if (user.bot) return true;

        if (recentCommands.has(user.id)) return false;

        return true;
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
        if (!cacheTimestamp.has(user.id)) return false;
        if (cacheTimestamp.get(user.id) < ms("45 minutes")) return false;

        return recentCommands.has(user.id);
      },
    },
    GuildMemberManager: {
      maxSize: 2_500,
      keepOverLimit: (user) => {
        if (user.id === user.client.user.id) return true;
        if (user.user.bot) return false;

        return recentCommands.has(user.id);
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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildExpressions,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Channel], // for direct messages
});

import { recentCommands } from "./utils/functions/users/commands";
import { loadCommands } from "./utils/handlers/commandhandler";
import { loadInteractions } from "./utils/handlers/interactions";
import { logger } from "./utils/logger";

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

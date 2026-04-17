import { getInfo } from "discord-hybrid-sharding";
import { ActivityType, GatewayIntentBits, Options, Partials } from "discord.js";
import { NypsiClient } from "./models/Client";
import { getLastCommandSync } from "./utils/functions/guilds/commands";
import ms = require("ms");

// when first seen in cache
const cacheTimestamp = new Map<string, number>();
const minTimeInCache = { guildMember: ms("2 minutes"), user: ms("10 minutes") };
const inactiveGuild = ms("30 days");

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
        if (!member.guild?.id) return true;
        if (member.user.id === member.client.user.id) return false;

        const lastGuildCommand = getLastCommandSync(member.guild.id);

        const now = Date.now();

        if (typeof lastGuildCommand === "number" && lastGuildCommand > now - inactiveGuild) {
          // guild is inactive - no point storing data
          return false;
        }

        const key = `${member.guild.id}-${member.id}`;

        if (!cacheTimestamp.has(key)) {
          cacheTimestamp.set(key, now);
          return false;
        } else if (cacheTimestamp.get(key) < now - minTimeInCache.guildMember) {
          // if they've been in cache longer than min time
          if (recentCommands.has(member.id)) {
            return false;
          } else {
            cacheTimestamp.delete(key);
            return true;
          }
        } else {
          // been in cache less than min time
          return false;
        }
      },
    },
    users: {
      interval: 900,
      filter: () => (user) => {
        if (!user) return true;
        if (user.id === user.client.user.id) return false;

        if (!cacheTimestamp.has(user.id)) {
          cacheTimestamp.set(user.id, Date.now());
          return false;
        } else if (cacheTimestamp.get(user.id) < Date.now() - minTimeInCache.user) {
          // if they've been in cache longer than min time
          if (recentCommands.has(user.id)) {
            return false;
          } else {
            cacheTimestamp.delete(user.id);
            return true;
          }
        } else {
          // been in cache less than min time
          return false;
        }
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

        if (!cacheTimestamp.has(user.id)) {
          cacheTimestamp.set(user.id, Date.now());
          return true;
        } else if (cacheTimestamp.get(user.id) < Date.now() - minTimeInCache.user) {
          // if they've been in cache longer than min time
          if (recentCommands.has(user.id)) {
            return true;
          } else {
            cacheTimestamp.delete(user.id);
            return false;
          }
        } else {
          // been in cache less than min time
          return true;
        }
      },
    },
    GuildMemberManager: {
      maxSize: 2_500,
      keepOverLimit: (user) => {
        if (user.id === user.client.user.id) return true;
        if (!user.guild?.id) return false;

        const lastGuildCommand = getLastCommandSync(user.guild.id);

        if (typeof lastGuildCommand === "number" && lastGuildCommand > Date.now() - inactiveGuild) {
          // guild is inactive - no point storing data
          return false;
        }

        const now = Date.now();

        const key = `${user.guild.id}-${user.id}`;

        if (!cacheTimestamp.has(key)) {
          cacheTimestamp.set(key, now);
          return true;
        } else if (cacheTimestamp.get(key) < now - minTimeInCache.guildMember) {
          // if they've been in cache longer than min time
          if (recentCommands.has(user.id)) {
            return true;
          } else {
            cacheTimestamp.delete(key);
            return false;
          }
        } else {
          // been in cache less than min time
          return true;
        }
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

setInterval(() => {
  const cutoff = Date.now() - Math.max(minTimeInCache.user, minTimeInCache.guildMember);

  let count = 0;

  for (const [key, ts] of cacheTimestamp) {
    if (ts < cutoff) {
      cacheTimestamp.delete(key);
      count++;
    }
  }

  if (count > 0) logger.info(`cache: cleared ${count} old entries that were never swept`);
}, 60_000 * 15); // every 15 min

process.on("uncaughtException", (error) => {
  logger.error(error.message, { type: error.name, stack: error.stack, error });
});

process.on("unhandledRejection", (error: any) => {
  logger.error(error.message, { type: error.name, stack: error.stack, error });
});

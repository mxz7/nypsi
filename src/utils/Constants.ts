import { ColorResolvable } from "discord.js";

const products = new Map<string, string>();

products.set("platinum", "platinum");
products.set("gold", "gold");
products.set("silver", "silver");
products.set("bronze", "bronze");
products.set("dfcfa66092", "basic_crate");
products.set("595ba15808", "69420_crate");
products.set("5569964b90", "nypsi_crate");

export default {
  redis: {
    cooldown: {
      SUPPORT: "cd:support",
      ROB_RADIO: "cd:rob-radio",
      SEX_CHASTITY: "cd:sex-chastity",
      AUCTION_WATCH: "cd:auctionwatch",
      GUILD_CREATE: "cd:guildcreate",
    },
    cache: {
      SUPPORT: "cache:support",
      premium: {
        LEVEL: "cache:premium:level",
      },
      user: {
        LASTFM: "cache:user:lastfm",
        KARMA: "cache:user:karma",
        TRACKING: "cache:user:tracking",
        EXISTS: "cache:user:exists",
        LAST_COMMAND: "cache:user:lastcmd",
        DM_SETTINGS: "cache:user:dmsettings",
      },
      guild: {
        EXISTS: "cache:guild:exists",
        PREFIX: "cache:guild:prefix",
        PERCENT_MATCH: "cache:guild:percentmatch",
        LOGS: "cache:guild:logs",
        SLASH_ONLY: "cache:guild:slashonly",
        MODLOGS: "cache:guild:modlogs",
      },
      economy: {
        BALANCE: "cache:economy:balance",
        DEFAULT_BET: "cache:economy:defaultbet",
        GUILD_USER: "cache:economy:guild:user",
        GUILD_REQUIREMENTS: "cache:economy:guild:requirements",
        BOOSTERS: "cache:economy:boosters",
        INVENTORY: "cache:economy:inventory",
        EXISTS: "cache:economy:exists",
        PRESTIGE: "cache:economy:prestige",
        BANNED: "cache:economy:banned",
        XP: "cache:economy:xp",
        NETWORTH: "cache:economy:networth",
        VOTE: "cache:economy:vote",
        AUCTION_AVG: "cache:economy:auctionavg",
      },
    },
    nypsi: {
      RESTART: "nypsi:restarting",
      TOP_COMMANDS_USER: "nypsi:topcommands:user",
      STEVE_EARNED: "nypsi:steveearned",
      PRESENCE: "nypsi:presence",
      NEWS_SEEN: "nypsi:news:seen",
      NEWS: "nypsi:news",
      CAPTCHA_VERIFIED: "nypsi:captcha_verified",
      GUILD_LOG_QUEUE: "nypsi:guild:logs:queue",
      TOP_COMMANDS: "nypsi:topcommands",
      VOTE_REMINDER_RECEIVED: "nypsi:vote_reminder:received",
      TAX: "nypsi:tax",
      DM_QUEUE: "nypsi:dmqueue",
    },
  },
  BRONZE_ROLE_ID: "819870590718181391",
  SILVER_ROLE_ID: "819870727834566696",
  GOLD_ROLE_ID: "819870846536646666",
  PLATINUM_ROLE_ID: "819870959325413387",
  BOOST_ROLE_ID: "747066190530347089",
  NYPSI_SERVER_ID: "747056029795221513",
  TEKOH_ID: "672793821850894347",
  MAX_AUCTION_PER_ITEM: 25_000_000,
  TRANSPARENT_EMBED_COLOR: "#36393f" as ColorResolvable,
  KOFI_PRODUCTS: products,
  EMBED_SUCCESS_COLOR: "#5efb8f" as ColorResolvable,
  EMBED_FAIL_COLOR: "#e4334f" as ColorResolvable,
  MAX_GUILD_LEVEL: 69,
};

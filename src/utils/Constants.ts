import { ColorResolvable } from "discord.js";

const products = new Map<string, { name: string; cost: number }>();

products.set("platinum", { name: "platinum", cost: 7 });
products.set("gold", { name: "gold", cost: 3 });
products.set("silver", { name: "silver", cost: 2.5 });
products.set("bronze", { name: "bronze", cost: 1 });
products.set("dfcfa66092", { name: "basic_crate", cost: 1 });
products.set("595ba15808", { name: "69420_crate", cost: 0.5 });
products.set("5569964b90", { name: "nypsi_crate", cost: 3.99 });
products.set("1e62c44770", { name: "workers_crate", cost: 2.99 });
products.set("4b1d3a70b2", { name: "boosters_crate", cost: 2.99 });
products.set("4ec1ebe6b4", { name: "gem_crate", cost: 14.99 });
products.set("d18331a5bb", { name: "gem_shard", cost: 0 });
products.set("1d78b621a5", { name: "unecoban", cost: 19.99 });
products.set("0aec346b01", { name: "omega_crate", cost: 9.99 });

export default {
  redis: {
    cooldown: {
      AUCTION_WATCH: "cd:auctionwatch",
      GUILD_CREATE: "cd:guildcreate",
      ROB_RADIO: "cd:rob-radio",
      SEX_CHASTITY: "cd:sex-chastity",
      SUPPORT: "cd:support",
    },
    cache: {
      IMAGE: "nypsi:image",
      minecraft: {
        UUID: "cache:minecraft:uuid",
        NAME_HISTORY: "cache:minecraft:namehistory",
      },
      SUPPORT: "cache:support",
      premium: {
        ALIASES: "cache:premium:aliases",
        LEVEL: "cache:premium:level",
        BOOSTER: "cache:premium:booster",
        COLOR: "cache:premium:color",
        TOTAL_SPEND: "cache:premium:spend",
      },
      user: {
        DM_BLOCK: "cache:user:dmblock",
        BLACKLIST: "cache:user:blacklist",
        DM_SETTINGS: "cache:user:dmsettings",
        PREFERENCES: "cache:user:preferences",
        EXISTS: "cache:user:exists",
        KARMA: "cache:user:karma",
        LAST_COMMAND: "cache:user:lastcmd",
        LASTFM: "cache:user:lastfm",
        TRACKING: "cache:user:tracking",
        ADMIN_LEVEL: "cache:user:adminlvl",
        tags: "cache:user:tags",
        tagCount: "cache:tagcount",
        captcha_fail: "nypsi:user:captcha:fail",
        captcha_pass: "nypsi:user:captcha:pass",
        username: "cache:user:username",
        avatar: "cache:user:avatar",
        views: "cache:user:views",
        aura: "cache:user:aura",
      },
      guild: {
        EXISTS: "cache:guild:exists",
        LOGS: "cache:guild:logs",
        MODLOGS: "cache:guild:modlogs",
        PERCENT_MATCH: "cache:guild:percentmatch",
        PREFIX: "cache:guild:prefix",
        REACTION_ROLES: "cache:guild:reactionroles",
        SLASH_ONLY: "cache:guild:slashonly",
        ALT_PUNISH: "cache:guild:altpunish",
        LOGS_GUILDS: "cache:guild:logs:guilds",
        MODLOGS_GUILDS: "cache:guild:modlogs:guilds",
        JOIN_ORDER: "cache:guild:join:order",
        RECENTLY_ATTACKED: "cache:guild:recentlyattacked",
        ALTS: "cache:guilds:alts",
        EVIDENCE_MAX: "cache:guilds:evidence:max",
        AUTOMUTE_VL: "cache:guild:automute",
        CHATFILTER: "cache:guild:chatfilter",
      },
      chatReaction: {
        EXISTS: "cache:chatreaction:exists",
        WORD_LIST_TYPE: "cache:chatreaction:wordlist:type",
        WORD_LIST: "cache:chatreaction:wordlist:words",
      },
      economy: {
        farm: "cache:economy:farm",
        farmUpgrades: "cache:economy:farmupgrades",
        TASKS: "cache:economy:tasks",
        AUTO_SELL: "cache:economy:autosell",
        SELL_FILTER: "cache:economy:sellallfilter",
        AUCTION_AVG: "cache:economy:auctionavg",
        OFFER_AVG: "cache:economy:offeravg",
        AUCTION_ITEM_GRAPH_DATA: "cache:economy:auction:historydata",
        BAKERY_UPGRADES: "cache:economy:bakery:upgrades",
        BALANCE: "cache:economy:balance",
        BANNED: "cache:economy:banned",
        BOOSTERS: "cache:economy:boosters",
        DEFAULT_BET: "cache:economy:defaultbet",
        EXISTS: "cache:economy:exists",
        GUILD_LEVEL: "cache:economy:guild:level",
        GUILD_REQUIREMENTS: "cache:economy:guild:requirements",
        GUILD_USER: "cache:economy:guild:user",
        GUILD_UPGRADES: "cache:economy:guild:upgrades",
        INVENTORY: "cache:economy:inventory",
        NETWORTH: "cache:economy:networth",
        PADLOCK: "cache:economy:padlock",
        PASSIVE: "cache:economy:passive",
        PRESTIGE: "cache:economy:prestige",
        VOTE: "cache:economy:vote",
        XP: "cache:economy:xp",
        LEVEL: "cache:economy:level",
        UPGRADES: "cache:economy:upgrades",
        GARAGE: "cache:economy:garage",
        LEVELLING_UP: "cache:economy:levellingup",
        COMPLETION_LB: "cache:economy:lb:completion",
        ITEM_EXISTS: "cache:economy:item:exists",
      },
      z: {
        profile: "cache:z:profile",
      },
    },
    nypsi: {
      MENTION_QUEUE: "nypsi:mention:queue",
      MENTION_DELAY: "nypsi:mention:delay",
      MENTION_MAX: "nypsi:mention:max",
      MENTION_DM_TEKOH_THRESHOLD: "nypsi:mention:warn",
      CAPTCHA_VERIFIED: "nypsi:captcha_verified",
      DM_QUEUE: "nypsi:dmqueue",
      INLINE_QUEUE: "nypsi:inlinequeue",
      GEM_GIVEN: "nypsi:gemgiven",
      GUILD_LOG_QUEUE: "nypsi:guild:logs:queue",
      HOURLY_DB_REPORT: "nypsi:hourlydbreport",
      LOCKED_OUT: "nypsi:requirescaptcha",
      MILF_QUEUE: "nypsi:milf:queue",
      NEWS_SEEN: "nypsi:news:seen",
      NEWS: "nypsi:news",
      PRESENCE: "nypsi:presence",
      RESTART: "nypsi:restarting",
      STEVE_EARNED: "nypsi:steveearned",
      TAX: "nypsi:tax",
      TOP_COMMANDS_USER: "nypsi:topcommands:user",
      TOP_COMMANDS: "nypsi:topcommands",
      USERS_PLAYING: "nypsi:users:playing",
      VOTE_REMINDER_RECEIVED: "nypsi:vote_reminder:received",
      FORCE_LOSE: "nypsi:forcelose",
      KARMA_SHOP_OPEN: "nypsi:ks:open",
      KARMA_LAST_OPEN: "nypsi:ks:lastopen",
      KARMA_NEXT_OPEN: "nypsi:ks:nextopen",
      KARMA_SHOP_ITEMS: "nypsi:ks:items",
      KARMA_SHOP_BUYING: "nypsi:ks:buying",
      AUTO_SELL_ITEMS: "nypsi:autosell:items",
      AUTO_SELL_ITEMS_MEMBERS: "nypsi:autosell:items:members",
      AUTO_SELL_PROCESS: "nypsi:autosell:process",
      OFFER_PROCESS: "nypsi:offer:process",
      RICKROLL: "nypsi:rickroll",
      COMMAND_WATCH: "nypsi:cmdwatch",
      PROFILE_TRANSFER: "nypsi:profiletransfer",
      DAILY_ACTIVE: "nypsi:dailyactive",
      MONTHLY_ACTIVE: "nypsi:monthlyactive",
      DAILY_COMMANDS: "nypsi:dailycommands",
      HOURLY_COMMAND_PREPROCESS: "nypso:preprocess",
      CRASH_STATUS: "nypsi:crash:status",
      FARM_STATUS_DM: "nypsi:farm:status:dm",
      auction_buying: "nypsi:auction:buying",
    },
  },
  ANNOUNCEMENTS_CHANNEL_ID: "747057465245564939",
  AUCTION_CHANNEL_ID: "1008467335973179482",
  AUCTION_MANAGEMENT_ROLE_IDS: [
    "747056620688900139",
    "747059949770768475",
    "845613231229370429",
    "1105179633919471707",
  ] as string[],
  BOOST_REWARDS_LINK:
    "https://discord.com/channels/747056029795221513/1031950370206924903/1092078265948188842",
  BOOST_ROLE_ID: "747066190530347089",
  BOT_USER_ID: "678711738845102087",
  BRONZE_ROLE_ID: "819870590718181391",
  COLOUR_REGEX: /^#([A-Fa-f0-9]{6})$/,
  MEMBER_MENTION_REGEX: /<@!?[0-9]+>/,
  EMBED_FAIL_COLOR: "#e31e3b" as ColorResolvable,
  EMBED_SUCCESS_COLOR: "#68f78c" as ColorResolvable,
  EMOJI_REGEX: /(<:[A-Za-z_-]+:[0-9]+>)/,
  GOLD_ROLE_ID: "819870846536646666",
  KARMA_SHOP_ROLE_ID: "1088800175532806187",
  KOFI_PRODUCTS: products,
  MAX_GUILD_LEVEL: 420,
  NYPSI_SERVER_ID: "747056029795221513",
  NYPSI_SERVER_INVITE_LINK: "https://discord.gg/hJTDNST",
  PLATINUM_ROLE_ID: "819870959325413387",
  SILVER_ROLE_ID: "819870727834566696",
  SUPPORT_CHANNEL_ID: "1015299117934723173",
  SUPPORT_ROLE_ID: "1091314758986256424",
  TEKOH_ID: "672793821850894347",
  TRANSPARENT_EMBED_COLOR: "#2B2D31" as ColorResolvable,
  PROGRESSION: {
    VOTE_CRATE: new Map([
      [0, 1],
      [5, 2],
      [15, 3],
      [30, 4],
      [50, 5],
    ]),
    MULTI: new Map([
      [0, 0],
      [10, 1],
      [20, 2],
      [35, 3],
      [50, 4],
      [100, 5],
    ]),
  },
  SEASON_START: new Date("01/01/2025"),
  SEASON_NUMBER: 9,
  SNOWFLAKE_REGEX: /^\d{17,19}$/,
  PURPLE: "#8b5cf6" as ColorResolvable,
  HIGHROLLER_ROLE: "1067122363143032992",
  HIGHEROLLER_REQUIREMENT: 500,
  EVIDENCE_BASE: 30000000, // 30MB
  CRASH_CHANNEL: "1300561687975432272",
  WHITELISTED_BOTS: ["974297735559806986"] as string[],
  Z_ROLE: "1316836307242319882",
  Z_CHANNEL: "1316836441204068463",
} as const;

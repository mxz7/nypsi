import { flavors } from "@catppuccin/palette";
import { Client, User, WebhookClient } from "discord.js";
import { WriteStream, createWriteStream, existsSync } from "fs";
import { rename, stat } from "fs/promises";
import DiscordTransport from "../models/DiscordLogs";
import Constants from "./Constants";
import chalk = require("chalk");
import dayjs = require("dayjs");

export type WriteData = {
  level: number;
  label: string;
  date: number;
  message: string;
  meta?: Record<string, any>;
  data?: Record<string, any>;
};
export type Levels = "debug" | "info" | "warn" | "error";

export interface Transport {
  levels: Levels[];
  write: (data: WriteData) => any;
}

const levelLabelMap = new Map<number, Levels>();
levelLabelMap.set(10, "error");
levelLabelMap.set(20, "warn");
levelLabelMap.set(30, "info");
levelLabelMap.set(40, "debug");

class Logger {
  public transports: Transport[];
  public preprocessors: ((data: WriteData) => WriteData | Promise<WriteData>)[];
  public meta: Record<string, any>;

  constructor(meta?: Record<string, any>) {
    this.meta = meta || {};
    this.transports = [];
    this.preprocessors = [];
  }

  public addTransport(transport: Transport) {
    this.transports.push(transport);
    return this;
  }

  public addPreProcessor(preprocessor: (data: WriteData) => WriteData | Promise<WriteData>) {
    this.preprocessors.push(preprocessor);
    return this;
  }

  private async baseLog(message: string, level: number, meta?: Record<string, any>) {
    let data: WriteData = {
      date: Date.now(),
      message: message,
      label: levelLabelMap.get(level),
      level,
      meta: {},
      data: {},
    };

    if (this.meta) {
      for (const i of Object.keys(this.meta)) {
        data.meta[i] = this.meta[i];
      }
    }

    if (meta) {
      for (const i of Object.keys(meta)) {
        data.data[i] = meta[i];
      }
    }

    for (const processor of this.preprocessors) {
      data = await processor(data);
    }

    return data;
  }

  public async info(message: string, meta?: Record<string, any>) {
    const data = await this.baseLog(message, 30, meta);

    for (const transport of this.transports) {
      if (!transport.levels.includes(levelLabelMap.get(data.level))) continue;
      transport.write(data);
    }
  }

  public async debug(message: string, meta?: Record<string, any>) {
    const data = await this.baseLog(message, 40, meta);

    for (const transport of this.transports) {
      if (!transport.levels.includes(levelLabelMap.get(data.level))) continue;
      transport.write(data);
    }
  }

  public async warn(message: string, meta?: Record<string, any>) {
    const data = await this.baseLog(message, 20, meta);

    for (const transport of this.transports) {
      if (!transport.levels.includes(levelLabelMap.get(data.level))) continue;
      transport.write(data);
    }
  }

  public async error(message: string, meta?: Record<string, any>) {
    const data = await this.baseLog(message, 10, meta);

    for (const transport of this.transports) {
      if (!transport.levels.includes(levelLabelMap.get(data.level))) continue;
      await transport.write(data);
    }
  }
}

class FileTransport implements Transport {
  public path: string;
  public levels: Levels[];
  private stream: WriteStream;
  private rotateAfterBytes: number;
  private queue: WriteData[];
  private checkingFile: boolean;
  private lastCheck: number;

  constructor(opts: { path: string; levels: Levels[]; rotateAfterBytes?: number }) {
    this.path = opts.path;
    this.levels = opts.levels;
    this.rotateAfterBytes = opts.rotateAfterBytes || 0;
    this.queue = [];
    this.stream = createWriteStream(this.path.replace(`%DATE%`, dayjs().format("YYYY-MM-DD")), {
      flags: "a",
    });
    this.checkingFile = false;
    this.lastCheck = Date.now();
  }

  private async checkFile() {
    if (this.checkingFile || this.lastCheck > Date.now() - 30000) return;
    this.checkingFile = true;

    const stats = await stat(this.stream.path);

    if (stats.size >= this.rotateAfterBytes && this.rotateAfterBytes > 0) {
      logger.debug("rotating file");

      if (existsSync(this.path.replace(`%DATE%`, dayjs().format("YYYY-MM-DD")))) {
        let oldFileNameModifier = 1;

        while (existsSync(this.stream.path + "." + oldFileNameModifier)) oldFileNameModifier++;
        await rename(this.stream.path, this.stream.path + "." + oldFileNameModifier);

        this.stream?.end();
        this.stream = null;

        this.stream = createWriteStream(this.path.replace(`%DATE%`, dayjs().format("YYYY-MM-DD")), {
          flags: "a",
        });
      } else {
        this.stream?.end();
        this.stream = null;

        this.stream = createWriteStream(this.path.replace(`%DATE%`, dayjs().format("YYYY-MM-DD")), {
          flags: "a",
        });
      }

      if (this.queue) {
        this.queue.forEach(this.write);
        this.queue.length = 0;
      }
    }

    this.checkingFile = false;
  }

  public async write(data: WriteData) {
    if (!this.stream) {
      this.queue.push(data);
      return;
    }

    const out = {
      level: data.label,
      msg: data.message,
      time: data.date,
      data: data.data,
    };

    for (const item in data.meta) {
      // @ts-expect-error grrrr
      out[item] = data.meta[item];
    }

    this.stream.write(
      JSON.stringify(out, (key, value) => (typeof value === "bigint" ? value.toString() : value)) +
        "\n",
    );

    this.checkFile();
  }
}

class ConsoleTransport implements Transport {
  public levels: Levels[];
  public formatter: (data: WriteData) => Promise<string> | string;

  constructor(opts: {
    levels: Levels[];
    formatter?: (data: WriteData) => Promise<string> | string;
  }) {
    this.levels = opts.levels;
    this.formatter = opts.formatter;
  }

  public async write(data: WriteData) {
    let out: string;

    if (this.formatter) {
      out = await this.formatter(data);
    } else {
      out = ConsoleTransport.defaultFormatter(data);
    }

    if (data.level <= 20) {
      return console.error(out);
    } else {
      return console.log(out);
    }
  }

  static defaultFormatter(data: WriteData): string {
    let labelColor = chalk.green;
    let jsonColor = chalk.reset;

    switch (data.label) {
      case "debug":
        labelColor = chalk.gray;
        break;
      case "info":
        labelColor = chalk.green;
        break;
      case "warn":
        labelColor = chalk.yellowBright;
        jsonColor = chalk.yellow;
        break;
      case "error":
        labelColor = chalk.redBright;
        jsonColor = chalk.red;
        break;
    }

    let jsonData = "";

    if (Boolean(data.data) && Object.keys(data.data).length > 0) {
      jsonData = JSON.stringify(
        data.data,
        (key, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      );
      jsonData = jsonColor(jsonData.substring(1, jsonData.length - 1).trim());
    }

    return `${chalk.blackBright.italic(dayjs(data.date).format("MM-DD HH:mm:ss"))} ${labelColor(
      data.label.toUpperCase(),
    )}: ${data.message}${jsonData ? `\n  ${jsonData}` : ""}`;
  }
}

export const logger = new Logger();

const formatter = (data: WriteData) => {
  let labelColor = chalk.green;
  let jsonColor = chalk.reset;
  let messageColor = chalk.reset;

  switch (data.label) {
    case "debug":
      labelColor = chalk.gray;
      break;
    case "info":
      labelColor = chalk.green;
      break;
    case "warn":
      labelColor = chalk.yellowBright.bold;
      jsonColor = chalk.yellow;
      messageColor = chalk.yellow;
      break;
    case "error":
      labelColor = chalk.redBright.bold;
      jsonColor = chalk.red;
      messageColor = chalk.red;
      break;
  }

  if (!data.message) {
    logger.error("no message", data);
    console.trace();
    return;
  }

  if (typeof data.message === "string" && data.message.startsWith("::")) {
    const category = data.message.split(" ").splice(0, 1)[0].substring(2);
    data.message = data.message.split(" ").slice(1).join(" ");

    switch (category.toLowerCase()) {
      case "guild":
        messageColor = chalk.magenta;
        break;
      case "auto":
        messageColor = chalk.blue;
        break;
      case "cmd":
        messageColor = chalk.cyan;
        break;
      case "success":
        messageColor = chalk.green;
        break;
    }
  }

  let jsonData = "";

  if (Boolean(data.data) && Object.keys(data.data).length > 0) {
    jsonData = JSON.stringify(
      data.data,
      (key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    );
    jsonData = jsonColor(
      jsonData
        .substring(1, jsonData.length - 1)
        .trim()
        .replaceAll("\\n", "\n"),
    );
  } else if (typeof data.message === "object") {
    jsonData = JSON.stringify(
      data.message,
      (key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    );
    jsonData = jsonColor(
      jsonData
        .substring(1, jsonData.length - 1)
        .trim()
        .replaceAll("\\n", "\n"),
    );
  }

  return `${chalk.blackBright.italic(dayjs(data.date).format("MM-DD HH:mm:ss.SSS"))} ${labelColor(
    data.label.toUpperCase(),
  )}${
    typeof data.meta["cluster"] != "undefined" ? ` (${data.meta["cluster"]})` : ""
  }: ${messageColor(data.message)}${jsonData ? `\n  ${jsonData}` : ""}`;
};

logger.addTransport(
  new FileTransport({
    path: "./out/combined-%DATE%.log",
    levels: ["debug", "info", "warn", "error"],
    rotateAfterBytes: 10e6,
  }),
);
logger.addTransport(
  new FileTransport({
    path: "./out/error-%DATE%.log",
    levels: ["warn", "error"],
    rotateAfterBytes: 10e6,
  }),
);
logger.addTransport(
  new ConsoleTransport({
    levels: ["debug", "info", "warn", "error"],
    formatter,
  }),
);
logger.addTransport(
  new DiscordTransport({
    formatter,
    levels: ["info", "warn", "error"],
    webhook: process.env.BOTLOGS_HOOK,
    mode: "hybrid",
    interval: 5000,
    colors: new Map([
      ["error", flavors.mocha.colors.red.hex as `#${string}`],
      ["warn", flavors.mocha.colors.yellow.hex as `#${string}`],
      ["debug", flavors.mocha.colors.pink.hex as `#${string}`],
      ["info", flavors.mocha.colors.sky.hex as `#${string}`],
    ]),
  }),
);

const webhook = new Map<string, string>();
const nextLogMsg = new Map<string, string>();

export function setClusterId(id: string) {
  logger.meta = { cluster: id };
}

export function transaction(
  from: { username: string; id: string },
  to: { username: string; id: string },
  value: string,
) {
  if (!nextLogMsg.get("pay")) {
    nextLogMsg.set(
      "pay",
      `**${from.username}** (${from.id}) -> **${to.username}** (${to.id})\n- **${value}**\n`,
    );
  } else {
    nextLogMsg.set(
      "pay",
      nextLogMsg.get("pay") +
        `**${from.username}** (${from.id}) -> **${to.username}** (${to.id})\n- **${value}**\n`,
    );
  }
}

export function transactionMulti(from: User, to: User, values: string[]) {
  let formatted = "";

  for (const value of values) {
    formatted += `- **${value}**\n`;
  }

  if (!nextLogMsg.get("pay")) {
    nextLogMsg.set(
      "pay",
      `**${from.username}** (${from.id}) -> **${to.username}** (${to.id})\n${formatted}`,
    );
  } else {
    nextLogMsg.set(
      "pay",
      nextLogMsg.get("pay") +
        `**${from.username}** (${from.id}) -> **${to.username}** (${to.id})\n${formatted}`,
    );
  }
}

export function gamble(
  user: User,
  game: string,
  amount: number,
  result: string,
  id: string,
  winAmount?: number,
) {
  if (!nextLogMsg.get("gamble")) {
    nextLogMsg.set(
      "gamble",
      `**${user.username}** (${user.id})\n` +
        `- **game** ${game}\n` +
        `- **bet** $${amount.toLocaleString()}\n` +
        `- **result** ${result}${
          result == "win" ? ` ($**${winAmount.toLocaleString()}**)` : ""
        }\n` +
        `- **id** ${id}\n` +
        `- **time** <t:${Math.floor(Date.now() / 1000)}>\n`,
    );
  } else {
    nextLogMsg.set(
      "gamble",
      nextLogMsg.get("gamble") +
        `**${user.username}** (${user.id})\n` +
        `- **game** ${game}\n` +
        `- **bet** $${amount.toLocaleString()}\n` +
        `- **result** ${result}${
          result == "win" ? ` ($**${winAmount.toLocaleString()}**)` : ""
        }\n` +
        `- **id** ${id}\n` +
        `- **time** <t:${Math.floor(Date.now() / 1000)}>\n`,
    );
  }
}

export function getTimestamp(): string {
  const date = new Date();
  let hours = date.getHours().toString();
  let minutes = date.getMinutes().toString();
  let seconds = date.getSeconds().toString();

  if (hours.length == 1) {
    hours = "0" + hours;
  }

  if (minutes.length == 1) {
    minutes = "0" + minutes;
  }

  if (seconds.length == 1) {
    seconds = "0" + seconds;
  }

  const timestamp = hours + ":" + minutes + ":" + seconds;

  return timestamp;
}

export async function getWebhooks(client?: Client) {
  if (client && client.user.id != Constants.BOT_USER_ID) return;

  if (client) {
    webhook.set("pay", process.env.PAYMENTS_HOOK);

    webhook.set("gamble", process.env.GAMBLE_HOOK);

    runLogs();
  }
}

function runLogs() {
  setInterval(() => {
    webhook.forEach((v, k) => {
      const msg = nextLogMsg.get(k);

      if (msg != "" && msg) {
        const hook = new WebhookClient({ url: v });
        hook.send({ content: msg });
        nextLogMsg.set(k, "");
        hook.destroy();
      }
    });
  }, 7500);
}

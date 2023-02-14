import { variants } from "@catppuccin/palette";
import { Client, User, WebhookClient } from "discord.js";
import { createWriteStream, existsSync, WriteStream } from "fs";
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
  public preproccessors: ((data: WriteData) => WriteData | Promise<WriteData>)[];
  public meta: Record<string, any>;

  constructor(meta?: Record<string, any>) {
    this.meta = meta || {};
    this.transports = [];
    this.preproccessors = [];
  }

  public addTransport(transport: Transport) {
    this.transports.push(transport);
    return this;
  }

  public addPreProcessor(preprocessor: (data: WriteData) => WriteData | Promise<WriteData>) {
    this.preproccessors.push(preprocessor);
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

    for (const processor of this.preproccessors) {
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

  constructor(opts: { path: string; levels: Levels[]; rotateAfterBytes?: number }) {
    this.path = opts.path;
    this.levels = opts.levels;
    this.rotateAfterBytes = opts.rotateAfterBytes || 0;
    this.queue = [];
    this.stream = createWriteStream(this.path, { flags: "a" });
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
    };

    for (const item in data.data) {
      // @ts-expect-error grrrr
      out[item] = data.data[item];
    }

    for (const item in data.meta) {
      // @ts-expect-error grrrr
      out[item] = data.meta[item];
    }

    this.stream.write(JSON.stringify(out) + "\n");

    const stats = await stat(this.path);

    if (stats.size >= this.rotateAfterBytes && this.rotateAfterBytes > 0) {
      if (!this.stream) return;
      logger.debug("rotating file");
      this.stream.end();
      this.stream = null;

      let oldFileNameModifier = 1;

      while (existsSync(this.path + "." + oldFileNameModifier)) oldFileNameModifier++;

      await rename(this.path, this.path + "." + oldFileNameModifier);
      this.stream = createWriteStream(this.path);

      if (this.queue) {
        this.queue.forEach(this.write);
        this.queue.length = 0;
      }
    }
  }
}

class ConsoleTransport implements Transport {
  public levels: Levels[];
  public formatter: (data: WriteData) => Promise<string> | string;

  constructor(opts: { levels: Levels[]; formatter?: (data: WriteData) => Promise<string> | string }) {
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
      jsonData = JSON.stringify(data.data, null, 2);
      jsonData = jsonColor(jsonData.substring(1, jsonData.length - 1).trim());
    }

    return `${chalk.blackBright.italic(dayjs(data.date).format("MM-DD HH:mm:ss"))} ${labelColor(
      data.label.toUpperCase()
    )}: ${data.message}${jsonData ? `\n  ${jsonData}` : ""}`;
  }
}

export const logger = new Logger();

const formatter = (data: WriteData) => {
  let labelColor = chalk.green;
  let jsonColor = chalk.reset;
  let messageColor = chalk.white;

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

  if (data.message.startsWith("::")) {
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
    jsonData = JSON.stringify(data.data, null, 2);
    jsonData = jsonColor(
      jsonData
        .substring(1, jsonData.length - 1)
        .trim()
        .replaceAll("\\n", "\n")
    );
  }

  return `${chalk.blackBright.italic(dayjs(data.date).format("MM-DD HH:mm:ss"))} ${labelColor(data.label.toUpperCase())}${
    typeof data.meta["cluster"] != "undefined" ? ` (${data.meta["cluster"]})` : ""
  }: ${messageColor(data.message)}${jsonData ? `\n  ${jsonData}` : ""}`;
};

logger.addTransport(
  new FileTransport({ path: "./out/test.log", levels: ["debug", "info", "warn", "error"], rotateAfterBytes: 10e6 })
);
logger.addTransport(new FileTransport({ path: "./out/testerr.log", levels: ["warn", "error"], rotateAfterBytes: 10e6 }));
logger.addTransport(
  new ConsoleTransport({
    levels: ["debug", "info", "warn", "error"],
    formatter,
  })
);
logger.addTransport(
  new DiscordTransport({
    formatter,
    levels: ["info", "debug", "warn", "error"],
    webhook: process.env.BOTLOGS_HOOK,
    mode: "hybrid",
    interval: 5000,
    colors: new Map([
      ["error", variants.mocha.red.hex as `#${string}`],
      ["warn", variants.mocha.yellow.hex as `#${string}`],
      ["debug", variants.mocha.pink.hex as `#${string}`],
      ["info", variants.mocha.sky.hex as `#${string}`],
    ]),
  })
);

const webhook = new Map<string, string>();
const nextLogMsg = new Map<string, string>();

export function setClusterId(id: number | string) {
  logger.meta = { cluster: id };
}

export function transaction(from: User, to: User, value: string) {
  if (!nextLogMsg.get("pay")) {
    nextLogMsg.set("pay", `**${from.tag}** (${from.id}) -> **${to.tag}** (${to.id})\n - **${value}**\n`);
  } else {
    nextLogMsg.set(
      "pay",
      nextLogMsg.get("pay") + `**${from.tag}** (${from.id}) -> **${to.tag}** (${to.id})\n - **${value}**\n`
    );
  }
}

export function gamble(user: User, game: string, amount: number, win: boolean, id: string, winAmount?: number) {
  if (!nextLogMsg.get("gamble")) {
    nextLogMsg.set(
      "gamble",
      `**${user.tag}** (${user.id})\n` +
        ` - **game** ${game}\n` +
        ` - **bet** $${amount.toLocaleString()}\n` +
        ` - **win** ${win}${win ? ` ($**${winAmount.toLocaleString()}**)` : ""}\n` +
        ` - **id** ${id}\n`
    );
  } else {
    nextLogMsg.set(
      "gamble",
      nextLogMsg.get("gamble") +
        `**${user.tag}** (${user.id})\n` +
        ` - **game** ${game}\n` +
        ` - **bet** $${amount.toLocaleString()}\n` +
        ` - **win** ${win}${win ? ` ($**${winAmount.toLocaleString()}**)` : ""}\n` +
        ` - **id** ${id}\n`
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

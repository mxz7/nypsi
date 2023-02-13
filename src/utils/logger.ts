import chalk = require("chalk");
import dayjs = require("dayjs");
import { createWriteStream, existsSync, WriteStream } from "fs";
import { rename, stat } from "fs/promises";
import sleep from "./functions/sleep";

type WriteData = { level: number; label: string; date: number; message: string; data?: Record<string, any> };
type Levels = "debug" | "info" | "warn" | "error";

interface Transport {
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
      data: {},
    };
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
      date: data.date,
    };

    for (const item in data.data) {
      // @ts-expect-error grrrr
      out[item] = data.data[item];
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

  constructor(opts: { levels: Levels[] }) {
    this.levels = opts.levels;
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

logger.addTransport(
  new FileTransport({ path: "./out/test.log", levels: ["debug", "info", "warn", "error"], rotateAfterBytes: 5e10 })
);
logger.addTransport(new FileTransport({ path: "./out/testerr.log", levels: ["warn", "error"], rotateAfterBytes: 5e10 }));
logger.addTransport(new ConsoleTransport({ levels: ["debug", "info", "warn", "error"] }));

(async () => {
  for (let i = 0; i < 10; i++) {
    logger.debug(`boobies ${i}`, { test: "boobs" });
    logger.info(`boobies ${i}`, { test: "boobs" });
    logger.warn(`boobies ${i}`, { test: "boobs" });
    logger.error(`boobies ${i}`, { test: "boobs", test2: { boobies: "boobies!!!", test: { gay: "sex" } } });
    await sleep(3);
  }
})();

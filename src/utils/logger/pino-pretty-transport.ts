import chalk = require("chalk");
import dayjs = require("dayjs");
import PinoPretty, { PrettyOptions } from "pino-pretty";

module.exports = (opts: PrettyOptions) =>
  PinoPretty({
    ...opts,
    colorize: true,
    translateTime: false,
    customPrettifiers: {
      time: (timestamp) => `${chalk.blackBright.italic(dayjs(Number(timestamp)).format("MM-DD hh:mm:ss"))}`,
      // level: (level) => `${levels.labels[level as unknown as number]}`,
    },
    messageFormat: (log, msgKey) => chalk.reset(log[msgKey]),
  });

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
    messageFormat: (log, msgKey) => {
      let color = chalk.reset;
      if (log.level >= 50) color = chalk.red;

      if ((log[msgKey] as string).startsWith("::")) {
        const category = (log[msgKey] as string).split(" ").splice(0, 1)[0].substring(2);
        log[msgKey] = (log[msgKey] as string).split(" ").slice(1).join(" ");

        switch (category.toLowerCase()) {
          case "guild":
            color = chalk.magenta;
            break;
          case "auto":
            color = chalk.blue;
            break;
          case "cmd":
            color = chalk.cyan;
            break;
          case "success":
            color = chalk.green;
            break;
        }
      }

      return color(log[msgKey]);
    },
  });

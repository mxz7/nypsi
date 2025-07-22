import dayjs = require("dayjs");
import { pluralize } from "./string";

export function formatDate(date: Date | number | dayjs.Dayjs): string {
  return dayjs(date).format("MMM D YYYY").toLowerCase();
}

export function daysAgo(date: Date | number): number {
  date = new Date(date);
  const ms = Math.floor(Date.now() - date.getTime());

  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function daysUntilChristmas(): string {
  let date = new Date(Date.parse(`12/25/${new Date().getUTCFullYear()}`));
  const current = new Date();

  if (current.getMonth() >= 11) {
    if (current.getDate() > 25) {
      date = new Date(Date.parse(`12/25/${new Date().getUTCFullYear() + 1}`));
    } else if (current.getDate() == 25) {
      return "ITS CHRISTMAS";
    }
  }

  return (daysUntil(date) + 1).toString();
}

export function daysUntil(date: Date | number): number {
  date = new Date(date);
  const ms = Math.floor(date.getTime() - Date.now());

  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function MStoTime(ms: number, long = false) {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const daysms = ms % (24 * 60 * 60 * 1000);
  const hours = Math.floor(daysms / (60 * 60 * 1000));
  const hoursms = ms % (60 * 60 * 1000);
  const minutes = Math.floor(hoursms / (60 * 1000));
  const minutesms = ms % (60 * 1000);
  const sec = Math.floor(minutesms / 1000);

  let output = "";

  if (days > 0) {
    output = output + days;
    if (long) {
      output += ` ${pluralize("day", days)} `;
    } else {
      output += "d ";
    }
  }

  if (hours > 0) {
    output = output + hours;
    if (long) {
      output += ` ${pluralize("hour", hours)} `;
    } else {
      output += "h ";
    }
  }

  if (minutes > 0) {
    output = output + minutes;
    if (long) {
      output += ` ${pluralize("minute", minutes)} `;
    } else {
      output += "m ";
    }
  }

  if (sec > 0) {
    output = output + sec;
    if (long) {
      output += ` ${pluralize("second", sec)} `;
    } else {
      output += "s ";
    }
  }

  if (!output) output = `0${long ? " seconds" : "s"}`;

  return output.trim();
}

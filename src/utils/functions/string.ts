import * as CryptoJS from "crypto-js";
import { Item, Plant, PlantUpgrade } from "../../types/Economy";
import { WorkerUpgrades } from "../../types/Workers";

export function cleanString(string: string): string {
  return string.replace(/[^A-z0-9\s]/g, "").toLowerCase();
}

export function encrypt(content: string): string {
  let ciphertext;

  try {
    ciphertext = CryptoJS.AES.encrypt(content, process.env.ENCRYPT_KEY);
  } catch {
    return "noencrypt:@:";
  }

  return ciphertext.toString();
}

export function decrypt(ciphertext: string): string {
  if (ciphertext.startsWith("noencrypt:@:")) {
    return ciphertext.split("noencrypt:@:")[1];
  }

  const bytes = CryptoJS.AES.decrypt(ciphertext, process.env.ENCRYPT_KEY);

  return bytes.toString(CryptoJS.enc.Utf8);
}

export function getZeroWidth() {
  return "​";
}

// chatgpt lol
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 MB";

  const k = 1000;
  const sizes = ["MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const minimumUnitIndex = 0; // Index for MB in the modified sizes array
  let i = Math.floor(Math.log(bytes) / Math.log(k));

  // Ensure that the index is at least the minimum unit index for MB
  if (i < minimumUnitIndex + 2) {
    i = minimumUnitIndex + 2;
  }

  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
  return `${value} ${sizes[i - 2]}`;
}

export function getOrdinalSuffix(num: number): string {
  const lastDigit = num % 10;
  const lastTwoDigits = num % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return "th";
  }

  switch (lastDigit) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export function formatTime(ms: number) {
  const minutes = Math.floor(ms / 60000);
  let seconds = ((ms % 60000) / 1000).toFixed(2);

  if (minutes > 0) {
    seconds = Math.round((ms % 60000) / 1000).toString();
  }

  return `${minutes > 0 ? `${minutes}m` : ""}${seconds}s`;
}

export function getDuration(duration: string): number | undefined {
  const units: Record<string, number> = {
    d: 86400,
    h: 3600,
    m: 60,
    s: 1,
  };

  const regex = /^(\d+d)?(\d+h)?(\d+m)?(\d+s)?$/i;
  const match = duration.toLowerCase().trim().match(regex);
  if (!match) return undefined;

  let totalSeconds = 0;
  const seenUnits = new Set<string>();

  for (let i = 1; i < match.length; i++) {
    const part = match[i];
    if (part) {
      const unit = part.slice(-1);
      const value = parseInt(part.slice(0, -1));

      if (isNaN(value) || seenUnits.has(unit)) {
        return undefined;
      }

      seenUnits.add(unit);
      totalSeconds += value * units[unit];
    }
  }

  return totalSeconds;
}

export function pluralize(text: string, amount: number | bigint, plural?: string): string;
export function pluralize(item: Item, amount: number | bigint): string;
export function pluralize(plantType: Plant, amount: number | bigint): string;
export function pluralize(upgrade: WorkerUpgrades, amount: number | bigint): string;
export function pluralize(upgrade: PlantUpgrade, amount: number | bigint): string;
export function pluralize(
  data: string | Item | WorkerUpgrades | PlantUpgrade | Plant,
  amount: number | bigint,
  plural?: string,
) {
  if (typeof data == "string") return amount == 1 ? data : (plural ?? `${data}s`);

  if ("type_plural" in data) {
    return amount == 1 ? data.type : data.type_plural;
  }

  return amount == 1 ? data.name : (data.plural ?? data.name);
}

export function escapeSpecialCharacters(str: string) {
  return str.replaceAll("_", "\\_");
}

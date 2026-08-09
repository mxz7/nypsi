import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Item, Plant, PlantUpgrade } from "../../types/Economy";
import { WorkerUpgrades } from "../../types/Workers";

const OPENSSL_SALTED_PREFIX = Buffer.from("Salted__");

function deriveOpenSslKey(password: string, salt: Buffer): { iv: Buffer; key: Buffer } {
  const passwordBytes = Buffer.from(password, "utf8");
  let block = Buffer.alloc(0);
  let derived = Buffer.alloc(0);

  while (derived.length < 48) {
    block = createHash("md5").update(block).update(passwordBytes).update(salt).digest();
    derived = Buffer.concat([derived, block]);
  }

  return {
    key: derived.subarray(0, 32),
    iv: derived.subarray(32, 48),
  };
}

export function cleanString(string: string): string {
  return string.replace(/[^A-z0-9\s]/g, "").toLowerCase();
}

export function encrypt(content: string): string {
  try {
    if (!process.env.ENCRYPT_KEY) throw new Error("ENCRYPT_KEY is not set");

    const salt = randomBytes(8);
    const { key, iv } = deriveOpenSslKey(process.env.ENCRYPT_KEY, salt);
    const cipher = createCipheriv("aes-256-cbc", key, iv);
    const encrypted = Buffer.concat([cipher.update(content, "utf8"), cipher.final()]);

    return Buffer.concat([OPENSSL_SALTED_PREFIX, salt, encrypted]).toString("base64");
  } catch {
    return "noencrypt:@:";
  }
}

export function decrypt(ciphertext: string): string {
  if (ciphertext.startsWith("noencrypt:@:")) {
    return ciphertext.split("noencrypt:@:")[1];
  }

  const encrypted = Buffer.from(ciphertext, "base64");
  const salt = encrypted.subarray(8, 16);
  const { key, iv } = deriveOpenSslKey(process.env.ENCRYPT_KEY, salt);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);

  return Buffer.concat([decipher.update(encrypted.subarray(16)), decipher.final()]).toString(
    "utf8",
  );
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

export function escapeFormattingCharacters(str: string) {
  return str.replaceAll("_", "\\_");
}

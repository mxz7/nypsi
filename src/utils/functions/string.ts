import * as CryptoJS from "crypto-js";

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
  return `${value} ${sizes[i - 2].toLowerCase()}`;
}

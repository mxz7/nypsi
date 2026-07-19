export function formatNumber(number: string | number) {
  let value: string | number = number.toString().toLowerCase().replaceAll(",", "");

  if (value.includes("b")) {
    value = parseFloat(value) * 1_000_000_000;
  } else if (value.includes("m")) {
    value = parseFloat(value) * 1_000_000;
  } else if (value.includes("k")) {
    value = parseFloat(value) * 1_000;
  }

  if (isNaN(parseFloat(value.toString()))) return null;

  return Math.floor(parseFloat(value.toString()));
}

export function formatNumberPretty(number: number): string {
  let out: string;
  if (number >= 1e12) {
    out = (number / 1e12).toFixed(1) + "t";
  } else if (number >= 1e9) {
    out = (number / 1e9).toFixed(1) + "b";
  } else if (number >= 1e6) {
    out = (number / 1e6).toFixed(1) + "m";
  } else if (number >= 1e3) {
    out = (number / 1e3).toFixed(1) + "k";
  } else {
    return number.toString();
  }

  return out.replace(".0", "");
}

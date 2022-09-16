import { KarmaShopItem } from "../../models/Karmashop";

declare function require(name: string): any;

const items: { [key: string]: KarmaShopItem } = require("../../../data/karmashop.json");

let karmaShop = false;

export function isKarmaShopOpen(): boolean {
  return karmaShop;
}

export function openKarmaShop() {
  karmaShop = true;
}

export function closeKarmaShop() {
  karmaShop = false;
}

export function getKarmaShopItems() {
  return items;
}

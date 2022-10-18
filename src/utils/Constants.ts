import { ColorResolvable } from "discord.js";

const products = new Map<string, string>();

products.set("platinum", "platinum");
products.set("gold", "gold");
products.set("silver", "silver");
products.set("bronze", "bronze");
products.set("dfcfa66092", "basic_crate");
products.set("595ba15808", "69420_crate");
products.set("5569964b90", "nypsi_crate");

export default {
  BRONZE_ROLE_ID: "819870590718181391",
  SILVER_ROLE_ID: "819870727834566696",
  GOLD_ROLE_ID: "819870846536646666",
  PLATINUM_ROLE_ID: "819870959325413387",
  BOOST_ROLE_ID: "747066190530347089",
  NYPSI_SERVER_ID: "747056029795221513",
  TEKOH_ID: "672793821850894347",
  MAX_AUCTION_PER_ITEM: 25_000_000,
  TRANSPARENT_EMBED_COLOR: "#36393f" as ColorResolvable,
  KOFI_PRODUCTS: products,
};

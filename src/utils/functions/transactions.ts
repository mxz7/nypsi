import { Transaction } from "@prisma/client";
import { getLastKnownUsername } from "./users/tag";
import dayjs = require("dayjs");

export async function formatTransaction(transaction: Transaction, dest?: "discord") {
  return (
    `${dayjs(transaction.createdAt).format("YYYY-MM_DD HH:mm:ss")}: ` +
    `${dest === "discord" && "`"}${transaction.sourceId}${dest === "discord" && "`"} (${await getLastKnownUsername(transaction.sourceId)}) -> ` +
    `${dest === "discord" && "`"}${transaction.targetId}${dest === "discord" && "`"} (${await getLastKnownUsername(transaction.targetId)}) ` +
    `${transaction.type === "item" ? `${transaction.amount.toLocaleString()}x ${transaction.itemId}` : `$${transaction.amount.toLocaleString()}`} ` +
    `${transaction.notes && `| ${transaction.notes}`}`
  );
}

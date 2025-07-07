import { Prisma, Transaction } from "@prisma/client";
import { createWriteStream } from "node:fs";
import prisma from "../../init/database";
import { logger } from "../logger";
import { getLastKnownUsername } from "./users/tag";
import dayjs = require("dayjs");

export async function formatTransaction(transaction: Transaction, dest?: "discord") {
  return (
    `${dayjs(transaction.createdAt).format("YYYY-MM_DD HH:mm:ss")}: ` +
    `${dest === "discord" ? "`" : ""}${transaction.sourceId}${dest === "discord" ? "`" : ""} (${await getLastKnownUsername(transaction.sourceId)}) -> ` +
    `${dest === "discord" ? "`" : ""}${transaction.targetId}${dest === "discord" ? "`" : ""} (${await getLastKnownUsername(transaction.targetId)}) ` +
    `${transaction.type === "item" ? `${transaction.amount.toLocaleString()}x ${transaction.itemId}` : `$${transaction.amount.toLocaleString()}`} ` +
    `${transaction.notes ? `| ${transaction.notes}` : ""}`
  );
}

async function* transactionIterator(query: Prisma.TransactionFindManyArgs["where"]) {
  let currentData: Transaction[] = [];
  let skip = 0;

  do {
    currentData = await prisma.transaction.findMany({
      where: query,
      orderBy: { id: "desc" },
      take: 100,
      skip,
    });
    skip += currentData.length;

    yield currentData;
  } while (currentData.length >= 100);
}

export async function exportTransactions(
  query: Prisma.TransactionFindManyArgs["where"],
): Promise<string> {
  const fileName = `/tmp/tx-${Date.now()}.txt`;
  const stream = createWriteStream(fileName);
  const iterator = transactionIterator(query);

  for await (const data of iterator) {
    logger.debug(`transactions: received chunk (${data.length})`);
    for (const transaction of data) {
      stream.write((await formatTransaction(transaction)) + "\n");
    }
  }

  stream.end();

  return new Promise((resolve) => {
    stream.on("finish", () => {
      stream.close();
      resolve(fileName);
    });
  });
}

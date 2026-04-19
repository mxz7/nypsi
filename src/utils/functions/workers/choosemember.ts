import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { inPlaceSort } from "fast-sort";
import { compareTwoStrings } from "string-similarity";
import { SlimMember } from "../guilds/members";

export default function chooseMember(
  members: SlimMember[],
  targetName: string,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: [members, targetName],
    });
    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

if (!isMainThread) {
  process.title = "nypsi: choosemember worker";
  let target: string;
  const scores: { id: string; score: number }[] = [];
  const members: SlimMember[] = workerData[0];
  const memberName: string = workerData[1];

  for (const member of members) {
    if (member.userId === memberName) {
      target = member.userId;
      break;
    } else if (member.username.toLowerCase() === memberName) {
      target = member.userId;
      break;
    } else {
      let score = 0;

      if (member.username.toLowerCase().startsWith(memberName)) score += 1.5;
      if (member.displayName.toLowerCase().startsWith(memberName)) score += 1.1;
      if (member.nickname?.toLowerCase().startsWith(memberName)) score += 0.5;

      if (member.username.toLowerCase().includes(memberName)) score += 0.75;
      if (member.displayName.toLowerCase().includes(memberName)) score += 0.5;
      if (member.nickname?.toLowerCase().includes(memberName)) score += 0.25;

      const usernameComparison = compareTwoStrings(member.username.toLowerCase(), memberName);
      const displayNameComparison = compareTwoStrings(member.displayName.toLowerCase(), memberName);
      const guildNameComparison = compareTwoStrings(
        member.nickname?.toLowerCase() || "",
        memberName,
      );

      score += usernameComparison * 2.5;
      score += displayNameComparison === 1 ? 1.5 : displayNameComparison;
      score += guildNameComparison === 1 ? 1.2 : displayNameComparison;

      // remember to change on worker
      // higher = require more accurate typing
      if (score > 2) scores.push({ id: member.userId, score });
    }
  }

  if (!target && scores.length > 0) {
    const sortedScores = inPlaceSort(scores).desc((i) => i.score);
    target = members.find((m) => m.userId === sortedScores[0]?.id)?.userId;
  }

  if (!target) {
    parentPort.postMessage(null);
  } else {
    parentPort.postMessage(target);
  }

  process.exit(0);
}

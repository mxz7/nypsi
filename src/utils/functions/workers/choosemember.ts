import { Collection, GuildMember } from "discord.js";
import { inPlaceSort } from "fast-sort";
import { compareTwoStrings } from "string-similarity";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";

export default function chooseMember(
  members: Collection<string, GuildMember>,
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
  let target: GuildMember;
  const scores: { id: string; score: number }[] = [];
  const members: Collection<string, GuildMember> = workerData[0];
  const memberName: string = workerData[1];

  for (const m of members.keys()) {
    const member = members.get(m);

    if (member.user.id === memberName) {
      target = member;
      break;
    } else if (member.user.username.toLowerCase() === memberName.toLowerCase()) {
      target = member;
      break;
    } else {
      let score = 0;

      const usernameComparison = compareTwoStrings(
        member.user.username.toLowerCase(),
        memberName.toLowerCase(),
      );
      const displayNameComparison = compareTwoStrings(
        member.user.displayName.toLowerCase(),
        memberName.toLowerCase(),
      );
      const guildNameComparison = compareTwoStrings(
        member.displayName.toLowerCase(),
        memberName.toLowerCase(),
      );

      score += usernameComparison * 2.5;
      score += displayNameComparison === 1 ? 1.5 : displayNameComparison;
      score += guildNameComparison === 1 ? 1.2 : displayNameComparison;

      if (score > 0.5) scores.push({ id: member.id, score });
    }
  }

  if (!target && scores.length > 0) {
    target = members.get(inPlaceSort(scores).desc((i) => i.score)[0]?.id);
  }

  if (!target) {
    parentPort.postMessage(null);
  } else {
    parentPort.postMessage(target.user.id);
  }

  process.exit(0);
}

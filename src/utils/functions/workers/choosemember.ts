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
  let target: string;
  const scores: { id: string; score: number }[] = [];
  const members: Collection<string, any> = workerData[0];
  const memberName: string = workerData[1];

  for (const m of members.keys()) {
    const member = members.get(m);

    if (member.user.id === memberName) {
      target = member.user.id;
      break;
    } else if (member.user.username.toLowerCase() === memberName.toLowerCase()) {
      target = member.user.id;
      break;
    } else {
      let score = 0;

      if (member.user.username.toLowerCase().startsWith(memberName.toLowerCase())) score += 1;
      if ((member.user.globalName || "").toLowerCase().startsWith(memberName.toLowerCase()))
        score += 0.75;
      if ((member.nickname || "").toLowerCase().startsWith(memberName.toLowerCase())) score += 0.5;

      const usernameComparison = compareTwoStrings(
        member.user.username.toLowerCase(),
        memberName.toLowerCase(),
      );
      const displayNameComparison = compareTwoStrings(
        (member.user.globalName || "").toLowerCase(),
        memberName.toLowerCase(),
      );
      const guildNameComparison = compareTwoStrings(
        (member.nickname || "").toLowerCase(),
        memberName.toLowerCase(),
      );

      score += usernameComparison * 2.5;
      score += displayNameComparison === 1 ? 1.5 : displayNameComparison;
      score += guildNameComparison === 1 ? 1.2 : displayNameComparison;

      if (score > 2.5) scores.push({ id: member.user.id, score });
    }
  }

  if (!target && scores.length > 0) {
    target = members.get(inPlaceSort(scores).desc((i) => i.score)[0]?.id).user.id;
  }

  if (!target) {
    parentPort.postMessage(null);
  } else {
    parentPort.postMessage(target);
  }

  process.exit(0);
}

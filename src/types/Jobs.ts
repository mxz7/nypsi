import { ClusterManager } from "discord-hybrid-sharding";

export type Job = {
  name: string;
  cron: string;
  run:
    | ((log: (message: string) => void, manager?: ClusterManager) => any)
    | ((log: (message: string) => void, manager?: ClusterManager) => Promise<any>);
};

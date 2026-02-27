import { ClusterManager } from "discord-hybrid-sharding";

export type Job = {
  name: string;
  cron: string;
  run:
    | ((log: (message: string, data?: Record<any, any>) => void, manager?: ClusterManager) => any)
    | ((
        log: (message: string, data?: Record<any, any>) => void,
        manager?: ClusterManager,
      ) => Promise<any>);
};

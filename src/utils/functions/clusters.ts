import { ClusterManager } from "discord-hybrid-sharding";
import { NypsiClient } from "../../models/Client";

export async function findChannelCluster(client: NypsiClient | ClusterManager, channelId: string) {
  const clusterHas = await (client instanceof ClusterManager
    ? client
    : client.cluster
  ).broadcastEval(
    async (c, { channelId }) => {
      const client = c as unknown as NypsiClient;

      const channel = client.channels.cache.get(channelId);

      if (channel && !channel.isDMBased()) {
        return { cluster: client.cluster.id, guildId: channel.guildId };
      } else {
        return "not-found";
      }
    },
    {
      context: { channelId },
    },
  );

  for (const i of clusterHas) {
    if (i != "not-found") {
      return i;
    }
  }

  return null;
}

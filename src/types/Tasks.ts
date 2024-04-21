export interface Task {
  id: string;
  name: string;
  description: string;
  complete_gif?: string;
  target: number[]; // random from the list;
  prizes: string[]; // random prize will be chosen. in format of (id/money/xp/karma):(item/amount):(amount if item)
  type: "daily" | "weekly";
}

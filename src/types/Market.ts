export interface DMQueue {
  userId: string;
  createdAt: number; // unix date
  earned: number;
  items: Record<string, Record<string, number>>;
}

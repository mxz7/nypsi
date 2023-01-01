export interface ChartData {
  type: string;
  data: { labels: string[]; datasets: { label: string; data: number[]; fill?: boolean }[] };
}

export interface ChartData {
  type: string;
  data: { labels: string[]; datasets: { label: string; data: number[]; fill?: boolean }[] };
  options?: {
    plugins: {
      tickFormat: {
        style: "currency";
        currency: "USD";
        minimumFractionDigits: 0;
      };
    };
  };
}

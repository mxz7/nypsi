export interface ChartData {
  type: string;
  data: { labels: string[]; datasets: { label: string; data: number[]; fill?: boolean; lineTension?: number }[] };
  options?: {
    elements?: {
      point: {
        pointStyle: "line";
      };
    };
    plugins: {
      tickFormat: {
        style: "currency";
        currency: "USD";
        minimumFractionDigits: 0;
      };
    };
  };
}

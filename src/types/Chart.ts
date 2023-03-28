export interface ChartData {
  type: string;
  data: {
    labels: string[];
    datasets: { yAxisID?: string; label: string; data: number[]; fill?: boolean; lineTension?: number }[];
  };
  options?: {
    scales?: {
      yAxes: { id: string; display: true; position: "left" | "right"; stacked: true }[];
    };
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

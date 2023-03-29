export interface ChartData {
  type: string;
  data: {
    labels: string[];
    datasets: { yAxisID?: string; label: string; data: number[]; fill?: boolean; lineTension?: number }[];
  };
  options?: {
    title?: string;
    scales?: {
      yAxes: {
        id: string;
        display: true;
        position: "left" | "right";
        stacked: true;
        ticks: { min?: number; max?: number; callback?: (val: number) => string };
      }[];
    };
    elements?: {
      point?: {
        pointStyle?: string;
        radius: number;
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

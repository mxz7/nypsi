export type Job = {
  name: string;
  cron: string;
  run:
    | ((log: (message: string) => void) => any)
    | ((log: (message: string) => void) => Promise<any>);
};

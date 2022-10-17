export default async function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(0);
    }, ms);
  });
}

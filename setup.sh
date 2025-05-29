mkdir out

cd src
cd utils
cd functions
printf "// eslint-disable-next-line @typescript-eslint/no-unused-vars\nexport function a(b: string, c: string, d:string, e?: string) {} export function b(a: string): any {} export function c(a: string) {}" > anticheat.ts

cd ..
cd ..
cd ..

cp -i .env.example .env

mkdir jobs

cd src
cd utils
cd functions
echo "export function a(b: string, c: string, d:string) {};export function b(a: string): any {};export function c(a: string) {}" > anticheat.ts

cd ..
cd ..
cd ..

cp -i .env.example .env
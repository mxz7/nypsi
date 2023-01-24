mkdir out
mkdir jobs

cd src
cd utils
cd functions
echo "export function a(b: string, c: string, d:string) {}" > anticheat.ts

cd ..
cd ..
cd ..

cd out
mkdir logs
cd ..
cp -i .env.example .env
-- CreateEnum
CREATE TYPE "CarUpgradeType" AS ENUM ('engine', 'turbo', 'wheel');

-- CreateTable
CREATE TABLE "CustomCar" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CustomCar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarUpgrade" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "CarUpgradeType" NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "carId" TEXT NOT NULL,

    CONSTRAINT "CarUpgrade_pkey" PRIMARY KEY ("carId","type")
);

-- AddForeignKey
ALTER TABLE "CustomCar" ADD CONSTRAINT "CustomCar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Economy"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarUpgrade" ADD CONSTRAINT "CarUpgrade_carId_fkey" FOREIGN KEY ("carId") REFERENCES "CustomCar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

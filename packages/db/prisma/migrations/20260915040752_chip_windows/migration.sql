/*
  Warnings:

  - You are about to drop the `ChipAllowance` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ChipAllowance" DROP CONSTRAINT "ChipAllowance_seasonId_fkey";

-- DropTable
DROP TABLE "ChipAllowance";

-- CreateTable
CREATE TABLE "ChipWindow" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "chip" TEXT NOT NULL,
    "startEvent" INTEGER NOT NULL,
    "stopEvent" INTEGER NOT NULL,

    CONSTRAINT "ChipWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChipWindow_seasonId_chip_startEvent_key" ON "ChipWindow"("seasonId", "chip", "startEvent");

-- AddForeignKey
ALTER TABLE "ChipWindow" ADD CONSTRAINT "ChipWindow_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

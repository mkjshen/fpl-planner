-- AlterTable
ALTER TABLE "LineupPlan" ADD COLUMN     "chipUsed" TEXT;

-- CreateTable
CREATE TABLE "ChipAllowance" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "chip" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "ChipAllowance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChipAllowance_seasonId_chip_key" ON "ChipAllowance"("seasonId", "chip");

-- AddForeignKey
ALTER TABLE "ChipAllowance" ADD CONSTRAINT "ChipAllowance_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

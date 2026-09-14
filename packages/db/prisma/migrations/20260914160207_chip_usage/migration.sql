-- CreateTable
CREATE TABLE "ChipUsage" (
    "id" TEXT NOT NULL,
    "fplTeamId" TEXT NOT NULL,
    "gameweekId" TEXT NOT NULL,
    "chip" TEXT NOT NULL,

    CONSTRAINT "ChipUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChipUsage_fplTeamId_gameweekId_key" ON "ChipUsage"("fplTeamId", "gameweekId");

-- AddForeignKey
ALTER TABLE "ChipUsage" ADD CONSTRAINT "ChipUsage_fplTeamId_fkey" FOREIGN KEY ("fplTeamId") REFERENCES "FplTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChipUsage" ADD CONSTRAINT "ChipUsage_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "Gameweek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

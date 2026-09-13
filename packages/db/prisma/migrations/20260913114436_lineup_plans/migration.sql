-- CreateTable
CREATE TABLE "LineupPlan" (
    "id" TEXT NOT NULL,
    "fplTeamId" TEXT NOT NULL,
    "gameweekId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineupPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineupPlanPlayer" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "playerId" INTEGER NOT NULL,
    "isStarting" BOOLEAN NOT NULL DEFAULT false,
    "squadPosition" INTEGER NOT NULL,
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,
    "isViceCaptain" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LineupPlanPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LineupPlan_fplTeamId_gameweekId_key" ON "LineupPlan"("fplTeamId", "gameweekId");

-- CreateIndex
CREATE UNIQUE INDEX "LineupPlanPlayer_planId_playerId_key" ON "LineupPlanPlayer"("planId", "playerId");

-- AddForeignKey
ALTER TABLE "LineupPlan" ADD CONSTRAINT "LineupPlan_fplTeamId_fkey" FOREIGN KEY ("fplTeamId") REFERENCES "FplTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineupPlan" ADD CONSTRAINT "LineupPlan_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "Gameweek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineupPlanPlayer" ADD CONSTRAINT "LineupPlanPlayer_planId_fkey" FOREIGN KEY ("planId") REFERENCES "LineupPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineupPlanPlayer" ADD CONSTRAINT "LineupPlanPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

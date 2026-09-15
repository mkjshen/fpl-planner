-- AlterTable
ALTER TABLE "Fixture" ADD COLUMN     "finished" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "currentGameweekPoints" INTEGER;

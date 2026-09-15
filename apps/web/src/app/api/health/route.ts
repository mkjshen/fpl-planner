import { prisma } from "@fpl-planner/db";

export async function GET() {
  // Confirms DB connectivity without leaking a business metric (total user
  // count) to whoever can reach this unauthenticated public endpoint.
  await prisma.$queryRaw`SELECT 1`;
  return Response.json({ status: "ok" });
}

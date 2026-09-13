import { prisma } from "@fpl-planner/db";

export async function GET() {
  const userCount = await prisma.user.count();
  return Response.json({ status: "ok", userCount });
}

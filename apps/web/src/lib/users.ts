import bcrypt from "bcryptjs";
import { prisma, Prisma } from "@fpl-planner/db";

export class EmailInUseError extends Error {}

// Unique constraint on User.email is the real guard against a race between
// concurrent sign-ups with the same address; this pre-check just gives the
// common case a clean error instead of a round trip to the DB constraint.
export async function createUser({
  name,
  email,
  password,
}: {
  name: string;
  email: string;
  password: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new EmailInUseError("An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    return await prisma.user.create({
      data: { name, email, password: passwordHash },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new EmailInUseError("An account with this email already exists.");
    }
    throw error;
  }
}

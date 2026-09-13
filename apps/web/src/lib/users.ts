import bcrypt from "bcryptjs";
import { prisma } from "@fpl-planner/db";

export class EmailInUseError extends Error {}

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

  return prisma.user.create({
    data: { name, email, password: passwordHash },
  });
}

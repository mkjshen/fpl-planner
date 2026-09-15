import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import bcrypt from "bcryptjs";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@fpl-planner/db";
import { signInSchema } from "@/lib/validation";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // JWT, not database — verified empirically that Auth.js never writes a
  // Session row for Credentials-authenticated sign-ins even when another
  // provider is configured, so database strategy silently locks out
  // credentials users while only OAuth users get a real session row. JWT
  // is the only strategy that works consistently for both provider types.
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        // Sign-up normalizes email casing/whitespace before storing it
        // (see signUpSchema); sign-in has to apply the same normalization
        // here or a differently-cased email won't match the stored unique
        // value and login fails even with the right password.
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.password) {
          return null;
        }

        const passwordMatches = await bcrypt.compare(password, user.password);
        if (!passwordMatches) {
          return null;
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    // Apple's OAuth flow requires a live HTTPS domain — it will not work
    // against http://localhost even once real credentials are set.
    Apple({
      clientId: process.env.AUTH_APPLE_ID,
      clientSecret: process.env.AUTH_APPLE_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});

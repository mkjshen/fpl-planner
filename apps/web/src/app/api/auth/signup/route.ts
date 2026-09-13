import { createUser, EmailInUseError } from "@/lib/users";
import { signUpSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = signUpSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const user = await createUser(parsed.data);
    return Response.json({ id: user.id, email: user.email, name: user.name }, { status: 201 });
  } catch (error) {
    if (error instanceof EmailInUseError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

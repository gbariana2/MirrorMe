import { auth } from "@clerk/nextjs/server";

import { HttpError } from "@/lib/team";

export async function getRequiredUserId(fallbackUserId?: unknown) {
  const authState = await auth();

  if (authState.userId) {
    return authState.userId;
  }

  if (typeof fallbackUserId === "string" && fallbackUserId.trim().length > 0) {
    return fallbackUserId.trim();
  }

  throw new HttpError("Authentication required.", 401);
}

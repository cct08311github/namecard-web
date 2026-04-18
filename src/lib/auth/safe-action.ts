import "server-only";

import { createSafeActionClient, DEFAULT_SERVER_ERROR_MESSAGE } from "next-safe-action";

import { readSession, type SessionUser } from "@/lib/firebase/session";

export class AuthError extends Error {
  constructor(message = "未授權，請重新登入") {
    super(message);
    this.name = "AuthError";
  }
}

export class ValidationFailure extends Error {
  constructor(message = "輸入格式不符") {
    super(message);
    this.name = "ValidationFailure";
  }
}

/** Public safe-action client — no auth required, surfaces server errors verbatim in dev. */
export const publicAction = createSafeActionClient({
  handleServerError(error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[action] server error", error);
    }
    if (error instanceof AuthError) return error.message;
    if (error instanceof ValidationFailure) return error.message;
    return DEFAULT_SERVER_ERROR_MESSAGE;
  },
});

/** Authenticated safe-action client — middleware injects current session user. */
export const authedAction = publicAction.use(async ({ next }) => {
  const user = await readSession();
  if (!user) throw new AuthError();
  return next({ ctx: { user } satisfies { user: SessionUser } });
});

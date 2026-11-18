import { createMiddleware } from "@tanstack/react-start";

export const requirePortalAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { resolveAuthenticatedUser } = await import("./auth.server.ts");
  const auth = await resolveAuthenticatedUser();
  if (!auth) {
    throw new Error("Unauthorized: Please sign in to continue.");
  }
  return next({
    context: {
      userId: auth.userId,
      role: auth.role,
      user: auth.user,
    },
  });
});

import { createMiddleware } from "hono/factory";

type Env = {
  Bindings: {
    ADMIN_TOKEN: string;
  };
};

export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "OPTIONS") {
    return next();
  }

  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = header.slice(7);
  if (token !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
});

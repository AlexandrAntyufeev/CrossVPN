import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { logger } from "../logger";

export function createHttpServer() {
  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: 1024 * 1024,
  });

  app.register(cors, { origin: true });
  app.register(sensible);

  app.get("/health", async () => ({
    status: "ok",
    now: new Date().toISOString(),
  }));

  return app;
}

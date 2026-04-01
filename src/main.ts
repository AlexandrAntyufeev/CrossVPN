import { createTelegramBot } from "./app/bot";
import { createContainer } from "./app/container";
import { registerRoutes } from "./app/routes";
import { startScheduler } from "./app/scheduler";
import { env } from "./config/env";
import { prisma } from "./infra/db/prisma";
import { createHttpServer } from "./infra/http/server";
import { logger } from "./infra/logger";

async function bootstrap() {
  const container = createContainer();
  await container.planService.ensureDefaultPlan();

  const app = createHttpServer();
  await registerRoutes(app, container);

  await app.listen({
    host: "0.0.0.0",
    port: env.PORT,
  });

  logger.info({ port: env.PORT }, "HTTP server started");

  const bot = createTelegramBot(container);
  startScheduler(container, {
    sendMessage: (chatId, text) => bot.api.sendMessage(chatId, text),
  });

  void bot.start({
    onStart: () => {
      logger.info("Telegram bot started");
    },
  });
}

bootstrap().catch(async (error) => {
  logger.error({ err: error }, "Failed to bootstrap application");
  await prisma.$disconnect();
  process.exit(1);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

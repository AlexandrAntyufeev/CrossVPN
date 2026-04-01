import cron from "node-cron";
import { NotificationType } from "@prisma/client";
import { env } from "../config/env";
import { logger } from "../infra/logger";
import { AppContainer } from "./container";

export function startScheduler(container: AppContainer, notifier: { sendMessage(chatId: string, text: string): Promise<unknown> }) {
  cron.schedule(env.CRON_SUBSCRIPTION_SYNC, async () => {
    logger.info("Running subscription sync job");
    await container.subscriptionService.syncUsage();
    await container.subscriptionService.expireDueSubscriptions();
  });

  cron.schedule(env.CRON_EXPIRY_REMINDER, async () => {
    logger.info("Running expiry reminder job");

    for (const daysBeforeExpiry of [5]) {
      const subscriptions = await container.subscriptionService.getUsersForReminder(daysBeforeExpiry);

      for (const subscription of subscriptions) {
        const now = new Date();
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        const alreadySent = await container.notificationService.wasSentBetween(
          subscription.userId,
          NotificationType.EXPIRY_5_DAYS,
          monthStart,
          nextMonthStart,
        );

        if (alreadySent) {
          continue;
        }

        await notifier.sendMessage(
          subscription.user.telegramId.toString(),
          `Напоминание: ваш ПУК истекает через 5 дней.\nДо: ${subscription.expiresAt.toISOString()}\nТариф: ${subscription.plan.name}\n\nЕсли хотите продлить заранее, просто нажмите /start.`,
        );
        await container.notificationService.log(subscription.userId, NotificationType.EXPIRY_5_DAYS, {
          subscriptionId: subscription.id,
          expiresAt: subscription.expiresAt.toISOString(),
        });
      }
    }
  });

  cron.schedule(env.CRON_ADMIN_BILLING_REMINDER, async () => {
    logger.info("Running admin billing reminder job");

    const now = new Date();
    if (now.getUTCDate() !== 20) {
      return;
    }

    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    for (const adminTelegramId of env.ADMIN_TELEGRAM_IDS) {
      const admin = await container.userService.findByTelegramId(adminTelegramId);
      if (!admin) {
        await notifier.sendMessage(
          adminTelegramId.toString(),
          "Напоминание: сегодня 20-е число. Не забудьте оплатить сервера, чтобы ПУК жил спокойно дальше.",
        );
        continue;
      }

      const alreadySent = await container.notificationService.wasSentBetween(
        admin.id,
        NotificationType.ADMIN_SERVERS_20TH,
        monthStart,
        nextMonthStart,
      );

      if (alreadySent) {
        continue;
      }

      await notifier.sendMessage(
        adminTelegramId.toString(),
        "Напоминание: сегодня 20-е число. Не забудьте оплатить сервера, чтобы ПУК жил спокойно дальше.",
      );
      await container.notificationService.log(admin.id, NotificationType.ADMIN_SERVERS_20TH, {
        month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
      });
    }
  });
}

import cron from "node-cron";
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

    for (const daysBeforeExpiry of [3, 1]) {
      const subscriptions = await container.subscriptionService.getUsersForReminder(daysBeforeExpiry);

      for (const subscription of subscriptions) {
        await notifier.sendMessage(
          subscription.user.telegramId.toString(),
          `Напоминание: подписка CrossVPN истекает через ${daysBeforeExpiry} ${daysBeforeExpiry === 1 ? "день" : "дня"}.\nДо: ${subscription.expiresAt.toISOString()}\nТариф: ${subscription.plan.name}\n\nНапишите /start, чтобы продлить.`,
        );
      }
    }
  });
}

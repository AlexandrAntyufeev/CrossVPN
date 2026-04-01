import { User, UserRole } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../infra/db/prisma";

type TelegramUserInput = {
  telegramId: bigint;
  username?: string;
  firstName?: string;
  lastName?: string;
};

export class UserService {
  async upsertTelegramUser(input: TelegramUserInput): Promise<User> {
    const isAdmin = env.ADMIN_TELEGRAM_IDS.some((id) => id === input.telegramId);

    return prisma.user.upsert({
      where: { telegramId: input.telegramId },
      update: {
        username: input.username,
        firstName: input.firstName,
        lastName: input.lastName,
        role: isAdmin ? UserRole.ADMIN : UserRole.USER,
      },
      create: {
        telegramId: input.telegramId,
        username: input.username,
        firstName: input.firstName,
        lastName: input.lastName,
        role: isAdmin ? UserRole.ADMIN : UserRole.USER,
      },
    });
  }

  async findByTelegramId(telegramId: bigint) {
    return prisma.user.findUnique({
      where: { telegramId },
    });
  }
}

import { Bot, InlineKeyboard, InputFile } from "grammy";
import { NotificationType } from "@prisma/client";
import { env } from "../config/env";
import { logger } from "../infra/logger";
import { AppContainer } from "./container";

const HIDDIFY_LOGO_URL =
  "https://raw.githubusercontent.com/hiddify/hiddify-app/main/ios/Runner/Assets.xcassets/AppIcon.appiconset/iphone/app-icon-1024.png";
const HIDDIFY_IPHONE_URL = "https://apps.apple.com/de/app/hiddify-proxy-vpn/id6596777532";
const HIDDIFY_ANDROID_URL = "https://play.google.com/store/apps/details?id=app.hiddify.com&hl=ru";
const HIDDIFY_WINDOWS_URL = "https://apps.microsoft.com/detail/9pdfnl3qv2s5?hl=en-US&gl=US";

function formatBytes(value: bigint): string {
  const gb = Number(value) / 1024 / 1024 / 1024;
  return `${gb.toFixed(2)} GB`;
}

function formatDateTime(value: Date): string {
  return value.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function requireTelegramUser(ctx: {
  from?: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
}) {
  if (!ctx.from) {
    throw new Error("Telegram user is missing from context");
  }

  return ctx.from;
}

function requireMatch(match: string | undefined): string {
  if (!match) {
    throw new Error("Callback payload is missing");
  }

  return match;
}

function getMainKeyboard() {
  return new InlineKeyboard()
    .text("Выбрать устройство", "start_device_picker")
    .row()
    .text("Оплатить", "buy_default")
    .text("Мой доступ", "my_access")
    .row()
    .text("Инструкции", "pick_device")
    .text("Помощь", "help");
}

function getHelpKeyboard() {
  return new InlineKeyboard()
    .text("Выбрать устройство", "start_device_picker")
    .row()
    .text("Создать тикет", "support_ticket")
    .url("Написать в саппорт", `https://t.me/${env.SUPPORT_TELEGRAM_USERNAME.replace(/^@/, "")}`)
    .row()
    .text("Инструкции", "pick_device");
}

function getPaymentKeyboard(orderId: string) {
  const keyboard = new InlineKeyboard().text("Реквизиты", `payment_requisites:${orderId}`);

  if (env.MANUAL_PAYMENT_QR_PAYLOAD) {
    keyboard.text("Показать QR", `payment_qr:${orderId}`);
  }

  return keyboard.row().text("Я оплатил", `manual_paid:${orderId}`);
}

function getDeviceKeyboard() {
  return new InlineKeyboard()
    .text("iPhone", "guide:iphone")
    .text("Android", "guide:android")
    .text("Windows", "guide:windows")
    .row()
    .text("Компьютер", "guide:desktop")
    .row()
    .text("Мой доступ", "my_access");
}

function buildTariffLine(amountRub: number, durationDays: number, trafficLimitGb: number): string {
  return `${amountRub} ₽ / ${durationDays} дней / ${trafficLimitGb} GB`;
}

function buildStartText(): string {
  return [
    "ПУК",
    "",
    "Добро пожаловать.",
    "Сначала подскажу, какой клиент установить и под какое устройство нужен ПУК.",
    "",
    "Выберите устройство ниже.",
  ].join("\n");
}

function buildHiddifyOnboardingCaption(): string {
  return [
    "Какой клиент ставить",
    "",
    "Ищите приложение Hiddify с таким значком.",
    "Сейчас спокойно подберем нужную ссылку под ваше устройство.",
  ].join("\n");
}

function buildPaymentText(amountRub: number): string {
  const requisites = [`Сумма: ${amountRub} ₽`, `Перевод по номеру: ${env.MANUAL_PAYMENT_PHONE || "не указан"}`];

  if (env.MANUAL_PAYMENT_BANK_NAME) {
    requisites.push(`Банк: ${env.MANUAL_PAYMENT_BANK_NAME}`);
  }

  if (env.MANUAL_PAYMENT_RECIPIENT_NAME) {
    requisites.push(`Получатель: ${env.MANUAL_PAYMENT_RECIPIENT_NAME}`);
  }

  return [
    "Оплата ПУК",
    "",
    "Сделайте обычный перевод по номеру телефона в Т-Банк.",
    "После перевода вернитесь в бот и нажмите «Я оплатил».",
    "",
    ...requisites,
  ].join("\n");
}

function getInstallKeyboard(device: "iphone" | "android" | "windows" | "desktop") {
  if (device === "iphone") {
    return new InlineKeyboard()
      .url("Открыть App Store", HIDDIFY_IPHONE_URL)
      .row()
      .text("Клиент установил", "client_installed")
      .text("Другое устройство", "start_device_picker");
  }

  if (device === "android") {
    return new InlineKeyboard()
      .url("Открыть Google Play", HIDDIFY_ANDROID_URL)
      .row()
      .text("Клиент установил", "client_installed")
      .text("Другое устройство", "start_device_picker");
  }

  return new InlineKeyboard()
    .url("Открыть Microsoft Store", HIDDIFY_WINDOWS_URL)
    .row()
    .text("Клиент установил", "client_installed")
    .text("Другое устройство", "start_device_picker");
}

function buildInstallText(device: "iphone" | "android" | "windows" | "desktop"): string {
  if (device === "iphone") {
    return [
      "iPhone / iPad",
      "",
      "Установите Hiddify из App Store по кнопке ниже.",
      "Если приложение не открывается в вашем App Store, попробуйте временно сменить регион магазина на страну, где приложение доступно, затем снова открыть ссылку.",
      "",
      "После установки вернитесь в бот и нажмите «Клиент установил».",
    ].join("\n");
  }

  if (device === "android") {
    return [
      "Android",
      "",
      "Установите Hiddify из Google Play по кнопке ниже.",
      "",
      "После установки вернитесь в бот и нажмите «Клиент установил».",
    ].join("\n");
  }

  if (device === "windows") {
    return [
      "Windows",
      "",
      "Установите Hiddify из Microsoft Store по кнопке ниже.",
      "",
      "После установки вернитесь в бот и нажмите «Клиент установил».",
    ].join("\n");
  }

  return [
    "Компьютер",
    "",
    "Для компьютера сейчас даю ссылку на Windows Store с Hiddify.",
    "Если вы на macOS или Linux, напишите в саппорт, и я отдельно подскажу установку.",
    "",
    "После установки вернитесь в бот и нажмите «Клиент установил».",
  ].join("\n");
}

function buildReadyToPayText(amountRub: number, durationDays: number, trafficLimitGb: number): string {
  return [
    "Клиент установлен, можно переходить к оплате.",
    "",
    `Тариф: ${buildTariffLine(amountRub, durationDays, trafficLimitGb)}`,
    "",
    "Дальше схема простая:",
    "1. Нажимаете «Оплатить».",
    "2. Делаете перевод на Т-Банк по номеру телефона.",
    "3. Возвращаетесь и нажимаете «Я оплатил».",
    "4. После ручного подтверждения бот пришлет ключ и инструкцию по подключению.",
    "",
    "Да, ПУК работает именно так.",
  ].join("\n");
}

function buildGuideText(device: "iphone" | "android" | "windows" | "desktop", subscriptionUrl?: string | null): string {
  const common = [
    "Важно:",
    "1. Ключ персональный, не передавайте его другим людям.",
    "2. Лимит трафика единый на все ваши устройства.",
    "3. Один и тот же subscription можно добавить и на телефон, и на ПК, но расход идет из общего пакета.",
    "",
    `Subscription link: ${subscriptionUrl ?? "пока не настроен"}`,
  ];

  if (device === "iphone") {
    return [
      "Инструкция для iPhone",
      "",
      "1. Откройте Hiddify с иконкой, как на картинке выше.",
      "2. Нажмите плюс или импорт профиля.",
      "3. Откройте subscription link или отсканируйте QR.",
      "4. Подтвердите импорт и включите подключение.",
      "",
      ...common,
    ].join("\n");
  }

  if (device === "android") {
    return [
      "Инструкция для Android",
      "",
      "1. Откройте Hiddify с иконкой, как на картинке выше.",
      "2. Нажмите плюс в приложении.",
      "3. Импортируйте subscription link или QR.",
      "4. Включите подключение.",
      "",
      ...common,
    ].join("\n");
  }

  return [
    device === "windows" ? "Инструкция для Windows" : "Инструкция для компьютера",
    "",
    "1. Откройте Hiddify.",
    "2. Откройте subscription link или импортируйте QR.",
    "3. Дождитесь загрузки профиля.",
    "4. Включите подключение.",
    "",
    ...common,
  ].join("\n");
}

function buildAccessSummary(access: NonNullable<Awaited<ReturnType<AppContainer["subscriptionService"]["getAccessPackage"]>>>) {
  return [
    "ПУК активен.",
    "",
    `Подписка до: ${formatDateTime(access.expiresAt)}`,
    `Трафик: ${formatBytes(access.trafficUsedBytes)} / ${formatBytes(access.trafficLimitBytes)}`,
    `Subscription link: ${access.subscriptionUrl ?? "не настроен"}`,
    "",
    "Ниже можно заново открыть инструкцию для iPhone, Android или ПК.",
  ].join("\n");
}

function buildQrPayload(amountRub: number): string | null {
  if (!env.MANUAL_PAYMENT_QR_PAYLOAD) {
    return null;
  }

  return env.MANUAL_PAYMENT_QR_PAYLOAD.replaceAll("{amount}", amountRub.toString());
}

async function sendAccessPackage(bot: Bot, chatId: string, access: Awaited<ReturnType<AppContainer["subscriptionService"]["getAccessPackage"]>>) {
  if (!access) {
    await bot.api.sendMessage(chatId, "Доступ пока не найден.");
    return;
  }

  await bot.api.sendMessage(chatId, buildAccessSummary(access), {
    reply_markup: getDeviceKeyboard(),
  });

  if (access.qrCodeBuffer) {
    try {
      await bot.api.sendPhoto(chatId, new InputFile(access.qrCodeBuffer, "crossvpn-access.png"), {
        caption: [
          "QR для подключения",
          "",
          ...access.instructions,
          "",
          "Ключ персональный. Общий трафик делится между всеми вашими устройствами.",
        ].join("\n"),
      });
    } catch (error) {
      logger.error({ err: error, chatId }, "Failed to send access QR");
      await bot.api.sendMessage(
        chatId,
        "Subscription link уже активен. Если QR не пришел картинкой, используйте ссылку из сообщения выше.",
      );
    }
  }
}

async function sendHiddifyPhoto(
  sender: {
    replyWithPhoto?: typeof Bot.prototype.api.sendPhoto;
    api?: Bot["api"];
    chat?: { id: number };
    reply?: (text: string, other?: Record<string, unknown>) => Promise<unknown>;
  },
  caption: string,
  replyMarkup?: InlineKeyboard,
) {
  try {
    if ("replyWithPhoto" in sender && typeof sender.replyWithPhoto === "function") {
      await sender.replyWithPhoto(HIDDIFY_LOGO_URL, {
        caption,
        reply_markup: replyMarkup,
      } as any);
      return;
    }

    if (sender.api && sender.chat) {
      await sender.api.sendPhoto(sender.chat.id.toString(), HIDDIFY_LOGO_URL, {
        caption,
        reply_markup: replyMarkup,
      });
      return;
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to send Hiddify visual");
  }

  if (sender.reply) {
    await sender.reply(caption, {
      reply_markup: replyMarkup,
    });
  }
}

export function createTelegramBot(container: AppContainer) {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.command("start", async (ctx) => {
    const tgUser = ctx.from;
    if (!tgUser) {
      return;
    }

    const user = await container.userService.upsertTelegramUser({
      telegramId: BigInt(tgUser.id),
      username: tgUser.username,
      firstName: tgUser.first_name,
      lastName: tgUser.last_name,
    });

    await sendHiddifyPhoto(ctx as any, buildHiddifyOnboardingCaption());
    await ctx.reply(buildStartText(), {
      reply_markup: getDeviceKeyboard(),
    });

    await container.notificationService.log(user.id, NotificationType.PAYMENT_LINK, { source: "start" });
  });

  bot.callbackQuery("buy_default", async (ctx) => {
    const tgUser = ctx.from;
    const user = await container.userService.upsertTelegramUser({
      telegramId: BigInt(tgUser.id),
      username: tgUser.username,
      firstName: tgUser.first_name,
      lastName: tgUser.last_name,
    });

    const plan = await container.planService.getDefaultPlan();
    const order =
      (await container.orderService.findLatestPendingByUser(user.id)) ??
      (await container.orderService.createPendingOrder(user.id, plan.id, plan.priceRub));

    await ctx.answerCallbackQuery();

    if (env.PAYMENT_PROVIDER === "manual") {
      await ctx.reply(`Заявка на оплату готова.\n\n${buildPaymentText(order.amountRub)}`, {
        reply_markup: getPaymentKeyboard(order.id),
      });
      return;
    }

    const payment = await container.paymentService.createCheckout(
      order.id,
      order.amountRub,
      `CrossVPN ${plan.name}`,
      order.idempotencyKey,
    );

    await ctx.reply(`Оплата готова.\n\nСумма: ${order.amountRub} ₽\nСсылка: ${payment.confirmationUrl ?? "не получена"}`, {
      reply_markup: payment.confirmationUrl
        ? new InlineKeyboard().url("Оплатить", payment.confirmationUrl)
        : undefined,
    });
  });

  bot.command("buy", async (ctx) => {
    await ctx.reply("Сначала проверьте, что Hiddify уже установлен, а затем откройте оплату кнопкой ниже.", {
      reply_markup: getMainKeyboard(),
    });
  });

  bot.callbackQuery("my_access", async (ctx) => {
    const tgUser = ctx.from;
    const user = await container.userService.findByTelegramId(BigInt(tgUser.id));

    await ctx.answerCallbackQuery();

    if (!user) {
      await ctx.reply("Пока нет активного доступа. Нажмите /start и оформите подписку.");
      return;
    }

    const access = await container.subscriptionService.getAccessPackage(user.id);
    if (!access) {
      await ctx.reply("Активная подписка не найдена.");
      return;
    }

    await ctx.reply(buildAccessSummary(access), {
      reply_markup: getDeviceKeyboard(),
    });

    if (access.qrCodeBuffer) {
      try {
        await ctx.replyWithPhoto(new InputFile(access.qrCodeBuffer, "crossvpn-access.png"), {
          caption: [
            "QR для подключения",
            "",
            ...access.instructions,
            "",
            "Ключ персональный. Общий лимит трафика один на все устройства.",
          ].join("\n"),
        });
      } catch (error) {
        logger.error({ err: error, userId: user.id }, "Failed to send access QR in my_access");
        await ctx.reply("Subscription link уже активен. Если QR не пришел, используйте ссылку из сообщения выше.");
      }
    }
  });

  bot.callbackQuery("help", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "Помощь ПУК\n\nЕсли что-то не работает, создайте тикет или сразу напишите в саппорт. Мы увидим ваш Telegram id и текущий статус доступа, поэтому сможем быстрее помочь.",
      {
        reply_markup: getHelpKeyboard(),
      },
    );
  });

  bot.callbackQuery("support_ticket", async (ctx) => {
    const tgUser = requireTelegramUser(ctx);
    const user = await container.userService.upsertTelegramUser({
      telegramId: BigInt(tgUser.id),
      username: tgUser.username,
      firstName: tgUser.first_name,
      lastName: tgUser.last_name,
    });

    await ctx.answerCallbackQuery({
      text: "Тикет создан",
    });

    const access = await container.subscriptionService.getAccessPackage(user.id);
    const supportLink = `https://t.me/${env.SUPPORT_TELEGRAM_USERNAME.replace(/^@/, "")}`;

    await ctx.reply(
      [
        "Тикет создан.",
        "",
        "Что делать дальше:",
        "1. Нажмите кнопку ниже и напишите в саппорт, что случилось.",
        "2. По возможности приложите скрин или текст ошибки.",
        "3. Мы уже получили ваш Telegram id и текущий статус доступа.",
      ].join("\n"),
      {
        reply_markup: new InlineKeyboard().url("Написать в саппорт", supportLink),
      },
    );

    for (const adminTelegramId of env.ADMIN_TELEGRAM_IDS) {
      await bot.api.sendMessage(
        adminTelegramId.toString(),
        [
          "Новый тикет поддержки",
          "",
          `User: ${user.telegramId}`,
          `Username: @${user.username ?? "-"}`,
          `Активный доступ: ${access ? "да" : "нет"}`,
          `Subscription: ${access?.subscriptionUrl ?? "нет"}`,
          "",
          `Ссылка на саппорт: ${supportLink}`,
        ].join("\n"),
      );
    }
  });

  bot.callbackQuery("pick_device", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Выберите устройство. Я покажу короткую инструкцию и еще раз отправлю ориентир по Hiddify.", {
      reply_markup: getDeviceKeyboard(),
    });
  });

  bot.callbackQuery("start_device_picker", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Какое у вас устройство?", {
      reply_markup: getDeviceKeyboard(),
    });
  });

  bot.callbackQuery("client_installed", async (ctx) => {
    await ctx.answerCallbackQuery();
    const plan = await container.planService.getDefaultPlan();
    await ctx.reply(buildReadyToPayText(plan.priceRub, plan.durationDays, plan.trafficLimitGb), {
      reply_markup: new InlineKeyboard().text(`Оплатить ${plan.priceRub} ₽`, "buy_default"),
    });
  });

  bot.callbackQuery(/^guide:(iphone|android|windows|desktop)$/, async (ctx) => {
    const tgUser = requireTelegramUser(ctx);
    const user = await container.userService.findByTelegramId(BigInt(tgUser.id));

    await ctx.answerCallbackQuery();

    if (!user) {
      await ctx.reply("Сначала нажмите /start.");
      return;
    }

    const access = await container.subscriptionService.getAccessPackage(user.id);
    const device = requireMatch(ctx.match?.[1]) as "iphone" | "android" | "windows" | "desktop";

    await sendHiddifyPhoto(ctx as any, buildInstallText(device), getInstallKeyboard(device));

    await ctx.reply(buildGuideText(device, access?.subscriptionUrl), {
      reply_markup: getDeviceKeyboard(),
    });

    if (access?.qrCodeBuffer) {
      try {
        await ctx.replyWithPhoto(new InputFile(access.qrCodeBuffer, "crossvpn-access.png"), {
          caption: "Тот же QR можно использовать и для другого вашего устройства.",
        });
      } catch (error) {
        logger.error({ err: error, userId: user.id }, "Failed to send device guide QR");
      }
    }
  });

  bot.callbackQuery(/^payment_qr:(.+)$/, async (ctx) => {
    const tgUser = requireTelegramUser(ctx);
    const user = await container.userService.findByTelegramId(BigInt(tgUser.id));
    const orderId = requireMatch(ctx.match?.[1]);

    await ctx.answerCallbackQuery();

    if (!user) {
      await ctx.reply("Сначала нажмите /start.");
      return;
    }

    const order = await container.orderService.findPendingById(orderId);
    if (!order || order.userId !== user.id) {
      await ctx.reply("Заказ не найден или уже обработан.");
      return;
    }

    const qrPayload = buildQrPayload(order.amountRub);
    if (!qrPayload) {
      await ctx.reply(
        "Сейчас оплата принимается обычным переводом по номеру телефона в Т-Банк. Нажмите «Реквизиты», переведите сумму и потом вернитесь к кнопке «Я оплатил».",
      );
      return;
    }

    const qrBuffer = await container.qrService.toBuffer(qrPayload);
    await ctx.replyWithPhoto(new InputFile(qrBuffer, "crossvpn-payment-qr.png"), {
      caption: [
        "QR для оплаты",
        "",
        `Сумма: ${order.amountRub} ₽`,
        `Телефон: ${env.MANUAL_PAYMENT_PHONE}`,
        `Банк: ${env.MANUAL_PAYMENT_BANK_NAME}`,
        "",
        "Если QR не открывает банковское приложение, используйте кнопку 'Реквизиты'.",
      ].join("\n"),
    });
  });

  bot.callbackQuery(/^payment_requisites:(.+)$/, async (ctx) => {
    const tgUser = requireTelegramUser(ctx);
    const user = await container.userService.findByTelegramId(BigInt(tgUser.id));
    const orderId = requireMatch(ctx.match?.[1]);

    await ctx.answerCallbackQuery();

    if (!user) {
      await ctx.reply("Сначала нажмите /start.");
      return;
    }

    const order = await container.orderService.findPendingById(orderId);
    if (!order || order.userId !== user.id) {
      await ctx.reply("Заказ не найден или уже обработан.");
      return;
    }

    await ctx.reply(buildPaymentText(order.amountRub), {
      reply_markup: getPaymentKeyboard(order.id),
    });
  });

  bot.callbackQuery(/^manual_paid:(.+)$/, async (ctx) => {
    const tgUser = requireTelegramUser(ctx);
    const orderId = requireMatch(ctx.match?.[1]);
    const user = await container.userService.findByTelegramId(BigInt(tgUser.id));

    await ctx.answerCallbackQuery({
      text: "Заявка отправлена администратору",
    });

    if (!user) {
      await ctx.reply("Сначала нажмите /start.");
      return;
    }

    const order = await container.orderService.findPendingById(orderId);
    if (!order || order.userId !== user.id) {
      await ctx.reply("Заказ не найден или уже обработан.");
      return;
    }

    await ctx.reply("Уведомили администратора. После проверки оплаты бот автоматически пришлет ваш ПУК: subscription link, QR и инструкцию.");

    for (const adminTelegramId of env.ADMIN_TELEGRAM_IDS) {
      await bot.api.sendMessage(
        adminTelegramId.toString(),
        `Новая заявка на ручную проверку оплаты\n\nOrder: ${order.id}\nUser: ${order.user.telegramId}\nUsername: @${order.user.username ?? "-"}\nСумма: ${order.amountRub} ₽\nТариф: ${order.plan.name}\nПеревод ожидается на ${env.MANUAL_PAYMENT_PHONE} (${env.MANUAL_PAYMENT_BANK_NAME})`,
        {
          reply_markup: new InlineKeyboard()
            .text("Подтвердить", `admin_confirm_cb:${order.id}`)
            .text("Отклонить", `admin_reject_cb:${order.id}`)
            .row()
            .text("Профиль", `admin_lookup_cb:${order.user.telegramId.toString()}`),
        },
      );
    }
  });

  bot.callbackQuery(/^admin_confirm_cb:(.+)$/, async (ctx) => {
    const tgUser = requireTelegramUser(ctx);
    await container.adminService.assertAdmin(BigInt(tgUser.id));

    const orderId = requireMatch(ctx.match?.[1]);
    try {
      await container.paymentService.markOrderPaidManually(orderId);
      const access = await container.subscriptionService.fulfillOrder(orderId);
      const order = await container.orderService.getById(orderId);

      await ctx.answerCallbackQuery({
        text: "Оплата подтверждена",
      });
      try {
        await bot.api.sendMessage(order.user.telegramId.toString(), "Оплата подтверждена. ПУК активирован.");
        await sendAccessPackage(bot, order.user.telegramId.toString(), access);
        await ctx.editMessageText(
          `Заказ ${orderId} подтвержден.\nПользователь получил доступ.\nSubscription: ${access?.subscriptionUrl ?? "не найден"}`,
        );
      } catch (deliveryError) {
        logger.error({ err: deliveryError, orderId }, "Access was issued but Telegram delivery failed");
        await ctx.editMessageText(
          `Заказ ${orderId} подтвержден. Доступ создан, но отправка пользователю не удалась. Попросите пользователя нажать "Мой доступ".`,
        );
      }
    } catch (error) {
      logger.error({ err: error, orderId }, "Failed to confirm manual payment");
      await ctx.answerCallbackQuery({
        text: "Ошибка при выдаче доступа",
      });
      await ctx.reply(`Не получилось выдать доступ по заказу ${orderId}. Я уже записал детали в логи backend и bridge.`);
    }
  });

  bot.callbackQuery(/^admin_reject_cb:(.+)$/, async (ctx) => {
    const tgUser = requireTelegramUser(ctx);
    await container.adminService.assertAdmin(BigInt(tgUser.id));

    const orderId = requireMatch(ctx.match?.[1]);
    const order = await container.orderService.findPendingById(orderId);

    await ctx.answerCallbackQuery({
      text: "Заявка отклонена",
    });

    if (!order) {
      await ctx.editMessageText(`Заказ ${orderId} уже не ожидает обработки.`);
      return;
    }

    await container.orderService.markCancelled(orderId);
    await ctx.editMessageText(`Заказ ${orderId} отклонен.`);
    await bot.api.sendMessage(
      order.user.telegramId.toString(),
      "Платеж не подтвердился. Если это ошибка, напишите администратору и отправьте подтверждение перевода.",
    );
  });

  bot.callbackQuery(/^admin_lookup_cb:(.+)$/, async (ctx) => {
    const tgUser = requireTelegramUser(ctx);
    await container.adminService.assertAdmin(BigInt(tgUser.id));

    const telegramId = requireMatch(ctx.match?.[1]);
    const user = await container.adminService.findUserWithAccessByTelegramId(BigInt(telegramId));

    await ctx.answerCallbackQuery();

    if (!user) {
      await ctx.reply("Пользователь не найден.");
      return;
    }

    const subscription = user.subscriptions[0];
    await ctx.reply(
      `Пользователь ${user.telegramId}\nUsername: @${user.username ?? "-"}\nПодписка: ${subscription?.status ?? "нет"}\nДо: ${subscription?.expiresAt.toISOString() ?? "-"}\nPlan: ${subscription?.plan.name ?? "-"}`,
    );
  });

  bot.command("admin_stats", async (ctx) => {
    const tgUser = requireTelegramUser(ctx);
    await container.adminService.assertAdmin(BigInt(tgUser.id));

    const stats = await container.adminService.getStats();
    await ctx.reply(
      `Статистика ПУК\n\nПользователи: ${stats.usersCount}\nАктивные подписки: ${stats.activeSubscriptions}\nОжидают оплаты: ${stats.pendingOrders}\nВыдано доступов: ${stats.fulfilledOrders}`,
    );
  });

  bot.command("admin_confirm", async (ctx) => {
    const tgUser = requireTelegramUser(ctx);
    await container.adminService.assertAdmin(BigInt(tgUser.id));

    const parts = ctx.message?.text?.trim().split(/\s+/) ?? [];
    const orderId = parts[1];

    if (!orderId) {
      await ctx.reply("Использование: /admin_confirm <orderId>");
      return;
    }

    await container.paymentService.markOrderPaidManually(orderId);
    const access = await container.subscriptionService.fulfillOrder(orderId);
    const order = await container.orderService.getById(orderId);

    await ctx.reply(`Заказ ${orderId} подтвержден вручную и доступ выдан.`);

    await ctx.api.sendMessage(
      order.user.telegramId.toString(),
      `Оплата подтверждена. Подписка активирована до ${access?.expiresAt.toISOString() ?? "неизвестно"}.`,
    );

    if (access?.subscriptionUrl) {
      await ctx.api.sendMessage(order.user.telegramId.toString(), `Subscription link:\n${access.subscriptionUrl}`);
    }
  });

  bot.command("admin_user", async (ctx) => {
    const tgUser = requireTelegramUser(ctx);
    await container.adminService.assertAdmin(BigInt(tgUser.id));

    const parts = ctx.message?.text?.trim().split(/\s+/) ?? [];
    const telegramIdRaw = parts[1];

    if (!telegramIdRaw) {
      await ctx.reply("Использование: /admin_user <telegram_id>");
      return;
    }

    const user = await container.adminService.findUserWithAccessByTelegramId(BigInt(telegramIdRaw));
    if (!user) {
      await ctx.reply("Пользователь не найден.");
      return;
    }

    const subscription = user.subscriptions[0];
    await ctx.reply(
      `Пользователь ${user.telegramId}\nUsername: @${user.username ?? "-"}\nПодписка: ${subscription?.status ?? "нет"}\nДо: ${subscription?.expiresAt.toISOString() ?? "-"}\nPlan: ${subscription?.plan.name ?? "-"}`,
    );
  });

  bot.command("admin_pending", async (ctx) => {
    const tgUser = requireTelegramUser(ctx);
    await container.adminService.assertAdmin(BigInt(tgUser.id));

    const orders = await container.adminService.getPendingOrders();
    if (orders.length === 0) {
      await ctx.reply("Нет заказов, ожидающих ручной проверки.");
      return;
    }

    for (const order of orders) {
      await ctx.reply(
        `Order: ${order.id}\nUser: ${order.user.telegramId}\nUsername: @${order.user.username ?? "-"}\nСумма: ${order.amountRub} ₽\nТариф: ${order.plan.name}`,
        {
          reply_markup: new InlineKeyboard()
            .text("Подтвердить", `admin_confirm_cb:${order.id}`)
            .text("Отклонить", `admin_reject_cb:${order.id}`),
        },
      );
    }
  });

  bot.catch((error) => {
    logger.error({ err: error.error }, "Telegram bot error");
  });

  return bot;
}

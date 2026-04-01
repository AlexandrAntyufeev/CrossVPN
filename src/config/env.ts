import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_BASE_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  ADMIN_TELEGRAM_IDS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => BigInt(item)),
    ),
  DEFAULT_PLAN_CODE: z.string().default("basic-monthly"),
  DEFAULT_PLAN_NAME: z.string().default("CrossVPN 30 days"),
  DEFAULT_PLAN_PRICE_RUB: z.coerce.number().int().positive().default(350),
  DEFAULT_PLAN_DURATION_DAYS: z.coerce.number().int().positive().default(30),
  DEFAULT_PLAN_TRAFFIC_LIMIT_GB: z.coerce.number().int().positive().default(700),
  PAYMENT_PROVIDER: z.enum(["yookassa", "manual"]).default("yookassa"),
  MANUAL_PAYMENT_INSTRUCTIONS: z
    .string()
    .default("Переведите оплату администратору и после этого нажмите кнопку 'Я оплатил'."),
  MANUAL_PAYMENT_PHONE: z.string().default(""),
  MANUAL_PAYMENT_BANK_NAME: z.string().default(""),
  MANUAL_PAYMENT_RECIPIENT_NAME: z.string().default(""),
  MANUAL_PAYMENT_QR_PAYLOAD: z.string().default(""),
  SUPPORT_TELEGRAM_USERNAME: z.string().default("Cross_Support"),
  YOOKASSA_SHOP_ID: z.string().default(""),
  YOOKASSA_SECRET_KEY: z.string().default(""),
  YOOKASSA_RETURN_URL: z.string().default(""),
  YOOKASSA_WEBHOOK_SECRET: z.string().default(""),
  THREE_X_UI_BASE_URL: z.string().default(""),
  THREE_X_UI_USERNAME: z.string().default(""),
  THREE_X_UI_PASSWORD: z.string().default(""),
  THREE_X_UI_INBOUND_ID: z.string().default(""),
  THREE_X_UI_SUBSCRIPTION_BASE_URL: z.string().default(""),
  THREE_X_UI_VERIFY_TLS: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  CRON_EXPIRY_REMINDER: z.string().default("0 * * * *"),
  CRON_SUBSCRIPTION_SYNC: z.string().default("15 * * * *"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(`Invalid environment variables: ${JSON.stringify(parsedEnv.error.flatten().fieldErrors)}`);
}

export const env = parsedEnv.data;

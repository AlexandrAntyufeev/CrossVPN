# CrossVPN

MVP-сервис продажи и автоматической выдачи VPN-доступа через Telegram-бота с интеграцией в `3x-ui`.

## Что уже есть в каркасе

- `Fastify` backend для healthcheck и payment webhooks
- `grammY` Telegram bot
- `Prisma + PostgreSQL`
- абстракция `VpnProvider` и реализация `ThreeXUiVpnProvider`
- базовый слой платежей `YooKassa`
- ручной fallback `/admin_confirm <orderId>` если платеж подтверждается вручную
- reminder job по окончанию подписки
- доменная логика заказов, подписок и выдачи доступа
- `Dockerfile` и `docker-compose.yml`

## Что заполнить в `.env`

Скопируйте `.env.example` в `.env` и заполните:

- `DATABASE_URL`
- `TELEGRAM_BOT_TOKEN`
- `ADMIN_TELEGRAM_IDS`
- `MANUAL_PAYMENT_PHONE`
- `MANUAL_PAYMENT_BANK_NAME`
- `MANUAL_PAYMENT_QR_PAYLOAD`
- `SUPPORT_TELEGRAM_USERNAME`
- `YOOKASSA_SHOP_ID`
- `YOOKASSA_SECRET_KEY`
- `YOOKASSA_RETURN_URL`
- `THREE_X_UI_BASE_URL`
- `THREE_X_UI_USERNAME`
- `THREE_X_UI_PASSWORD`
- `THREE_X_UI_INBOUND_ID`
- `THREE_X_UI_SUBSCRIPTION_BASE_URL`
- `VPN_BRIDGE_URL` и `VPN_BRIDGE_TOKEN`, если используете bridge рядом с `3x-ui`

## Локальный запуск

1. `npm install`
2. `copy .env.example .env`
3. `docker compose up -d postgres`
4. `npm run prisma:generate`
5. `npm run prisma:migrate`
6. `npm run dev`

## Запуск через Docker Compose

`docker compose up --build`

## Рекомендуемый прод-режим

Для `3x-ui` лучше использовать bridge на том же сервере, где стоит VPN-панель:

- VPN-сервер: `3x-ui + bridge`
- bot-сервер: `Telegram bot + Postgres + backend`

Тогда основной backend не логинится в `3x-ui` напрямую, а работает через `VPN_BRIDGE_URL`.

## Что делает MVP flow

1. Пользователь пишет `/start`
2. Бот показывает тариф
3. Бот создает `order`
4. Бот запрашивает оплату через `YooKassa`
5. `YooKassa` вызывает webhook
6. Backend помечает заказ оплаченным
7. Backend создает или продлевает VPN-доступ в `3x-ui`
8. Пользователь получает subscription URL и QR

## Admin-команды

- `/admin_stats`
- `/admin_user <telegram_id>`
- `/admin_confirm <orderId>`

## Что еще нужно от владельца сервиса

- ваш `telegram_id` для `ADMIN_TELEGRAM_IDS`
- URL панели `3x-ui`
- логин и пароль `3x-ui`
- `inbound_id` для рабочего Reality inbound
- базовый subscription URL, который реально отдает подписку клиенту
- данные `YooKassa`, если хотите сразу включить автоматическую оплату
- запущенный Docker daemon или локальный PostgreSQL

## Что стоит доделать следующим шагом

- миграции Prisma
- проверку подписи webhook от `YooKassa`
- reminder-сообщения за 3 дня и 1 день
- admin-команды Telegram
- verify/read-after-write логику для `3x-ui`
- ручной fallback flow подтверждения оплаты

# CrossVPN Bridge

Локальный bridge-сервис для работы с `3x-ui` на той же машине, где поднят VPN.

## Что делает

- принимает защищенные запросы от основного backend
- локально логинится в `3x-ui`
- создает, обновляет и отключает клиентов
- отдает usage

## Переменные окружения

- `BRIDGE_HOST`
- `BRIDGE_PORT`
- `BRIDGE_TOKEN`
- `THREE_X_UI_BASE_URL`
- `THREE_X_UI_USERNAME`
- `THREE_X_UI_PASSWORD`
- `THREE_X_UI_SUBSCRIPTION_BASE_URL`
- `THREE_X_UI_VERIFY_TLS`
- `BRIDGE_VERBOSE_HEADERS`

## Логи

Логи идут в `journalctl -u crossvpn-bridge -f`.


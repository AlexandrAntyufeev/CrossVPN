import json
import logging
import os
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

import requests


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("vpn-bridge")

BRIDGE_HOST = os.getenv("BRIDGE_HOST", "0.0.0.0")
BRIDGE_PORT = int(os.getenv("BRIDGE_PORT", "8790"))
BRIDGE_TOKEN = os.getenv("BRIDGE_TOKEN", "")

THREE_X_UI_BASE_URL = os.getenv("THREE_X_UI_BASE_URL", "").rstrip("/")
THREE_X_UI_USERNAME = os.getenv("THREE_X_UI_USERNAME", "")
THREE_X_UI_PASSWORD = os.getenv("THREE_X_UI_PASSWORD", "")
THREE_X_UI_SUBSCRIPTION_BASE_URL = os.getenv("THREE_X_UI_SUBSCRIPTION_BASE_URL", "").rstrip("/")
THREE_X_UI_VERIFY_TLS = os.getenv("THREE_X_UI_VERIFY_TLS", "false").lower() == "true"


def bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() == "true"


VERBOSE_HEADERS = bool_env("BRIDGE_VERBOSE_HEADERS", False)


def create_subscription_token() -> str:
    return uuid.uuid4().hex[:16]


def create_vpn_email(telegram_id: str, telegram_username: str | None) -> str:
    username = (telegram_username or "").strip().lstrip("@")
    safe = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in username)
    if safe:
      return f"{safe}_{telegram_id}"
    return f"tg_{telegram_id}"


class ThreeXUiClient:
    def __init__(self) -> None:
        parsed = urlparse(THREE_X_UI_BASE_URL)
        self.origin = f"{parsed.scheme}://{parsed.netloc}"
        self.prefix = parsed.path.rstrip("/")
        self.session = requests.Session()
        self.session.verify = THREE_X_UI_VERIFY_TLS
        self.trace_id = uuid.uuid4().hex[:8]

    def _log(self, message: str, **kwargs: object) -> None:
        payload = {"trace": self.trace_id, **kwargs}
        logger.info("%s %s", message, json.dumps(payload, ensure_ascii=False, default=str))

    def _request(self, method: str, path: str, **kwargs: object) -> requests.Response:
        url = f"{self.origin}{self.prefix}{path}"
        start = time.time()
        response = self.session.request(method, url, timeout=20, **kwargs)
        duration_ms = int((time.time() - start) * 1000)
        header_keys = list(response.headers.keys())
        payload = {
            "method": method,
            "url": url,
            "status": response.status_code,
            "durationMs": duration_ms,
            "headerKeys": header_keys,
            "hasCookieJar": bool(self.session.cookies),
            "cookieNames": list(self.session.cookies.keys()),
            "bodyPreview": response.text[:400],
        }
        if VERBOSE_HEADERS:
            payload["headers"] = dict(response.headers)
        self._log("3x-ui response", **payload)
        return response

    def login(self) -> None:
        body = urlencode({"username": THREE_X_UI_USERNAME, "password": THREE_X_UI_PASSWORD})
        self._log(
            "3x-ui login request",
            url=f"{self.origin}{self.prefix}/login",
            username=THREE_X_UI_USERNAME,
        )
        response = self._request(
            "POST",
            "/login",
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            allow_redirects=True,
        )
        response.raise_for_status()
        if not self.session.cookies:
            raise RuntimeError("3x-ui login completed without session cookie")

    def create_client(self, payload: dict, provider_client_id: str) -> dict:
        self.login()
        response = None
        attempts: list[tuple[str, dict]] = [
            ("json", {"json": payload, "headers": {"Content-Type": "application/json"}}),
            (
                "form",
                {
                    "data": urlencode({"id": str(payload["id"]), "settings": str(payload["settings"])}),
                    "headers": {"Content-Type": "application/x-www-form-urlencoded"},
                },
            ),
        ]
        for mode, kwargs in attempts:
            self._log("3x-ui addClient request", mode=mode, payload=payload)
            response = self._request("POST", "/panel/api/inbounds/addClient", **kwargs)
            if response.status_code < 400:
                try:
                    body = response.json()
                except Exception:
                    body = {"raw": response.text}
                if body.get("success") is False:
                    self._log("3x-ui addClient returned success=false", mode=mode, body=body)
                else:
                    self._verify_client_exists(str(payload["id"]), provider_client_id)
                    return body
            self._log("3x-ui addClient attempt failed", mode=mode, status=response.status_code)

        if response is None:
            raise RuntimeError("3x-ui addClient failed before any response")
        response.raise_for_status()
        raise RuntimeError(f"3x-ui addClient failed with status={response.status_code} body={response.text[:400]}")

    def update_client(self, provider_client_id: str, payload: dict) -> dict:
        self.login()
        response = None
        attempts: list[tuple[str, dict]] = [
            (
                "json",
                {
                    "json": payload,
                    "headers": {"Content-Type": "application/json"},
                },
            ),
            (
                "form",
                {
                    "data": urlencode({"id": str(payload["id"]), "settings": str(payload["settings"])}),
                    "headers": {"Content-Type": "application/x-www-form-urlencoded"},
                },
            ),
        ]
        for mode, kwargs in attempts:
            self._log("3x-ui updateClient request", mode=mode, providerClientId=provider_client_id, payload=payload)
            response = self._request("POST", f"/panel/api/inbounds/updateClient/{provider_client_id}", **kwargs)
            if response.status_code < 400:
                try:
                    return response.json()
                except Exception:
                    return {"raw": response.text}
        if response is None:
            raise RuntimeError("3x-ui updateClient failed before any response")
        response.raise_for_status()
        raise RuntimeError(f"3x-ui updateClient failed with status={response.status_code} body={response.text[:400]}")

    def get_inbound(self, inbound_id: str) -> dict:
        self.login()
        response = self._request("GET", f"/panel/api/inbounds/get/{inbound_id}")
        response.raise_for_status()
        return response.json()

    def get_usage(self, provider_client_id: str, client_email: str) -> int:
        self.login()
        by_id = self._request("GET", f"/panel/api/inbounds/getClientTrafficsById/{provider_client_id}")
        if by_id.status_code < 400:
            data = by_id.json().get("obj")
            if isinstance(data, list):
                data = data[0] if data else None
            if data:
                return int(data.get("up", 0)) + int(data.get("down", 0))

        by_email = self._request("GET", f"/panel/api/inbounds/getClientTraffics/{client_email}")
        by_email.raise_for_status()
        obj = by_email.json().get("obj") or {}
        return int(obj.get("up", 0)) + int(obj.get("down", 0))

    def _verify_client_exists(self, inbound_id: str, provider_client_id: str) -> None:
        inbound = self.get_inbound(inbound_id).get("obj") or {}
        settings = inbound.get("settings") or "{}"
        clients = json.loads(settings).get("clients", [])
        exists = any(client.get("id") == provider_client_id for client in clients)
        self._log("3x-ui addClient verify", inboundId=inbound_id, providerClientId=provider_client_id, exists=exists)
        if not exists:
            raise RuntimeError(f"client {provider_client_id} was not found after addClient")


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/health":
            return json_response(self, 200, {"status": "ok", "service": "crossvpn-bridge"})

        if not self._authorized():
            return json_response(self, 401, {"success": False, "error": "unauthorized"})

        if self.path.startswith("/clients/usage"):
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            provider_client_id = params.get("providerClientId", [""])[0]
            client_email = params.get("clientEmail", [""])[0]
            try:
                bridge = ThreeXUiClient()
                used_bytes = bridge.get_usage(provider_client_id, client_email)
                return json_response(self, 200, {"success": True, "result": {"usedBytes": used_bytes}})
            except Exception as error:
                logger.exception("usage failed")
                return json_response(self, 500, {"success": False, "error": str(error)})

        return json_response(self, 404, {"success": False, "error": "not_found"})

    def do_POST(self) -> None:
        if not self._authorized():
            return json_response(self, 401, {"success": False, "error": "unauthorized"})

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8")
        payload = json.loads(raw or "{}")

        try:
            if self.path == "/clients/create":
                return self._create_client(payload)
            if self.path == "/clients/update":
                return self._update_client(payload)
            if self.path == "/clients/disable":
                return self._toggle_client(payload, False)
            if self.path == "/clients/enable":
                return self._toggle_client(payload, True)
        except Exception as error:
            logger.exception("bridge operation failed path=%s payload=%s", self.path, payload)
            return json_response(self, 500, {"success": False, "error": str(error)})

        return json_response(self, 404, {"success": False, "error": "not_found"})

    def _create_client(self, payload: dict) -> None:
        bridge = ThreeXUiClient()
        provider_client_id = str(uuid.uuid4())
        telegram_id = str(payload["telegramId"])
        telegram_username = payload.get("telegramUsername")
        inbound_id = str(payload["inboundId"])
        traffic_limit_gb = int(payload["trafficLimitGb"])
        expires_at_iso = str(payload["expiresAt"])
        expires_at_ms = int(time.mktime(time.strptime(expires_at_iso[:19], "%Y-%m-%dT%H:%M:%S"))) * 1000
        client_email = create_vpn_email(telegram_id, telegram_username)
        sub_id = create_subscription_token()
        client_comment = f"@{telegram_username}" if telegram_username else f"tg:{telegram_id}"

        api_payload = {
            "id": int(inbound_id),
            "settings": json.dumps({
                "clients": [
                    {
                        "id": provider_client_id,
                        "flow": "",
                        "email": client_email,
                        "limitIp": 0,
                        "totalGB": int(traffic_limit_gb) * 1024 * 1024 * 1024,
                        "expiryTime": expires_at_ms,
                        "enable": True,
                        "tgId": telegram_id,
                        "subId": sub_id,
                        "comment": client_comment,
                        "reset": 0,
                    }
                ]
            }),
        }

        logger.info("bridge create payload=%s", json.dumps(api_payload, ensure_ascii=False))
        result = bridge.create_client(api_payload, provider_client_id)
        return json_response(self, 200, {
            "success": True,
            "result": {
                "provider": "3x-ui-bridge",
                "inboundId": inbound_id,
                "providerClientId": provider_client_id,
                "clientEmail": client_email,
                "clientUuid": provider_client_id,
                "subId": sub_id,
                "subscriptionUrl": f"{THREE_X_UI_SUBSCRIPTION_BASE_URL}/{sub_id}" if THREE_X_UI_SUBSCRIPTION_BASE_URL else None,
                "raw": result,
            },
        })

    def _update_client(self, payload: dict) -> None:
        bridge = ThreeXUiClient()
        provider_client_id = str(payload["providerClientId"])
        inbound_id = str(payload["inboundId"])
        traffic_limit_gb = int(payload["trafficLimitGb"])
        expires_at_iso = str(payload["expiresAt"])
        expires_at_ms = int(time.mktime(time.strptime(expires_at_iso[:19], "%Y-%m-%dT%H:%M:%S"))) * 1000

        inbound = bridge.get_inbound(inbound_id).get("obj") or {}
        settings = inbound.get("settings") or "{}"
        clients = json.loads(settings).get("clients", [])
        current = next((client for client in clients if client.get("id") == provider_client_id), None)
        if not current:
            raise RuntimeError(f"client {provider_client_id} not found")

        merged = dict(current)
        merged["expiryTime"] = expires_at_ms
        merged["totalGB"] = int(traffic_limit_gb) * 1024 * 1024 * 1024
        merged["enable"] = True

        result = bridge.update_client(provider_client_id, {
            "id": int(inbound_id),
            "settings": json.dumps({"clients": [merged]}),
        })

        return json_response(self, 200, {
            "success": True,
            "result": {
                "provider": "3x-ui-bridge",
                "inboundId": inbound_id,
                "providerClientId": provider_client_id,
                "clientEmail": current.get("email", ""),
                "clientUuid": provider_client_id,
                "raw": result,
            },
        })

    def _toggle_client(self, payload: dict, enabled: bool) -> None:
        bridge = ThreeXUiClient()
        provider_client_id = str(payload["providerClientId"])
        inbound_id = str(payload["inboundId"])
        inbound = bridge.get_inbound(inbound_id).get("obj") or {}
        settings = inbound.get("settings") or "{}"
        clients = json.loads(settings).get("clients", [])
        current = next((client for client in clients if client.get("id") == provider_client_id), None)
        if not current:
            raise RuntimeError(f"client {provider_client_id} not found")
        merged = dict(current)
        merged["enable"] = enabled
        bridge.update_client(provider_client_id, {
            "id": int(inbound_id),
            "settings": json.dumps({"clients": [merged]}),
        })
        return json_response(self, 200, {"success": True})

    def _authorized(self) -> bool:
        token = self.headers.get("X-Bridge-Token", "")
        authorized = bool(BRIDGE_TOKEN) and token == BRIDGE_TOKEN
        if not authorized:
            logger.warning("bridge unauthorized remote=%s path=%s", self.client_address[0], self.path)
        return authorized

    def log_message(self, format: str, *args) -> None:
        logger.info("http %s", format % args)


if __name__ == "__main__":
    server = ThreadingHTTPServer((BRIDGE_HOST, BRIDGE_PORT), Handler)
    logger.info("vpn bridge listening on %s:%s", BRIDGE_HOST, BRIDGE_PORT)
    server.serve_forever()

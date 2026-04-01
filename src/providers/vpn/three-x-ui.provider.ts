import axios, { AxiosInstance } from "axios";
import crypto from "node:crypto";
import https from "node:https";
import { env } from "../../config/env";
import { logger } from "../../infra/logger";
import { AppError } from "../../shared/errors/app-error";
import { gigabytesToBytes } from "../../shared/utils/bytes";
import { createSubscriptionToken, createVpnEmail } from "../../shared/utils/ids";
import { CreateVpnClientInput, CreateVpnClientResult, UsageStats, VpnProvider } from "./vpn-provider";

type ThreeXUiClient = {
  id: string;
  email?: string;
  flow?: string;
  limitIp?: number;
  totalGB?: number;
  expiryTime?: number;
  enable?: boolean;
  tgId?: string;
  subId?: string;
  comment?: string;
  reset?: number;
};

type ThreeXUiInbound = {
  id: number;
  settings?: string | { clients?: ThreeXUiClient[] };
  clientStats?: Array<{
    email?: string;
    up?: number;
    down?: number;
    total?: number;
    expiryTime?: number;
    enable?: boolean;
  }>;
};

export class ThreeXUiVpnProvider implements VpnProvider {
  private readonly http: AxiosInstance;
  private readonly panelBasePath: string;
  private isLoggedIn = false;
  private sessionCookie: string | null = null;

  constructor() {
    const parsedUrl = new URL(env.THREE_X_UI_BASE_URL);
    this.panelBasePath = parsedUrl.pathname.replace(/\/$/, "");

    this.http = axios.create({
      baseURL: `${parsedUrl.protocol}//${parsedUrl.host}`,
      withCredentials: true,
      validateStatus: () => true,
      httpsAgent: new https.Agent({
        rejectUnauthorized: env.THREE_X_UI_VERIFY_TLS,
      }),
    });
  }

  async createClient(input: CreateVpnClientInput): Promise<CreateVpnClientResult> {
    await this.ensureLoggedIn(true);

    const providerClientId = crypto.randomUUID();
    const clientEmail = createVpnEmail(input.telegramId, input.telegramUsername);
    const subId = createSubscriptionToken();
    const clientComment = input.telegramUsername ? `@${input.telegramUsername}` : `tg:${input.telegramId.toString()}`;
    const payloadObject = {
      id: Number(input.inboundId),
      settings: JSON.stringify({
        clients: [
          {
            id: providerClientId,
            flow: "",
            email: clientEmail,
            limitIp: 0,
            totalGB: Number(gigabytesToBytes(input.trafficLimitGb)),
            expiryTime: input.expiresAt.getTime(),
            enable: true,
            tgId: input.telegramId.toString(),
            subId,
            comment: clientComment,
            reset: 0,
          },
        ],
      }),
    };

    const response = await this.request("post", "/panel/api/inbounds/addClient", payloadObject, {
      "Content-Type": "application/json",
    });

    logger.info(
      {
        inboundId: input.inboundId,
        providerClientId,
        clientEmail,
        status: response.status,
        data: response.data,
      },
      "3x-ui addClient response",
    );

    if (response.status >= 400 || response.data?.success === false) {
      throw new AppError(
        `3x-ui addClient failed with status ${response.status}: ${this.stringifyResponse(response.data)}`,
        502,
      );
    }

    const createdClient = await this.findClientById(input.inboundId, providerClientId);
    if (!createdClient) {
      throw new AppError("3x-ui addClient returned success but client was not found on read-back", 502);
    }

    return {
      provider: "3x-ui",
      inboundId: input.inboundId,
      providerClientId,
      clientEmail,
      clientUuid: providerClientId,
      subId,
      subscriptionUrl: this.buildSubscriptionUrl(subId),
      raw: {
        addClientResponse: response.data,
        createdClient,
      },
    };
  }

  async disableClient(providerClientId: string, inboundId: string): Promise<void> {
    await this.updateClient(providerClientId, inboundId, { enable: false });
  }

  async enableClient(providerClientId: string, inboundId: string): Promise<void> {
    await this.updateClient(providerClientId, inboundId, { enable: true });
  }

  async updateClientExpiryAndTraffic(
    providerClientId: string,
    inboundId: string,
    expiresAt: Date,
    trafficLimitGb: number,
  ): Promise<CreateVpnClientResult> {
    await this.updateClient(providerClientId, inboundId, {
      id: providerClientId,
      expiryTime: expiresAt.getTime(),
      totalGB: Number(gigabytesToBytes(trafficLimitGb)),
      enable: true,
    });

    return {
      provider: "3x-ui",
      inboundId,
      providerClientId,
      clientEmail: "",
      clientUuid: providerClientId,
      raw: null,
    };
  }

  async getUsage(_providerClientId: string, clientEmail: string): Promise<UsageStats> {
    await this.ensureLoggedIn();

    const byIdResponse = await this.request(
      "get",
      `/panel/api/inbounds/getClientTrafficsById/${encodeURIComponent(_providerClientId)}`,
    );

    const usageSource =
      byIdResponse.status < 400
        ? Array.isArray(byIdResponse.data?.obj)
          ? byIdResponse.data.obj[0]
          : byIdResponse.data?.obj
        : null;

    if (!usageSource) {
      const byEmailResponse = await this.request(
        "get",
        `/panel/api/inbounds/getClientTraffics/${encodeURIComponent(clientEmail)}`,
      );

      if (byEmailResponse.status >= 400) {
        return { usedBytes: 0n };
      }

      const usedBytes =
        BigInt(byEmailResponse.data?.obj?.up ?? 0) +
        BigInt(byEmailResponse.data?.obj?.down ?? 0);

      return { usedBytes };
    }

    const usedBytes =
      BigInt(usageSource.up ?? 0) +
      BigInt(usageSource.down ?? 0);

    return { usedBytes };
  }

  private async updateClient(providerClientId: string, inboundId: string, overrides: Record<string, unknown>) {
    await this.ensureLoggedIn(true);

    const currentClient = await this.findClientById(inboundId, providerClientId);
    if (!currentClient) {
      throw new AppError(`3x-ui client ${providerClientId} not found in inbound ${inboundId}`, 404);
    }

    const mergedClient: ThreeXUiClient = {
      ...currentClient,
      ...overrides,
      id: providerClientId,
    };

    const payloadObject = {
      id: Number(inboundId),
      settings: JSON.stringify({
        clients: [mergedClient],
      }),
    };

    const response = await this.request(
      "post",
      `/panel/api/inbounds/updateClient/${providerClientId}`,
      payloadObject,
      { "Content-Type": "application/json" },
    );

    logger.info(
      {
        inboundId,
        providerClientId,
        status: response.status,
        data: response.data,
      },
      "3x-ui updateClient response",
    );

    if (response.status >= 400 || response.data?.success === false) {
      throw new AppError(
        `3x-ui updateClient failed with status ${response.status}: ${this.stringifyResponse(response.data)}`,
        502,
      );
    }
  }

  private buildSubscriptionUrl(subId: string): string | undefined {
    if (!env.THREE_X_UI_SUBSCRIPTION_BASE_URL) {
      return undefined;
    }

    return `${env.THREE_X_UI_SUBSCRIPTION_BASE_URL.replace(/\/$/, "")}/${subId}`;
  }

  private async ensureLoggedIn(force = false) {
    if (this.isLoggedIn && !force) {
      return;
    }

    if (!env.THREE_X_UI_BASE_URL || !env.THREE_X_UI_USERNAME || !env.THREE_X_UI_PASSWORD) {
      throw new AppError("3x-ui credentials are not configured", 500);
    }

    const response = await this.http.post(
      this.buildPanelUrl("/login"),
      new URLSearchParams({
        username: env.THREE_X_UI_USERNAME,
        password: env.THREE_X_UI_PASSWORD,
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
    );

    if (response.status >= 400) {
      throw new AppError(`3x-ui login failed with status ${response.status}`, 502);
    }

    const rawSetCookie = response.headers["set-cookie"] as unknown;
    const setCookieArray = Array.isArray(rawSetCookie) ? (rawSetCookie as string[]) : null;
    const setCookieString = typeof rawSetCookie === "string" ? rawSetCookie : null;

    if (setCookieArray && setCookieArray.length > 0) {
      this.sessionCookie = setCookieArray.map((value) => value.split(";")[0]).join("; ");
    } else if (setCookieString && setCookieString.length > 0) {
      this.sessionCookie = setCookieString
        .split(",")
        .map((value) => (value.split(";")[0] ?? "").trim())
        .join("; ");
    } else {
      this.sessionCookie = null;
    }

    this.isLoggedIn = true;
    logger.info(
      {
        panelBasePath: this.panelBasePath,
        hasCookie: Boolean(this.sessionCookie),
        headerKeys: Object.keys(response.headers),
        setCookieType: setCookieArray ? "array" : typeof setCookieString,
      },
      "3x-ui login established",
    );
  }

  private buildPanelUrl(path: string): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.panelBasePath}${normalizedPath}`;
  }

  private async request(
    method: "get" | "post",
    path: string,
    data?: unknown,
    extraHeaders?: Record<string, string>,
  ) {
    const headers: Record<string, string> = {
      ...(extraHeaders ?? {}),
    };

    if (this.sessionCookie) {
      headers.Cookie = this.sessionCookie;
    }

    return this.http.request({
      method,
      url: this.buildPanelUrl(path),
      data,
      headers,
    });
  }

  private async getInbound(inboundId: string): Promise<ThreeXUiInbound> {
    const response = await this.request("get", `/panel/api/inbounds/get/${inboundId}`);

    if (response.status >= 400) {
      throw new AppError(
        `3x-ui get inbound failed with status ${response.status}: ${this.stringifyResponse(response.data)}`,
        502,
      );
    }

    const inbound = response.data?.obj as ThreeXUiInbound | undefined;
    if (!inbound) {
      throw new AppError(`3x-ui inbound ${inboundId} was not returned by API`, 502);
    }

    return inbound;
  }

  private async findClientById(inboundId: string, clientId: string): Promise<ThreeXUiClient | null> {
    const inbound = await this.getInbound(inboundId);
    const clients = this.extractClients(inbound);
    return clients.find((client) => client.id === clientId) ?? null;
  }

  private extractClients(inbound: ThreeXUiInbound): ThreeXUiClient[] {
    if (!inbound.settings) {
      return [];
    }

    if (typeof inbound.settings === "string") {
      try {
        const parsed = JSON.parse(inbound.settings) as { clients?: ThreeXUiClient[] };
        return parsed.clients ?? [];
      } catch {
        return [];
      }
    }

    return inbound.settings.clients ?? [];
  }

  private stringifyResponse(data: unknown): string {
    if (typeof data === "string") {
      return data;
    }

    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }
}

import axios, { AxiosInstance } from "axios";
import { env } from "../../config/env";
import { AppError } from "../../shared/errors/app-error";
import { CreateVpnClientInput, CreateVpnClientResult, UsageStats, VpnProvider } from "./vpn-provider";

export class BridgeVpnProvider implements VpnProvider {
  private readonly http: AxiosInstance;

  constructor() {
    if (!env.VPN_BRIDGE_URL || !env.VPN_BRIDGE_TOKEN) {
      throw new AppError("VPN bridge is not configured", 500);
    }

    this.http = axios.create({
      baseURL: env.VPN_BRIDGE_URL.replace(/\/$/, ""),
      validateStatus: () => true,
      headers: {
        "X-Bridge-Token": env.VPN_BRIDGE_TOKEN,
      },
    });
  }

  async createClient(input: CreateVpnClientInput): Promise<CreateVpnClientResult> {
    const response = await this.http.post("/clients/create", {
      telegramId: input.telegramId.toString(),
      telegramUsername: input.telegramUsername ?? null,
      inboundId: input.inboundId,
      trafficLimitGb: input.trafficLimitGb,
      expiresAt: input.expiresAt.toISOString(),
    });

    if (response.status >= 400 || response.data?.success === false) {
      throw new AppError(`VPN bridge create failed: ${JSON.stringify(response.data)}`, 502);
    }

    return response.data.result as CreateVpnClientResult;
  }

  async disableClient(providerClientId: string, inboundId: string): Promise<void> {
    const response = await this.http.post("/clients/disable", {
      providerClientId,
      inboundId,
    });

    if (response.status >= 400 || response.data?.success === false) {
      throw new AppError(`VPN bridge disable failed: ${JSON.stringify(response.data)}`, 502);
    }
  }

  async enableClient(providerClientId: string, inboundId: string): Promise<void> {
    const response = await this.http.post("/clients/enable", {
      providerClientId,
      inboundId,
    });

    if (response.status >= 400 || response.data?.success === false) {
      throw new AppError(`VPN bridge enable failed: ${JSON.stringify(response.data)}`, 502);
    }
  }

  async updateClientExpiryAndTraffic(
    providerClientId: string,
    inboundId: string,
    expiresAt: Date,
    trafficLimitGb: number,
  ): Promise<CreateVpnClientResult> {
    const response = await this.http.post("/clients/update", {
      providerClientId,
      inboundId,
      expiresAt: expiresAt.toISOString(),
      trafficLimitGb,
    });

    if (response.status >= 400 || response.data?.success === false) {
      throw new AppError(`VPN bridge update failed: ${JSON.stringify(response.data)}`, 502);
    }

    return response.data.result as CreateVpnClientResult;
  }

  async getUsage(providerClientId: string, clientEmail: string): Promise<UsageStats> {
    const response = await this.http.get("/clients/usage", {
      params: {
        providerClientId,
        clientEmail,
      },
    });

    if (response.status >= 400 || response.data?.success === false) {
      throw new AppError(`VPN bridge usage failed: ${JSON.stringify(response.data)}`, 502);
    }

    return {
      usedBytes: BigInt(response.data.result.usedBytes ?? 0),
    };
  }
}

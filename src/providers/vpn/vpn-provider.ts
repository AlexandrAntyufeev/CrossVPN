export type CreateVpnClientInput = {
  userId: string;
  telegramId: bigint;
  telegramUsername?: string | null;
  inboundId: string;
  trafficLimitGb: number;
  expiresAt: Date;
};

export type CreateVpnClientResult = {
  provider: string;
  inboundId: string;
  providerClientId: string;
  clientEmail: string;
  clientUuid: string;
  subId?: string;
  subscriptionUrl?: string;
  raw: unknown;
};

export type UsageStats = {
  usedBytes: bigint;
  isOnline?: boolean;
  lastOnlineAt?: Date;
};

export interface VpnProvider {
  createClient(input: CreateVpnClientInput): Promise<CreateVpnClientResult>;
  disableClient(providerClientId: string, inboundId: string): Promise<void>;
  enableClient(providerClientId: string, inboundId: string): Promise<void>;
  updateClientExpiryAndTraffic(
    providerClientId: string,
    inboundId: string,
    expiresAt: Date,
    trafficLimitGb: number,
  ): Promise<CreateVpnClientResult>;
  getUsage(providerClientId: string, clientEmail: string): Promise<UsageStats>;
}

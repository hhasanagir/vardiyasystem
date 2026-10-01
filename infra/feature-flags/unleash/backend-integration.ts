import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UnleashClient } from "unleash-client";

@Injectable()
export class FeatureFlagsService implements OnModuleInit {
  private client: UnleashClient;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    this.client = new UnleashClient({
      url: this.config.get("FEATURE_FLAGS_CLIENT_URL"),
      appName: "vardiya-backend",
      environment: this.config.get("FEATURE_FLAGS_ENVIRONMENT"),
      instanceId: process.env.HOSTNAME || "unknown",
      refreshInterval: 30_000,
      metricsInterval: 60_000,
      customHeaders: {
        Authorization: this.config.get("FEATURE_FLAGS_CLIENT_TOKEN"),
      },
    });

    await this.client.start();
  }

  isEnabled(feature: string, context?: Record<string, string>): boolean {
    return this.client.isEnabled(feature, context);
  }

  getVariant(feature: string, context?: Record<string, string>) {
    return this.client.getVariant(feature, context);
  }
}

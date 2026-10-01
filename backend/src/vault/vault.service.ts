import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SecretProvider {
  getSecret(key: string): Promise<string | undefined>;
}

@Injectable()
export class VaultService implements SecretProvider {
  private readonly logger = new Logger(VaultService.name);
  private vaultToken: string | null = null;
  private vaultAddr: string;
  private vaultRoleId: string | null = null;
  private vaultSecretId: string | null = null;
  private vaultPath: string;

  constructor(private config: ConfigService) {
    this.vaultAddr = this.config.get('VAULT_ADDR', '');
    this.vaultRoleId = this.config.get('VAULT_ROLE_ID', null);
    this.vaultSecretId = this.config.get('VAULT_SECRET_ID', null);
    this.vaultPath = this.config.get('VAULT_SECRET_PATH', 'secret/vardiya');
  }

  async onModuleInit() {
    if (!this.vaultAddr) {
      this.logger.log('Vault not configured, using env vars');
      return;
    }
    if (this.vaultRoleId && this.vaultSecretId) {
      await this.authenticateAppRole();
    }
  }

  private async authenticateAppRole() {
    try {
      const res = await fetch(`${this.vaultAddr}/v1/auth/approle/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_id: this.vaultRoleId,
          secret_id: this.vaultSecretId,
        }),
      });
      const data = (await res.json()) as any;
      this.vaultToken = data.auth?.client_token || null;
      if (this.vaultToken) {
        this.logger.log('Vault AppRole authentication successful');
      }
    } catch (err) {
      this.logger.warn('Vault AppRole auth failed, falling back to env vars');
    }
  }

  async getSecret(key: string): Promise<string | undefined> {
    if (this.vaultToken) {
      const value = await this.readFromVault(key);
      if (value !== undefined) return value;
    }
    return this.config.get<string>(key);
  }

  private async readFromVault(key: string): Promise<string | undefined> {
    try {
      const res = await fetch(`${this.vaultAddr}/v1/${this.vaultPath}`, {
        headers: { 'X-Vault-Token': this.vaultToken! },
      });
      const data = (await res.json()) as any;
      return data?.data?.data?.[key] ?? undefined;
    } catch {
      return undefined;
    }
  }
}

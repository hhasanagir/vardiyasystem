import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_ROTATION_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000;

interface EncryptionKey {
  id: string;
  key: Buffer;
  createdAt: Date;
}

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private currentKey: EncryptionKey;
  private keyHistory: EncryptionKey[] = [];
  private readonly masterKey: Buffer;
  private readonly keyDerivationSalt: Buffer;

  constructor(private configService: ConfigService) {
    const masterKeyHex = this.configService.get<string>(
      'ENCRYPTION_MASTER_KEY',
    );
    if (!masterKeyHex || masterKeyHex.length < 64) {
      throw new Error(
        'ENCRYPTION_MASTER_KEY must be at least 64 hex characters (256 bits)',
      );
    }
    this.masterKey = Buffer.from(masterKeyHex, 'hex');
    this.keyDerivationSalt = crypto.randomBytes(32);
    this.currentKey = this.deriveKey(1);
  }

  private deriveKey(version: number): EncryptionKey {
    const hkdf = Buffer.from(
      crypto.hkdfSync(
        'sha256',
        this.masterKey,
        this.keyDerivationSalt,
        `vardiya-enc-key-v${version}`,
        32,
      ),
    );
    return {
      id: `v${version}-${Date.now().toString(36)}`,
      key: hkdf,
      createdAt: new Date(),
    };
  }

  encrypt(plaintext: string, context?: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const aad = context ? Buffer.from(context, 'utf-8') : undefined;
    const cipher = crypto.createCipheriv(ALGORITHM, this.currentKey.key, iv, {
      authTagLength: TAG_LENGTH,
    });

    if (aad) cipher.setAAD(aad);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    const payload = Buffer.concat([iv, tag, encrypted]);
    return `${this.currentKey.id}:${payload.toString('base64')}`;
  }

  decrypt(encryptedString: string, context?: string): string {
    const colonIdx = encryptedString.indexOf(':');
    if (colonIdx === -1) throw new Error('Invalid encrypted string format');

    const keyId = encryptedString.substring(0, colonIdx);
    const payload = Buffer.from(
      encryptedString.substring(colonIdx + 1),
      'base64',
    );

    if (payload.length < IV_LENGTH + TAG_LENGTH)
      throw new Error('Invalid payload length');

    const iv = payload.subarray(0, IV_LENGTH);
    const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = payload.subarray(IV_LENGTH + TAG_LENGTH);

    let key = this.currentKey;
    if (keyId !== this.currentKey.id) {
      key = this.keyHistory.find((k) => k.id === keyId)!;
      if (!key) throw new Error(`Encryption key ${keyId} not found in history`);
    }

    const aad = context ? Buffer.from(context, 'utf-8') : undefined;
    const decipher = crypto.createDecipheriv(ALGORITHM, key.key, iv, {
      authTagLength: TAG_LENGTH,
    });
    if (aad) decipher.setAAD(aad);
    decipher.setAuthTag(tag);

    return decipher.update(encrypted) + decipher.final('utf-8');
  }

  hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  mask(value: string, visibleChars: number = 3): string {
    if (value.length <= visibleChars) return value;
    return (
      value.substring(0, visibleChars) + '*'.repeat(value.length - visibleChars)
    );
  }

  pseudonymize(value: string, namespace: string = 'default'): string {
    const hmac = crypto.createHmac('sha256', this.masterKey);
    hmac.update(`${namespace}:${value}`);
    return `pseudo-${hmac.digest('hex').substring(0, 16)}`;
  }

  generateSecureToken(length: number = 64): string {
    return crypto.randomBytes(length).toString('hex');
  }
}

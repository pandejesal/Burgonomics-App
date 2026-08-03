import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PetpoojaConfig } from '@config/petpooja.config';
import type { CredentialBlock } from '../dto/petpooja.dto';

/**
 * PETPOOJA credential provider.
 *
 * Central point that reads credentials from configuration, validates
 * their presence at boot, and exposes them to the HTTP client. Making
 * this a provider keeps credentials out of every call site and gives
 * us a single seam for a future secret-rotation workflow.
 */
@Injectable()
export class PetpoojaCredentialsService implements OnModuleInit {
  private readonly logger = new Logger(PetpoojaCredentialsService.name);
  private cached: CredentialBlock | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const cfg = this.config.getOrThrow<PetpoojaConfig>('petpooja');
    if (!cfg.appKey || !cfg.appSecret || !cfg.accessToken) {
      this.logger.warn(
        'PETPOOJA credentials are not fully configured — outbound calls will be rejected until PETPOOJA_APP_KEY / PETPOOJA_APP_SECRET / PETPOOJA_ACCESS_TOKEN are set.',
      );
    }
  }

  isConfigured(): boolean {
    const cfg = this.config.getOrThrow<PetpoojaConfig>('petpooja');
    return Boolean(cfg.appKey && cfg.appSecret && cfg.accessToken);
  }

  webhookSecret(): string | undefined {
    return this.config.getOrThrow<PetpoojaConfig>('petpooja').webhookSecret;
  }

  baseUrl(): string {
    return this.config.getOrThrow<PetpoojaConfig>('petpooja').baseUrl;
  }

  timeoutMs(): number {
    return this.config.getOrThrow<PetpoojaConfig>('petpooja').httpTimeoutMs;
  }

  /**
   * Returns the credential envelope embedded into every outbound POST
   * body. Throws if not configured — outbound integrations should not
   * silently proceed without credentials.
   */
  credentials(): CredentialBlock {
    if (this.cached) return this.cached;
    const cfg = this.config.getOrThrow<PetpoojaConfig>('petpooja');
    if (!cfg.appKey || !cfg.appSecret || !cfg.accessToken) {
      throw new Error(
        'PETPOOJA credentials missing (PETPOOJA_APP_KEY / PETPOOJA_APP_SECRET / PETPOOJA_ACCESS_TOKEN).',
      );
    }
    this.cached = {
      app_key: cfg.appKey,
      app_secret: cfg.appSecret,
      access_token: cfg.accessToken,
    };
    return this.cached;
  }

  /** Invalidates the cached credential block; used by rotation flows. */
  invalidate(): void {
    this.cached = null;
  }
}

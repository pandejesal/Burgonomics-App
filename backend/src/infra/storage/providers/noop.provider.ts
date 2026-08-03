import { Injectable, Logger } from '@nestjs/common';
import type {
  PutObjectInput,
  SignedUrlOptions,
  StorageObjectHead,
  StorageProvider,
} from '../interfaces/storage-provider.interface';

/**
 * Dev-mode provider that logs operations without persisting anything.
 * Used when `STORAGE_DRIVER=noop` so the app boots without S3 creds.
 */
@Injectable()
export class NoopStorageProvider implements StorageProvider {
  readonly name = 'noop';
  private readonly logger = new Logger(NoopStorageProvider.name);

  async putObject(input: PutObjectInput): Promise<{ key: string; url: string }> {
    this.logger.debug(`putObject(${input.key}) — noop`);
    return { key: input.key, url: `noop://${input.key}` };
  }

  async getSignedUrl(key: string, _options?: SignedUrlOptions): Promise<string> {
    return `noop://signed/${key}`;
  }

  async deleteObject(key: string): Promise<void> {
    this.logger.debug(`deleteObject(${key}) — noop`);
  }

  async headObject(_key: string): Promise<StorageObjectHead | null> {
    return null;
  }
}

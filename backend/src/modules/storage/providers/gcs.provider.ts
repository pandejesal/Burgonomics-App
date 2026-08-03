import { Injectable, NotImplementedException } from '@nestjs/common';
import type {
  PutObjectInput,
  SignedUrlOptions,
  StorageObjectHead,
  StorageProvider,
} from '@infra/storage/interfaces/storage-provider.interface';

/**
 * Google Cloud Storage provider port. Interface-only.
 */
@Injectable()
export class GcsStorageProvider implements StorageProvider {
  readonly name = 'gcs';

  async putObject(_input: PutObjectInput): Promise<{ key: string; url: string }> {
    throw new NotImplementedException('GCS provider not yet configured');
  }
  async getSignedUrl(_key: string, _options?: SignedUrlOptions): Promise<string> {
    throw new NotImplementedException('GCS provider not yet configured');
  }
  async deleteObject(_key: string): Promise<void> {
    throw new NotImplementedException('GCS provider not yet configured');
  }
  async headObject(_key: string): Promise<StorageObjectHead | null> {
    throw new NotImplementedException('GCS provider not yet configured');
  }
}

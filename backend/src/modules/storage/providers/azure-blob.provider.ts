import { Injectable, NotImplementedException } from '@nestjs/common';
import type {
  PutObjectInput,
  SignedUrlOptions,
  StorageObjectHead,
  StorageProvider,
} from '@infra/storage/interfaces/storage-provider.interface';

/**
 * Azure Blob provider port. Interface-only per the frozen architecture;
 * concrete SDK wiring lands with the storage rollout phase.
 */
@Injectable()
export class AzureBlobStorageProvider implements StorageProvider {
  readonly name = 'azure';

  async putObject(_input: PutObjectInput): Promise<{ key: string; url: string }> {
    throw new NotImplementedException('Azure Blob provider not yet configured');
  }
  async getSignedUrl(_key: string, _options?: SignedUrlOptions): Promise<string> {
    throw new NotImplementedException('Azure Blob provider not yet configured');
  }
  async deleteObject(_key: string): Promise<void> {
    throw new NotImplementedException('Azure Blob provider not yet configured');
  }
  async headObject(_key: string): Promise<StorageObjectHead | null> {
    throw new NotImplementedException('Azure Blob provider not yet configured');
  }
}

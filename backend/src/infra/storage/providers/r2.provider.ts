import { Injectable, NotImplementedException } from '@nestjs/common';
import type {
  PutObjectInput,
  SignedUrlOptions,
  StorageObjectHead,
  StorageProvider,
} from '../interfaces/storage-provider.interface';

@Injectable()
export class R2StorageProvider implements StorageProvider {
  readonly name = 'r2';

  async putObject(_input: PutObjectInput): Promise<{ key: string; url: string }> {
    throw new NotImplementedException('R2 provider not yet configured');
  }

  async getSignedUrl(_key: string, _options?: SignedUrlOptions): Promise<string> {
    throw new NotImplementedException('R2 provider not yet configured');
  }

  async deleteObject(_key: string): Promise<void> {
    throw new NotImplementedException('R2 provider not yet configured');
  }

  async headObject(_key: string): Promise<StorageObjectHead | null> {
    throw new NotImplementedException('R2 provider not yet configured');
  }
}

import { Injectable, NotImplementedException } from '@nestjs/common';
import type {
  PutObjectInput,
  SignedUrlOptions,
  StorageObjectHead,
  StorageProvider,
} from '../interfaces/storage-provider.interface';

/**
 * AWS S3 provider stub. Concrete `@aws-sdk/client-s3` wiring lands in a
 * later phase once bucket/IAM decisions are finalised. The class exists
 * now so the storage token can bind at boot without changing feature
 * modules later.
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';

  async putObject(_input: PutObjectInput): Promise<{ key: string; url: string }> {
    throw new NotImplementedException('S3 provider not yet configured');
  }

  async getSignedUrl(_key: string, _options?: SignedUrlOptions): Promise<string> {
    throw new NotImplementedException('S3 provider not yet configured');
  }

  async deleteObject(_key: string): Promise<void> {
    throw new NotImplementedException('S3 provider not yet configured');
  }

  async headObject(_key: string): Promise<StorageObjectHead | null> {
    throw new NotImplementedException('S3 provider not yet configured');
  }
}

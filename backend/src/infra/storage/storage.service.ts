import { Inject, Injectable } from '@nestjs/common';
import { INJECTION_TOKENS } from '@common/constants';
import type {
  PutObjectInput,
  SignedUrlOptions,
  StorageProvider,
} from './interfaces/storage-provider.interface';

@Injectable()
export class StorageService {
  constructor(
    @Inject(INJECTION_TOKENS.STORAGE_PROVIDER) private readonly provider: StorageProvider,
  ) {}

  putObject(input: PutObjectInput) {
    return this.provider.putObject(input);
  }

  signedUrl(key: string, options?: SignedUrlOptions) {
    return this.provider.getSignedUrl(key, options);
  }

  delete(key: string) {
    return this.provider.deleteObject(key);
  }

  head(key: string) {
    return this.provider.headObject(key);
  }

  get providerName(): string {
    return this.provider.name;
  }
}

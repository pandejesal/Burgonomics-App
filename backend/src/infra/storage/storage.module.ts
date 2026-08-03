import { Global, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INJECTION_TOKENS } from '@common/constants';
import type { StorageConfig } from '@config/storage.config';
import type { StorageProvider } from './interfaces/storage-provider.interface';
import { NoopStorageProvider } from './providers/noop.provider';
import { S3StorageProvider } from './providers/s3.provider';
import { R2StorageProvider } from './providers/r2.provider';
import { MinioStorageProvider } from './providers/minio.provider';
import { StorageService } from './storage.service';

const providerFactory: Provider = {
  provide: INJECTION_TOKENS.STORAGE_PROVIDER,
  inject: [
    ConfigService,
    NoopStorageProvider,
    S3StorageProvider,
    R2StorageProvider,
    MinioStorageProvider,
  ],
  useFactory: (
    config: ConfigService,
    noop: NoopStorageProvider,
    s3: S3StorageProvider,
    r2: R2StorageProvider,
    minio: MinioStorageProvider,
  ): StorageProvider => {
    const cfg = config.getOrThrow<StorageConfig>('storage');
    switch (cfg.driver) {
      case 's3':
        return s3;
      case 'r2':
        return r2;
      case 'minio':
        return minio;
      case 'noop':
      default:
        return noop;
    }
  },
};

@Global()
@Module({
  providers: [
    NoopStorageProvider,
    S3StorageProvider,
    R2StorageProvider,
    MinioStorageProvider,
    providerFactory,
    StorageService,
  ],
  exports: [StorageService, INJECTION_TOKENS.STORAGE_PROVIDER],
})
export class StorageModule {}

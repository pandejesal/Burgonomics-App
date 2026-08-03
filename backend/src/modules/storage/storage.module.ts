import { Module } from '@nestjs/common';
import { StorageModule as InfraStorageModule } from '@infra/storage/storage.module';
import { AzureBlobStorageProvider } from './providers/azure-blob.provider';
import { GcsStorageProvider } from './providers/gcs.provider';

/**
 * Domain storage module. Re-exports the infrastructure storage
 * abstraction so feature modules import from a single location.
 */
@Module({
  imports: [InfraStorageModule],
  providers: [AzureBlobStorageProvider, GcsStorageProvider],
  exports: [InfraStorageModule, AzureBlobStorageProvider, GcsStorageProvider],
})
export class StorageModule {}

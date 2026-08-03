/**
 * Domain-facing storage module.
 *
 * All storage-consuming feature modules depend ONLY on the interfaces
 * re-exported here — never on any cloud SDK. Concrete providers
 * (S3 / R2 / MinIO / Azure Blob / GCS) live under `@infra/storage/providers`
 * and are selected at boot via the `STORAGE_DRIVER` env.
 */
export type {
  StorageProvider,
  PutObjectInput,
  SignedUrlOptions,
  StorageObjectHead,
} from '@infra/storage/interfaces/storage-provider.interface';

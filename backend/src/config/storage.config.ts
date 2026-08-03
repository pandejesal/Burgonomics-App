import { registerAs } from '@nestjs/config';

export type StorageDriver = 'noop' | 's3' | 'r2' | 'minio' | 'azure' | 'gcs';

export interface StorageConfig {
  driver: StorageDriver;
  bucket?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicBaseUrl?: string;
}

export default registerAs<StorageConfig>('storage', () => ({
  driver: (process.env.STORAGE_DRIVER as StorageDriver) ?? 'noop',
  bucket: process.env.STORAGE_BUCKET,
  region: process.env.STORAGE_REGION,
  endpoint: process.env.STORAGE_ENDPOINT,
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
  publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL,
}));

export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface SignedUrlOptions {
  expiresInSeconds?: number;
  method?: 'GET' | 'PUT';
}

export interface StorageObjectHead {
  key: string;
  size: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
}

/**
 * Provider-agnostic object storage port. All storage-consuming modules
 * depend on this interface — never on the AWS/GCP/Azure SDKs directly.
 */
export interface StorageProvider {
  readonly name: string;
  putObject(input: PutObjectInput): Promise<{ key: string; url: string }>;
  getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string>;
  deleteObject(key: string): Promise<void>;
  headObject(key: string): Promise<StorageObjectHead | null>;
}

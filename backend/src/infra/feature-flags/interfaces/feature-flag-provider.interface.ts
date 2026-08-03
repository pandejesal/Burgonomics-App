export interface FeatureFlagContext {
  userId?: string;
  storeId?: string;
  [key: string]: unknown;
}

export interface FeatureFlagProvider {
  readonly name: string;
  isEnabled(key: string, ctx?: FeatureFlagContext): Promise<boolean>;
}

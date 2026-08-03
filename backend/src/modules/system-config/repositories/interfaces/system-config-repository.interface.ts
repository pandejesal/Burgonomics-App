import type {
  SystemConfigEntity,
  SystemConfigVersionEntity,
} from '../../entities/system-config.entity';
import type { SetConfigDto } from '../../dto';

export const SYSTEM_CONFIG_REPOSITORY = Symbol('SYSTEM_CONFIG_REPOSITORY');

export interface ISystemConfigRepository {
  list(category?: string): Promise<SystemConfigEntity[]>;
  getByKey(key: string): Promise<SystemConfigEntity | null>;
  set(input: SetConfigDto & { updatedBy?: string }): Promise<SystemConfigEntity>;
  delete(key: string): Promise<void>;
  history(key: string, limit: number): Promise<SystemConfigVersionEntity[]>;
}

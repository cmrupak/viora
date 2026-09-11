import type { KeyValueStorage } from '../../storage';
import type { VioraBackend } from '../types';
import { createLocalAdminService } from './admin';
import { createLocalAuthService } from './auth';
import { LocalDatabase } from './database';
import { createLocalFileService, createLocalStatsService } from './files';
import { createLocalRecordService } from './records';
import { createLocalUserService } from './users';

export function createLocalBackend(storage: KeyValueStorage): VioraBackend {
  const db = new LocalDatabase(storage);
  return {
    kind: 'local',
    auth: createLocalAuthService(db),
    users: createLocalUserService(db),
    records: createLocalRecordService(db),
    admin: createLocalAdminService(db),
    files: createLocalFileService(db),
    stats: createLocalStatsService(db),
  };
}

export { LocalDatabase };

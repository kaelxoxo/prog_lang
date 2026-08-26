import pg from 'pg';

import { serverConfig } from './config';

const { Pool } = pg;

export const databasePool = new Pool({
  connectionString: serverConfig.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

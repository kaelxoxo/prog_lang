import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import pg from 'pg';

import { setupConfig } from './config';

const { Client } = pg;
const migrationsDirectory = resolve(process.cwd(), 'database', 'migrations');

function quoteIdentifier(value: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${value}`);
  }

  return `"${value}"`;
}

function quoteLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function databaseUrlFor(databaseName: string) {
  const url = new URL(setupConfig.adminUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function ensureRoleAndDatabase() {
  const admin = new Client({ connectionString: setupConfig.adminUrl });
  const role = quoteIdentifier(setupConfig.databaseRole);
  const password = quoteLiteral(setupConfig.databaseRolePassword);
  const database = quoteIdentifier(setupConfig.databaseName);

  await admin.connect();

  try {
    const existingRole = await admin.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists',
      [setupConfig.databaseRole],
    );

    if (existingRole.rows[0]?.exists) {
      await admin.query(
        `ALTER ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT LOGIN PASSWORD ${password}`,
      );
    } else {
      await admin.query(
        `CREATE ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT LOGIN PASSWORD ${password}`,
      );
    }

    const existingDatabase = await admin.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists',
      [setupConfig.databaseName],
    );

    if (!existingDatabase.rows[0]?.exists) {
      await admin.query(`CREATE DATABASE ${database}`);
    }

    await admin.query(`REVOKE CONNECT ON DATABASE ${database} FROM PUBLIC`);
    await admin.query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
  } finally {
    await admin.end();
  }
}

async function runMigrations() {
  const client = new Client({ connectionString: databaseUrlFor(setupConfig.databaseName) });
  await client.connect();

  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS alaga_private');
    await client.query(`
      CREATE TABLE IF NOT EXISTS alaga_private.schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const migrationFiles = (await readdir(migrationsDirectory))
      .filter((filename) => filename.endsWith('.sql'))
      .sort();

    for (const filename of migrationFiles) {
      const alreadyApplied = await client.query(
        'SELECT 1 FROM alaga_private.schema_migrations WHERE filename = $1',
        [filename],
      );

      if (alreadyApplied.rowCount) {
        continue;
      }

      const sql = await readFile(resolve(migrationsDirectory, filename), 'utf8');
      await client.query('BEGIN');

      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO alaga_private.schema_migrations (filename) VALUES ($1)',
          [filename],
        );
        await client.query('COMMIT');
        process.stdout.write(`Applied ${filename}\n`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

async function main() {
  await ensureRoleAndDatabase();
  await runMigrations();
  process.stdout.write('Alaga PostgreSQL setup is complete.\n');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

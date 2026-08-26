const required = (name: string) => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const numberFromEnvironment = (name: string, fallback: number) => {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a valid TCP port.`);
  }

  return value;
};

export const serverConfig = {
  databaseUrl: required('DATABASE_URL'),
  host: process.env.SERVER_HOST?.trim() || '127.0.0.1',
  port: numberFromEnvironment('SERVER_PORT', 4000),
  corsOrigin: process.env.CORS_ORIGIN?.trim() || '*',
} as const;

export const setupConfig = {
  adminUrl: required('POSTGRES_ADMIN_URL'),
  databaseName: required('DATABASE_NAME'),
  databaseRole: required('DATABASE_ROLE'),
  databaseRolePassword: required('DATABASE_ROLE_PASSWORD'),
} as const;

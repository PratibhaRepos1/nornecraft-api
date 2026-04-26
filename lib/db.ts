import mysql from 'mysql2/promise';

declare global {
  var __nornecraftDbPool: mysql.Pool | undefined;
}

function createPool(): mysql.Pool {
  const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT } = process.env;

  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error(
      'Missing DB env vars. Set DB_HOST, DB_USER, DB_PASSWORD and DB_NAME in .env.local'
    );
  }

  let host = DB_HOST.trim();
  let port = DB_PORT ? Number(DB_PORT) : 3306;

  const hostPortMatch = host.match(/^(.*):(\d+)$/);
  if (hostPortMatch) {
    host = hostPortMatch[1];
    if (!DB_PORT) port = Number(hostPortMatch[2]);
  }

  return mysql.createPool({
    host,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    port,
    waitForConnections: true,
    connectionLimit: 5,
    namedPlaceholders: true,
  });
}

export const db: mysql.Pool =
  global.__nornecraftDbPool ?? (global.__nornecraftDbPool = createPool());

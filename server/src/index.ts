import { createAppServer } from './app';
import { serverConfig } from './config';
import { databasePool } from './database';

const server = createAppServer();

server.listen(serverConfig.port, serverConfig.host, () => {
  process.stdout.write(
    `Alaga API listening on http://${serverConfig.host}:${serverConfig.port}\n`,
  );
});

const shutdown = async () => {
  server.close();
  await databasePool.end();
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

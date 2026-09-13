import pg from 'pg';
import { createAppServer } from '../server/src/app.js';
import { databasePool } from '../server/src/database.js';

const { Client } = pg;
const demoPassword = 'AlagaDemoPassword123!';

async function testFlow() {
  const server = createAppServer(databasePool);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.log('Server listening at', baseUrl);

  const api = async (path, options = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data };
  };

  const owner = await api('/auth/register', {
    method: 'POST',
    body: { displayName: 'Maya Santos', email: 'maya@example.test', password: demoPassword },
  });
  console.log('Owner register:', owner);

  const caregiver = await api('/auth/register', {
    method: 'POST',
    body: { displayName: 'Paolo Santos', email: 'paolo@example.test', password: demoPassword },
  });
  console.log('Caregiver register:', caregiver);

  const patient = await api('/patients', {
    method: 'POST',
    token: owner.data.token,
    body: { displayName: 'Lola Rosa (Synthetic)' },
  });
  console.log('Patient create:', patient);

  server.close();
  await databasePool.end();
}

testFlow().catch(console.error);

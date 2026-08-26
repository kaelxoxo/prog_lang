import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveApiUrl } from '../../src/lib/apiUrl';

test('automatic development API URLs follow the current Expo host', () => {
  assert.equal(resolveApiUrl({
    configuredUrl: 'auto',
    developmentHostUri: '192.168.50.24:8081',
    isDevelopment: true,
    platform: 'android',
  }), 'http://192.168.50.24:4000');

  assert.equal(resolveApiUrl({
    configuredUrl: 'auto',
    developmentHostUri: 'exp://10.20.30.40:8081',
    isDevelopment: true,
    platform: 'ios',
  }), 'http://10.20.30.40:4000');
});

test('explicit API URLs remain available for hosted environments', () => {
  assert.equal(resolveApiUrl({
    configuredUrl: 'https://api.alaga.example/',
    developmentHostUri: '192.168.50.24:8081',
    isDevelopment: true,
    platform: 'android',
  }), 'https://api.alaga.example');
});

test('simulators retain platform-specific local fallbacks', () => {
  assert.equal(resolveApiUrl({
    configuredUrl: 'auto',
    isDevelopment: true,
    platform: 'android',
  }), 'http://10.0.2.2:4000');

  assert.equal(resolveApiUrl({
    configuredUrl: 'auto',
    isDevelopment: true,
    platform: 'web',
  }), 'http://127.0.0.1:4000');
});

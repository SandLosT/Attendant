import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { withServer, postJson } from '../helpers/http.js';

test('webhook ignora mensagens fromMe', async () => {
  await withServer(createApp(), async ({ baseUrl }) => {
    const response = await postJson(`${baseUrl}/webhook`, {
      fromMe: true,
      body: 'teste',
      from: '5511999999999@c.us',
      type: 'chat',
    });

    assert.equal(response.status, 200);
    assert.equal(response.json.ok, true);
    assert.equal(response.json.ignored, 'fromMe');
  });
});

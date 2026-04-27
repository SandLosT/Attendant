import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpApp } from '../../mcp-server/src/server.js';
import { withServer, postJson } from '../helpers/http.js';

const fakeTools = [
  {
    name: 'ping_tool',
    description: 'retorna pong',
    inputSchema: { type: 'object', properties: { value: { type: 'string' } } },
    outputSchema: { type: 'object' },
    handler: async ({ value }) => ({ ok: true, value: value || 'pong' }),
  },
];

const fakeResources = {
  listResources: () => [],
  listResourceTemplates: () => [{ uriTemplate: 'customer://phone/{phone}/profile', name: 'customer_profile' }],
  readResource: async (uri) => ({ uri, content: { ok: true, uri } }),
};

test('healthcheck do MCP retorna ok', async () => {
  await withServer(createMcpApp({ toolsOverride: fakeTools, resourcesApi: fakeResources }), async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.ok, true);
  });
});

test('initialize do MCP', async () => {
  await withServer(createMcpApp({ toolsOverride: fakeTools, resourcesApi: fakeResources }), async ({ baseUrl }) => {
    const { status, json } = await postJson(`${baseUrl}/jsonrpc`, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    });
    assert.equal(status, 200);
    assert.equal(json.result.protocolVersion, '2024-11-05');
  });
});

test('tools/list e tools/call', async () => {
  await withServer(createMcpApp({ toolsOverride: fakeTools, resourcesApi: fakeResources }), async ({ baseUrl }) => {
    const listed = await postJson(`${baseUrl}/jsonrpc`, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    assert.equal(listed.status, 200);
    assert.equal(Array.isArray(listed.json.result.tools), true);
    assert.equal(listed.json.result.tools[0].name, 'ping_tool');

    const called = await postJson(`${baseUrl}/jsonrpc`, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'ping_tool', arguments: { value: 'ok' } },
    });
    assert.equal(called.status, 200);
    assert.equal(called.json.result.content[0].json.value, 'ok');
  });
});

test('resources/read principal', async () => {
  await withServer(createMcpApp({ toolsOverride: fakeTools, resourcesApi: fakeResources }), async ({ baseUrl }) => {
    const read = await postJson(`${baseUrl}/jsonrpc`, {
      jsonrpc: '2.0',
      id: 4,
      method: 'resources/read',
      params: { uri: 'customer://phone/5511999999999/profile' },
    });
    assert.equal(read.status, 200);
    const content = JSON.parse(read.json.result.contents[0].text);
    assert.equal(content.ok, true);
  });
});

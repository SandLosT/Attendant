import express from 'express';
import 'dotenv/config';
import { getToolDefinitions } from './tools/definitions.js';
import { listResourceTemplates, readResource } from './resources/definitions.js';
import { listPrompts, getPrompt } from './prompts/definitions.js';

const app = express();
app.use(express.json({ limit: '25mb' }));

const PORT = Number(process.env.MCP_PORT || 3100);
const PROTOCOL_VERSION = '2024-11-05';
const tools = getToolDefinitions();
const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message, data) => ({ jsonrpc: '2.0', id, error: { code, message, data } });

app.get('/health', (_req, res) => res.json({ ok: true, server: 'attendant-mcp-server' }));

app.post('/jsonrpc', async (req, res) => {
  const body = req.body || {};
  const { id = null, method, params = {} } = body;

  try {
    if (method === 'initialize') {
      return res.json(ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: { name: 'attendant-mcp-server', version: '1.0.0' },
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false },
          prompts: { listChanged: false },
        },
      }));
    }

    if (method === 'tools/list') {
      return res.json(ok(id, { tools: tools.map(({ name, description, inputSchema, outputSchema }) => ({ name, description, inputSchema, outputSchema })) }));
    }

    if (method === 'tools/call') {
      const tool = toolMap.get(params.name);
      if (!tool) return res.status(404).json(fail(id, -32601, `Tool não encontrada: ${params.name}`));
      try {
        const result = await tool.handler(params.arguments || {});
        return res.json(ok(id, { content: [{ type: 'json', json: result }], isError: false }));
      } catch (error) {
        console.error('[mcp] tool error', params.name, error.message);
        return res.status(500).json(ok(id, {
          content: [{ type: 'json', json: { ok: false, message: error.message, tool: params.name } }],
          isError: true,
        }));
      }
    }

    if (method === 'resources/list') return res.json(ok(id, { resources: listResourceTemplates() }));
    if (method === 'resources/read') {
      const resource = await readResource(params.uri);
      return res.json(ok(id, { contents: [{ uri: resource.uri, mimeType: 'application/json', text: JSON.stringify(resource.content) }] }));
    }
    if (method === 'prompts/list') return res.json(ok(id, { prompts: listPrompts() }));
    if (method === 'prompts/get') return res.json(ok(id, getPrompt(params.name)));

    return res.status(400).json(fail(id, -32601, `Método não suportado: ${method}`));
  } catch (error) {
    console.error('[mcp] request error', method, error.message);
    return res.status(500).json(fail(id, -32000, error.message));
  }
});

app.listen(PORT, () => {
  console.log(`[mcp] servidor MCP online na porta ${PORT}`);
});

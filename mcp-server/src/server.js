import express from 'express';
import 'dotenv/config';
import { getToolDefinitions } from './tools/definitions.js';
import { listResourceTemplates, listResources, readResource } from './resources/definitions.js';
import { listPrompts, getPrompt } from './prompts/definitions.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';


const PROTOCOL_VERSION = '2024-11-05';
const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message, data) => ({ jsonrpc: '2.0', id, error: { code, message, data } });

function isValidJsonRpcBody(body) {
  if (!body || typeof body !== 'object') return 'JSON body inválido';
  if (body.jsonrpc !== '2.0') return 'jsonrpc deve ser "2.0"';
  if (typeof body.method !== 'string' || !body.method.trim()) return 'method inválido';
  if (body.id !== undefined && typeof body.id !== 'string' && typeof body.id !== 'number' && body.id !== null) {
    return 'id inválido';
  }
  if (body.params !== undefined && (body.params === null || typeof body.params !== 'object' || Array.isArray(body.params))) {
    return 'params deve ser objeto';
  }
  return null;
}

export function createMcpApp({ toolsOverride = null, resourcesApi = null, promptsApi = null } = {}) {
  const app = express();
  const tools = toolsOverride || getToolDefinitions();
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
  const resources = resourcesApi || { listResources, listResourceTemplates, readResource };
  const prompts = promptsApi || { listPrompts, getPrompt };

  app.use(express.json({ limit: '25mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true, server: 'attendant-mcp-server' }));

  app.post('/jsonrpc', async (req, res) => {
    const body = req.body || {};
    const validationError = isValidJsonRpcBody(body);
    if (validationError) return res.status(400).json(fail(null, -32600, validationError));

    const { id = null, method, params = {} } = body;

    try {
      if (method === 'initialize') {
        return res.json(ok(id, {
          protocolVersion: PROTOCOL_VERSION,
          serverInfo: { name: 'attendant-mcp-server', version: '1.1.0' },
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false, subscribe: false },
            prompts: { listChanged: false },
          },
          instructions: 'Use resources/templates/list para descobrir templates de resource URI.',
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

      if (method === 'resources/list') return res.json(ok(id, { resources: resources.listResources() }));
      if (method === 'resources/templates/list') return res.json(ok(id, { resourceTemplates: resources.listResourceTemplates() }));
      if (method === 'resources/read') {
        if (!params.uri) return res.status(400).json(fail(id, -32602, 'params.uri é obrigatório'));
        const resource = await resources.readResource(params.uri);
        return res.json(ok(id, {
          contents: [{
            uri: resource.uri,
            mimeType: 'application/json',
            text: JSON.stringify(resource.content),
          }],
        }));
      }
      if (method === 'prompts/list') return res.json(ok(id, { prompts: prompts.listPrompts() }));
      if (method === 'prompts/get') return res.json(ok(id, prompts.getPrompt(params.name)));

      return res.status(400).json(fail(id, -32601, `Método não suportado: ${method}`));
    } catch (error) {
      console.error('[mcp] request error', method, error.message);
      return res.status(500).json(fail(id, -32000, error.message));
    }
  });

  return app;
}

const currentFile = fileURLToPath(import.meta.url);
const executedFile = process.argv[1] ? path.resolve(process.argv[1]) : null;

if (executedFile && path.resolve(currentFile) === executedFile) {
  const PORT = Number(process.env.MCP_PORT || 3100);
  const app = createMcpApp();

  app.listen(PORT, () => {
    console.log(`[mcp] servidor MCP online na porta ${PORT}`);
  });
}

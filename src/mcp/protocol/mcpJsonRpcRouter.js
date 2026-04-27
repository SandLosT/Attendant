import express from 'express';
import { getMcpRuntime } from './mcpRuntime.js';

const router = express.Router();
const runtime = getMcpRuntime();
const PROTOCOL_VERSION = '2024-11-05';

function ok(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function err(id, code, message, data = undefined) {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

router.post('/', async (req, res) => {
  const body = req.body || {};
  const { id = null, method, params = {} } = body;

  try {
    if (method === 'initialize') {
      return res.json(ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: { name: 'attendant-mcp', version: '1.0.0' },
        capabilities: { tools: { listChanged: false } },
      }));
    }

    if (method === 'tools/list') {
      return res.json(ok(id, { tools: runtime.listTools() }));
    }

    if (method === 'tools/call') {
      const name = params.name;
      const args = params.arguments || {};
      const result = await runtime.callTool(name, args);
      return res.json(ok(id, {
        content: [{ type: 'json', json: result }],
        isError: false,
      }));
    }

    return res.status(400).json(err(id, -32601, `Método MCP não suportado: ${method}`));
  } catch (error) {
    return res.status(500).json(err(id, -32000, error.message, { stack: error.stack }));
  }
});

export default router;

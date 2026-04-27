import axios from 'axios';

let seq = 1;

export class McpClient {
  constructor({ baseUrl, timeoutMs = 10000 }) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.initialized = false;
  }

  async request(method, params = {}) {
    const id = seq++;
    const response = await axios.post(this.baseUrl, {
      jsonrpc: '2.0',
      id,
      method,
      params,
    }, {
      timeout: this.timeoutMs,
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.data?.error) {
      const error = new Error(response.data.error.message || 'Erro MCP');
      error.code = response.data.error.code;
      error.data = response.data.error.data;
      throw error;
    }

    return response.data?.result;
  }

  async initialize() {
    if (this.initialized) return;
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'attendant-backend', version: '1.0.0' },
    });
    this.initialized = true;
  }

  async listTools() {
    await this.initialize();
    const result = await this.request('tools/list', {});
    return result?.tools || [];
  }

  async listResourceTemplates() {
    await this.initialize();
    const result = await this.request('resources/templates/list', {});
    return result?.resourceTemplates || [];
  }

  async readResource(uri) {
    await this.initialize();
    const result = await this.request('resources/read', { uri });
    return result?.contents || [];
  }

  async getPrompt(name) {
    await this.initialize();
    return this.request('prompts/get', { name });
  }

  async callTool(name, args = {}) {
    await this.initialize();
    const result = await this.request('tools/call', {
      name,
      arguments: args,
    });

    const item = Array.isArray(result?.content) ? result.content.find((c) => c.type === 'json') : null;
    if (result?.isError) {
      throw new Error(item?.json?.message || `Falha ao executar tool ${name}`);
    }
    return item?.json ?? result;
  }
}

let singleton;
export function getMcpClient() {
  if (!singleton) {
    singleton = new McpClient({
      baseUrl: process.env.MCP_SERVER_URL || 'http://localhost:3100/jsonrpc',
      timeoutMs: Number(process.env.MCP_TIMEOUT_MS || 12000),
    });
  }
  return singleton;
}

import { getMcpToolDefinitions } from '../tools/definitions.js';

export class McpRuntime {
  constructor({ toolDefinitions = getMcpToolDefinitions() } = {}) {
    this.toolDefinitions = toolDefinitions;
    this.toolMap = new Map(toolDefinitions.map((tool) => [tool.name, tool]));
  }

  listTools() {
    return this.toolDefinitions.map(({ name, description, inputSchema, outputSchema }) => ({
      name,
      description,
      inputSchema,
      outputSchema,
    }));
  }

  async callTool(name, args = {}) {
    const tool = this.toolMap.get(name);
    if (!tool) {
      throw new Error(`MCP tool não encontrada: ${name}`);
    }
    return tool.handler(args);
  }
}

let singleton;
export function getMcpRuntime() {
  if (!singleton) singleton = new McpRuntime();
  return singleton;
}

import { getMcpRuntime } from '../protocol/mcpRuntime.js';

export function createMcpTools() {
  const runtime = getMcpRuntime();
  const tools = {};
  for (const tool of runtime.listTools()) {
    tools[tool.name] = async (args) => runtime.callTool(tool.name, args || {});
  }
  return tools;
}

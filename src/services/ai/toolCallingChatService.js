import { createChatCompletion } from '../../integrations/ai/openaiChatService.js';

const MAX_TOOL_ROUNDS = Number(process.env.AI_MAX_TOOL_ROUNDS || 6);

function toOpenAIToolSchema(tool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema || { type: 'object', properties: {} },
    },
  };
}

function parseArgs(rawArguments) {
  if (!rawArguments) return {};
  if (typeof rawArguments === 'object') return rawArguments;
  try {
    return JSON.parse(rawArguments);
  } catch {
    return {};
  }
}

export async function runToolCallingChat({
  systemPrompt,
  contextPrompt,
  availableTools,
  mcpClient,
}) {
  const tools = availableTools.map(toOpenAIToolSchema);
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: contextPrompt },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    let completion;
    try {
      completion = await createChatCompletion({
        messages,
        tools,
        tool_choice: 'auto',
      });
    } catch {
      return { ok: false, reason: 'MODEL_UNAVAILABLE' };
    }

    const message = completion?.choices?.[0]?.message;
    if (!message) break;

    if (!message.tool_calls?.length) {
      return {
        ok: true,
        content: message.content?.trim() || '',
        rounds: round + 1,
      };
    }

    messages.push({
      role: 'assistant',
      content: message.content || '',
      tool_calls: message.tool_calls,
    });

    let hadToolError = false;
    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function?.name;
      const args = parseArgs(toolCall.function?.arguments);
      let toolResult;

      try {
        toolResult = await mcpClient.callTool(toolName, args);
      } catch (error) {
        hadToolError = true;
        toolResult = {
          ok: false,
          error: error.message,
          code: error.code || 'MCP_TOOL_ERROR',
        };
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      });
    }

    if (hadToolError && round >= 1) {
      return { ok: false, reason: 'TOOL_ERROR' };
    }
  }

  return { ok: false, reason: 'MAX_TOOL_ROUNDS_REACHED' };
}

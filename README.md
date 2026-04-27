# Attendant (MCP real + MySQL only)

Implementação com **backend principal** e **MCP server separado**, conectados por JSON-RPC.

## Arquitetura

- **Backend principal** (`src/*`): Express, webhook, owner APIs, PWA, orquestração, integração LLM e cliente MCP.
- **MCP server** (`mcp-server/src/*`): tools formais (com schemas), resources, prompts e handlers conectados aos services/repositories.
- **AI layer** (`src/services/ai/*`): context builder + loop real de tool calling (`tool_choice: auto`).

## Executar

```bash
npm install
npm run migrate
npm run seed
npm run pwa:build
npm run mcp:start
npm run start
```

### Healthchecks

```bash
curl http://localhost:3100/health
curl http://localhost:3001/health
```

## Endpoints principais

- `POST /webhook` entrada do WhatsApp
- `GET /owner/pwa`
- `GET /owner/orcamentos`
- `GET /owner/agenda`

## MCP server

Endpoint JSON-RPC:

- `POST http://localhost:3100/jsonrpc`

Métodos suportados:

- `initialize`
- `tools/list`
- `tools/call`
- `resources/list`
- `resources/read`
- `prompts/list`
- `prompts/get`

### Tools obrigatórias implementadas

- `get_customer_context`
- `get_current_attendance`
- `save_incoming_message`
- `save_outgoing_message`
- `set_attendance_state`
- `set_attendance_mode`
- `analyze_damage_image`
- `create_quote_from_analysis`
- `update_quote`
- `reserve_schedule_slot`
- `release_schedule_slot`
- `escalate_to_human`
- `resume_automatic_flow`
- `close_attendance`
- `send_customer_message`

## Tool calling real (LLM)

Fluxo no backend:

1. carrega contexto via MCP;
2. envia contexto + tools ao modelo;
3. modelo decide tools (`tool_choice: auto`);
4. backend executa tools via MCP client;
5. resultado retorna ao modelo;
6. modelo produz resposta final.

## Variáveis de ambiente

Veja `.env.example`.

Novas/alteradas:

- `MCP_PORT` (porta do processo MCP)
- `MCP_SERVER_URL` (URL JSON-RPC usada pelo backend)
- `MCP_TIMEOUT_MS` (timeout do cliente MCP)

## Observações

- Base continua **MySQL-only**.
- `/owner/pwa` segue servido pelo backend.
- Regras duras de negócio continuam no backend (ex.: modo MANUAL não responde automaticamente).

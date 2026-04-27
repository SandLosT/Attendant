# Attendant (MCP-first / MySQL-only)

Arquitetura refatorada e consolidada para separar claramente:

- **HTTP / Routes** (`src/http`, `src/routes`)
- **Application / Orchestration** (`src/application/orchestration`)
- **MCP Server + Tools** (`src/mcp/protocol`, `src/mcp/tools`)
- **Domain Services** (`src/domain/services`)
- **Repositories / Persistence** (`src/repositories`)
- **Integrations** (`src/integrations`)

## Estados de atendimento

- `OPEN`
- `WAITING_IMAGE`
- `IN_ANALYSIS`
- `WAITING_SCHEDULE`
- `HUMAN_HANDOFF`
- `CLOSED`
- `CANCELLED`

Modo operacional (separado):

- `AUTO`
- `MANUAL`

## Requisitos

- Node.js 20+
- MySQL 8+
- Serviço de embeddings (Python) opcional para análise de imagem

## Executar

```bash
npm install
npm run migrate
npm run seed
npm run start
```

Health-check:

```bash
curl http://localhost:3001/health
```

## PWA Owner

Build:

```bash
npm run pwa:build
```

Shell servido pelo backend em:

- `GET /owner/pwa`

> O shell do PWA é público para carregar app/assets. APIs de owner permanecem protegidas por token Bearer.

## Endpoints principais

- `POST /webhook` entrada do WhatsApp (texto/imagem)
- `POST /upload/:telefone` upload manual de imagem para orçamento
- `GET /owner/orcamentos`
- `POST /owner/clientes/:clienteId/interferir` (MANUAL)
- `POST /owner/clientes/:clienteId/devolver` (AUTO sem reset cego)
- `GET /owner/agenda`

## MCP implementado

O projeto expõe um **servidor MCP JSON-RPC** em `POST /mcp` com métodos:

- `initialize`
- `tools/list`
- `tools/call`

As tools MCP são registradas formalmente em `src/mcp/tools/definitions.js` com:

- nome e descrição
- `inputSchema`
- `outputSchema`
- handler

Tools disponíveis:

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

## Embedding service

Execute o serviço Python:

```bash
python embed_faiss_service.py
```

Porta padrão: `8001`.

## Migração

Essa versão é **MySQL only**. Estruturas SQLite e scripts legado não fazem parte desta base.

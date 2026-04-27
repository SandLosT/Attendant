# Attendant (MySQL + MCP Server separado)

Projeto com **backend principal (Express)**, **MCP server dedicado (JSON-RPC)**, **PWA do owner** e **serviço de embeddings** para análise de imagem.

## 1) Arquitetura operacional

- **Backend API**: `src/app.js` (porta padrão `3001`)
  - Webhook WhatsApp
  - Rotas owner e agenda
  - Orquestração conversacional + tool calling via MCP
- **MCP Server**: `mcp-server/src/server.js` (porta padrão `3100`)
  - `initialize`, `tools/list`, `tools/call`
  - `resources/list`, `resources/templates/list`, `resources/read`
  - `prompts/list`, `prompts/get`
- **Embedding service**: `embed_faiss_service.py` (porta padrão `8001`)
- **PWA owner**: `src/pwa-owner` (build servido em `/owner/pwa` pelo backend)

## 2) Pré-requisitos

- Node.js 20+
- Python 3.10+
- MySQL 8+
- NPM

## 3) Variáveis de ambiente

Copie o exemplo:

```bash
cp .env.example .env
```

Campos principais (ajuste conforme ambiente):

- **Banco MySQL**
  - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- **Backend**
  - `PORT` (ex.: `3001`)
  - `OWNER_AUTH_TOKEN` (obrigatório para rotas owner)
  - `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_TEMPERATURE`
- **MCP**
  - `MCP_PORT` (ex.: `3100`)
  - `MCP_SERVER_URL` (no backend: `http://localhost:3100/jsonrpc`)
  - `MCP_TIMEOUT_MS`
- **Embeddings**
  - `EMBED_SERVICE_URL` (ex.: `http://localhost:8001`)

## 4) Instalação

```bash
npm install
npm --prefix mcp-server install
python3 -m pip install -r requirements-embed.txt
```

## 5) Ordem correta de subida

### Passo 1 — MySQL
Garanta o banco ativo e acessível pelas variáveis de ambiente.

### Passo 2 — Migração + seed
```bash
npm run migrate
npm run seed
```

### Passo 3 — Embedding service
```bash
python3 embed_faiss_service.py
```

### Passo 4 — MCP server
```bash
npm run mcp:start
```

### Passo 5 — PWA build
```bash
npm run pwa:build
```

### Passo 6 — Backend
```bash
npm run start
```

## 6) Validação rápida

### Healthchecks
```bash
curl http://localhost:3001/health
curl http://localhost:3100/health
```

### Initialize MCP
```bash
curl -X POST http://localhost:3100/jsonrpc \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

### Listar tools MCP
```bash
curl -X POST http://localhost:3100/jsonrpc \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

### Ler resource MCP
```bash
curl -X POST http://localhost:3100/jsonrpc \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"schedule://availability?date=2026-04-30&period=MANHA"}}'
```

## 7) Testes automatizados mínimos

```bash
npm test
```

Cobertura mínima atual:
- healthcheck backend
- initialize/tools/list/tools/call/resources/read do MCP
- webhook ignorando `fromMe`
- confirmação de período quando cliente envia data sem período
- owner flow básico (aprovar/recusar)
- retorno MANUAL → AUTO preservando contexto

## 8) Operação do owner (PWA)

- URL: `http://localhost:3001/owner/pwa`
- Autenticação: bearer token do owner (`OWNER_AUTH_TOKEN`)
- Fluxos principais:
  - aprovação/recusa de orçamento
  - takeover/interferência manual
  - devolução para automático
  - fechamento manual
  - bloqueio/desbloqueio de agenda

## 9) Troubleshooting rápido

- **401 em rotas owner**
  - conferir `OWNER_AUTH_TOKEN` no backend
  - limpar token salvo no navegador e logar novamente
- **Timeout no MCP client**
  - validar `MCP_SERVER_URL`
  - confirmar MCP server ativo em `MCP_PORT`
- **Falha em análise de imagem**
  - confirmar embedding service ativo (`EMBED_SERVICE_URL`)
- **Sem resposta do modelo**
  - validar `OPENAI_API_KEY`
  - checar logs de fallback no backend

## 10) Limitações conhecidas

- `resources/list` retorna vazio por padrão (uso principal é via `resources/templates/list` + `resources/read`).
- Testes automatizados de reserva com persistência real em MySQL ainda podem exigir suite de integração dedicada com banco de teste.

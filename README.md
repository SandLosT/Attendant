# Attendant

## PWA do dono (Owner)

### Desenvolvimento (Vite)

```bash
npm install
npm run dev
npm run pwa:dev
```

O Vite expõe o PWA em `http://localhost:5173` para desenvolvimento local.
O proxy do Vite encaminha `/owner` e `/uploads` para o backend em `http://localhost:3001`, evitando CORS.

### Produção (build + Express)

```bash
npm run build:pwa
npm run start
```

Quando existir `src/pwa-owner/dist`, o Express serve o PWA em:

- `http://localhost:3001/owner/pwa` (index.html)
- `http://localhost:3001/owner/pwa/*` (SPA fallback)
- Assets estáticos em `/owner/pwa/assets/*`

## Endpoints de agenda (owner)

Todos os endpoints exigem `Authorization: Bearer <OWNER_AUTH_TOKEN>`.

- `GET /owner/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD` — lista slots (pode omitir `from/to` para usar os próximos 14 dias).
- `POST /owner/agenda/gerar` — gera slots (`dias`, `capacidade`, `a_partir_de`).
- `POST /owner/agenda/bloquear` — bloqueia data/período.
- `POST /owner/agenda/desbloquear` — desbloqueia data/período.

Exemplo (curl):

```bash
curl.exe "http://localhost:3001/owner/agenda?from=2025-12-01&to=2025-12-31" -H "Authorization: Bearer <TOKEN>"
```

## Testes manuais de agenda

Gerar agenda:

```bash
curl.exe -X POST http://localhost:3001/owner/agenda/gerar -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" --data-raw "{\"dias\":30,\"capacidade\":3}"
```

Ver disponibilidade:

```bash
curl.exe "http://localhost:3001/owner/agenda?from=2025-12-01&to=2025-12-31" -H "Authorization: Bearer <TOKEN>"
```

Bloquear slot:

```bash
curl.exe -X POST http://localhost:3001/owner/agenda/bloquear -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" --data-raw "{\"data\":\"2025-12-05\",\"periodo\":\"MANHA\",\"bloqueado\":true}"
```

Desbloquear slot:

```bash
curl.exe -X POST http://localhost:3001/owner/agenda/desbloquear -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" --data-raw "{\"data\":\"2025-12-05\",\"periodo\":\"MANHA\"}"
```

Simular semana cheia:

1. Faça `INSERT/UPDATE` em `agenda_slots` somando `reservados` total >= 5 naquela semana.
2. Tente reservar via WhatsApp.
3. Deve sugerir a próxima vaga na semana seguinte.

## Teste manual de imagens de orçamento

Após gerar um orçamento com imagem, abra no navegador:

```text
http://localhost:3001/uploads/<arquivo>
```

## Testes manuais do fluxo de atendimento

### Teste A — “Olá” não pede foto

1. Cliente envia: `Olá`.
2. Esperado: resposta normal da IA, sem mensagem automática fixa pedindo foto.

### Teste B — Pedido explícito de orçamento pede foto

1. Cliente envia: `Quero um orçamento`.
2. Esperado: a IA conduz a conversa de orçamento, pedindo foto e detalhes de forma natural.

### Teste C — Envio de imagem cria orçamento e muda estado

1. Cliente envia uma imagem (via `/upload` ou WhatsApp webhook de imagem).
2. Esperado: orçamento criado e atendimento transita para estado controlado (`AGUARDANDO_DATA` ou `AGUARDANDO_APROVACAO_DONO`).

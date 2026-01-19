# Attendant

## PWA do dono (Owner)

### Desenvolvimento (Vite)

```bash
npm run pwa:dev
```

O Vite expõe o PWA em `http://localhost:5173` para desenvolvimento local.

### Produção (build + Express)

```bash
npm run pwa:build
npm run start
```

Quando existir `src/pwa-owner/dist`, o Express serve o PWA em:

- `http://localhost:3001/pwa` (index.html)
- `http://localhost:3001/pwa/*` (SPA fallback)
- Assets estáticos em `/pwa/assets/*`

## Testes manuais de agenda

Gerar agenda:

```bash
curl.exe -X POST http://localhost:3001/owner/agenda/gerar -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" --data-raw "{\"dias\":30,\"capacidade\":3}"
```

Ver disponibilidade:

```bash
curl.exe "http://localhost:3001/owner/agenda?from=2025-12-01&to=2025-12-31" -H "Authorization: Bearer <TOKEN>"
```

Bloquear/desbloquear slot:

```bash
curl.exe -X POST http://localhost:3001/owner/agenda/bloquear -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" --data-raw "{\"data\":\"2025-12-05\",\"periodo\":\"MANHA\",\"bloqueado\":true}"
```

Simular semana cheia:

1. Faça `INSERT/UPDATE` em `agenda_slots` somando `reservados` total >= 5 naquela semana.
2. Tente reservar via WhatsApp.
3. Deve sugerir a próxima vaga na semana seguinte.

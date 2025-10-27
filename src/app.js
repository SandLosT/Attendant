import express from 'express';
import * as dotenv from 'dotenv';
import axios from 'axios';
import { processarMensagem } from './usecases/processarMensagem.js';
import { enviarMensagem } from './services/wppconnectService.js';
import uploadImagemRouter from './routes/uploadImagemRouter.js';
import imageUploadRouter from './routes/imageUploadRouter.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// === Ajustes p/ integrar com wppconnect (use/env ou defaults) ===
const WPP_API_URL = process.env.WPP_API_URL || 'http://localhost:21465/api';
const WPP_SESSION = process.env.WPP_SESSION || 'teste';
const WPP_TOKEN = process.env.WPP_TOKEN || ''; // se seu wppconnect exigir token

app.use(express.json({ limit: '10mb' }));
app.use('/upload', uploadImagemRouter);
app.use('/uploads', imageUploadRouter);

// Rota de teste simples
app.get('/', (_req, res) => res.send('Servidor de atendimento IA rodando'));

// Healthcheck
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));

// ------------------- WEBHOOK -------------------
const webhookRoutes = ['/webhook', '/webhook/:sessionId', '/webhook/:sessionId/:event'];

// guarda o último QR em memória p/ renderizar em /qr
global.__QRCODE_BASE64__ = null;

webhookRoutes.forEach((route) => {
  app.get(route, (_req, res) => res.status(200).json({ status: 'webhook-ok' }));

  app.post(route, async (req, res) => {
    const evento = req.body || {};
    const eventName = String(evento.event || '').toLowerCase();
    console.log('📥 Webhook recebido:', JSON.stringify(evento, null, 2));

    // 1) QR CODE
    if (eventName === 'qrcode' || evento.qrcode) {
      try {
        const base64 = (evento.qrcode || '').replace(/^data:image\/\w+;base64,/, '');
        if (base64) {
          global.__QRCODE_BASE64__ = evento.qrcode.startsWith('data:')
            ? evento.qrcode
            : `data:image/png;base64,${base64}`;
          // opcional: salva em arquivo
          const { writeFileSync } = await import('fs');
          writeFileSync('qrcode.png', Buffer.from(base64, 'base64'));
          console.log('🔳 QR recebido e salvo em qrcode.png');
        }
      } catch (e) {
        console.warn('⚠️ Falha ao salvar QR:', e.message);
      }
      return res.sendStatus(200);
    }

    // 2) STATUS
    if (eventName === 'status' || evento.status || evento.state) {
      console.log('📡 Status sessão:', evento.status || evento.state);
      return res.sendStatus(200);
    }

    // 3) MENSAGENS
    const isOnMessage = eventName === 'onmessage';
    const msg = evento.message || evento;
    const isChat = (msg.type || evento.type) === 'chat';

    if (isOnMessage && isChat) {
      const telefone = String((msg.from || '').replace('@c.us', ''));
      const mensagem = msg.body;
      if (!telefone || !mensagem) return res.status(400).json({ erro: 'Dados inválidos' });

      try {
        const resposta = await processarMensagem(telefone, mensagem);
        await enviarMensagem(telefone, resposta);
        return res.sendStatus(200);
      } catch (err) {
        console.error('❌ Erro ao processar mensagem:', err);
        return res.status(500).json({ erro: err.message });
      }
    }

    return res.status(200).json({ info: 'Evento ignorado', event: evento.event || null });
  });
});

// -------------- ROTAS P/ VER O QR --------------

// 1) Renderiza o QR que chegou via webhook
app.get('/qr', (_req, res) => {
  if (!global.__QRCODE_BASE64__) return res.status(204).send('Sem QR no momento.');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<img style="width:320px" src="${global.__QRCODE_BASE64__}" />`);
});

// 2) Puxa o QR direto do wppconnect (independe do webhook)
app.get('/qr/poll', async (_req, res) => {
  const WPP_API_URL = 'http://localhost:21465/api';   // ajuste se seu server não for esse
  const WPP_SESSION = 'teste';                         // seu nome de sessão
  const WPP_TOKEN = '$2b$10$ru28RqP2p7dx_aa.mriYHefxNghS8jpRJ2mhTjq1l24SNQlwkUofm'; // <-- COLE O MESMO USADO NO SWAGGER
  const urlBase = `${WPP_API_URL}/${encodeURIComponent(WPP_SESSION)}`;

  try {
    // 1) Tenta via POST /start-session (a maioria das builds retorna qrcode durante INITIALIZING)
    const startBody = {
      waitQrCode: false,
      waitStatusState: false,
      webhookBase64: true,
      token: WPP_TOKEN                          // <-- algumas builds pedem no body também
    };
    const r1 = await axios.post(`${urlBase}/start-session`, startBody, {
      headers: { Authorization: `Bearer ${WPP_TOKEN}`, 'Content-Type': 'application/json' },
      timeout: 15000
    });

    const b64a =
      r1.data?.qrcode ||
      r1.data?.qrCode ||
      r1.data?.base64 ||
      (typeof r1.data === 'string' ? r1.data : '');

    if (b64a) {
      const src = b64a.startsWith('data:') ? b64a : `data:image/png;base64,${b64a}`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(`<img style="width:320px" src="${src}" />`);
    }

    // 2) Fallback: algumas builds expõem GET /qr-code; se for 404, ignoramos.
    try {
      const r2 = await axios.get(`${urlBase}/qr-code`, {
        headers: { Authorization: `Bearer ${WPP_TOKEN}` },
        timeout: 10000
      });
      const b64b =
        r2.data?.qrcode ||
        r2.data?.qrCode ||
        r2.data?.base64 ||
        (typeof r2.data === 'string' ? r2.data : '');
      if (b64b) {
        const src = b64b.startsWith('data:') ? b64b : `data:image/png;base64,${b64b}`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(`<img style="width:320px" src="${src}" />`);
      }
    } catch (e2) {
      if (e2?.response?.status !== 404) {
        console.error('fallback GET /qr-code erro:', e2.message);
      }
    }

    return res.status(204).send('Sem QR no momento (recarregue em 1–2s).');
  } catch (e) {
    console.error('❌ Erro ao buscar QR (POST /start-session):', e.response?.status, e.message, e?.response?.data);
    return res.status(500).send('Erro ao buscar QR: ' + (e.response?.status || e.message));
  }
});

// ------------------- START -------------------
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  console.log(`ℹ️  Abra /healthz:        http://localhost:${PORT}/healthz`);
  console.log(`ℹ️  Ver QR (webhook):     http://localhost:${PORT}/qr`);
  console.log(`ℹ️  Ver QR (poll direto): http://localhost:${PORT}/qr/poll`);
  console.log(`ℹ️  WPP API base:         ${WPP_API_URL}  | sessão: ${WPP_SESSION}`);
});

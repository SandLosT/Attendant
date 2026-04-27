import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import webhookRouter from './http/routes/webhookRouter.js';
import imageUploadRouter from './routes/imageUploadRouter.js';
import ownerRouter from './routes/ownerRouter.js';
import ownerAgendaRouter from './routes/ownerAgendaRouter.js';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const OWNER_APP_ORIGIN = process.env.OWNER_APP_ORIGIN || '';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pwaDistPath = path.resolve(__dirname, '../pwa-owner/dist');

app.use((req, res, next) => {
  if (!OWNER_APP_ORIGIN) return next();
  if (req.headers.origin === OWNER_APP_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', OWNER_APP_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

app.get('/health', (_, res) => res.json({ ok: true }));
app.use('/webhook', webhookRouter);
app.use('/upload', imageUploadRouter);
app.use('/owner/agenda', ownerAgendaRouter);
app.use('/owner', ownerRouter);

if (fs.existsSync(pwaDistPath)) {
  app.use('/owner/pwa', express.static(pwaDistPath));
  app.get(['/owner/pwa', '/owner/pwa/*'], (_, res) => {
    res.sendFile(path.join(pwaDistPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`✅ Attendant API rodando na porta ${PORT}`);
});

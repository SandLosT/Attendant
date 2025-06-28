import express from 'express';
import dotenv from 'dotenv';
import { sendMessageController } from './sendMessageController.js';

dotenv.config();
const app = express();
const port = process.env.PORT || 3001;

// Permite JSON grandes (ex: base64)
app.use(express.json({ limit: '10mb' }));

// Rota de webhook do WPPConnect que delega ao controller
app.post('/webhook', sendMessageController);

app.listen(port, () => {
  console.log(`✅ Servidor de atendimento rodando na porta ${port}`);
});

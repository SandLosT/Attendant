import express from 'express';
import * as dotenv from 'dotenv';
import { processarMensagem } from './usecases/processarMensagem.js';
import { enviarMensagem } from './services/wppconnectService.js';
import imageUploadRouter from './routes/imageUploadRouter.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '10mb' }));
app.use('/upload', imageUploadRouter);
// Rota de teste
app.get('/', (req, res) => {
  res.send('Servidor de atendimento IA rodando');
});

// Webhook real vindo do WPPConnect
app.post('/webhook', async (req, res) => {
  console.log('📥 Webhook recebido:', JSON.stringify(req.body, null, 2));

  const evento = req.body;

  // Só processa mensagens de texto normais
  if (evento.event === 'onmessage' && evento.type === 'chat') {
    const telefone = evento.from.replace('@c.us', '');
    const mensagem = evento.body;

    if (!telefone || !mensagem) {
      return res.status(400).json({ erro: 'Dados inválidos do webhook' });
    }

    try {
      // Processa com IA e envia resposta
      const resposta = await processarMensagem(telefone, mensagem);
      await enviarMensagem(telefone, resposta);
      return res.sendStatus(200);
    } catch (err) {
      console.error('❌ Erro ao processar mensagem:', err);
      return res.status(500).json({ erro: err.message });
    }
  }

  // Ignora eventos que não sejam mensagens de texto
  res.status(200).json({ info: 'Evento ignorado' });
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});

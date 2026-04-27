import express from 'express';
import multer from 'multer';
import { ConversationOrchestrator } from '../application/orchestration/conversationOrchestrator.js';
import { getMcpClient } from '../integrations/mcp/mcpClient.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const orchestrator = new ConversationOrchestrator({ mcpClient: getMcpClient() });

router.post('/:telefone', upload.single('imagem'), async (req, res) => {
  const { telefone } = req.params;
  if (!telefone || !req.file) return res.status(400).json({ erro: 'telefone e imagem são obrigatórios' });

  const result = await orchestrator.handleIncomingImage({
    phone: telefone,
    base64: req.file.buffer.toString('base64'),
    mimetype: req.file.mimetype,
    filename: req.file.originalname,
  });

  return res.json({ ok: true, result });
});

export default router;

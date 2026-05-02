import express from 'express';
import { normalizeWppEvent } from '../../utils/normalizeWppEvent.js';
import { ConversationOrchestrator } from '../../application/orchestration/conversationOrchestrator.js';
import { downloadMedia } from '../../integrations/messaging/wppMessagingService.js';
import { getMcpClient } from '../../integrations/mcp/mcpClient.js';

const router = express.Router();
const orchestrator = new ConversationOrchestrator({ mcpClient: getMcpClient() });

router.post('/', async (req, res) => {
  const normalized = normalizeWppEvent(req.body);

  try {
    if (normalized.fromMe === true) {
      return res.status(200).json({ ok: true, ignored: 'fromMe' });
    }

    if (normalized.kind === 'text' && normalized.phone && normalized.text) {
      const result = await orchestrator.handleIncomingText({ phone: normalized.phone, text: normalized.text });
      return res.status(200).json({ ok: true, result });
    }

    if (normalized.kind === 'image' && normalized.phone) {
      let base64 = normalized.base64;
      if (!base64 && normalized.messageId) {
        const media = await downloadMedia(normalized.messageId);
        base64 = media.base64;
      }

      if (!base64) return res.status(400).json({ erro: 'Mídia ausente' });

      const result = await orchestrator.handleIncomingImage({
        phone: normalized.phone,
        base64,
        mimetype: normalized.mimetype,
        filename: normalized.filename,
      });
      return res.status(200).json({ ok: true, result });
    }

    return res.status(200).json({ ok: true, ignored: 'unsupported' });
  } catch (error) {
  console.error('webhook error full', {
    name: error?.name,
    message: error?.message,
    code: error?.code,
    status: error?.status,
    stack: error?.stack,
    response: error?.response?.data,
    cause: error?.cause,
    raw: error,
  });

  return res.status(500).json({
    erro: error?.message || error?.code || 'Erro interno sem mensagem',
    detalhes: error?.response?.data || error?.cause || null,
  });
}
});

export default router;

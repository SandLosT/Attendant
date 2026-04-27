import express from 'express';
import { normalizeWppEvent } from '../../utils/normalizeWppEvent.js';
import { createMcpTools } from '../../mcp/tools/registry.js';
import { ConversationOrchestrator } from '../../application/orchestration/conversationOrchestrator.js';
import { downloadMedia } from '../../integrations/messaging/wppMessagingService.js';

const router = express.Router();
const orchestrator = new ConversationOrchestrator({ tools: createMcpTools() });

router.post('/', async (req, res) => {
  const normalized = normalizeWppEvent(req.body);

  try {
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
    console.error('webhook error', error);
    return res.status(500).json({ erro: error.message });
  }
});

export default router;

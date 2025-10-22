import dotenv from 'dotenv';
import { processarMensagem } from '../usecases/processarMensagem.js';
import { enviarMensagem } from '../services/wppconnectService.js';

dotenv.config();
const SESSION = process.env.SESSION;

/**
 * Handler para o webhook do WPPConnect OU para testes via Swagger.
 */
export async function sendMessageController(req, res) {
  const body = req.body;
  console.log('📥 Payload recebido:', JSON.stringify(body, null, 2));

  let phone;
  let message;

  // ——————— Caso A: teste via Swagger — formato:
  // { phone, isGroup, isNewsletter, isLid, message }
  if (body.phone && typeof body.message === 'string') {
    phone   = body.phone;
    message = body.message;
  }
  // ——————— Caso B: webhook real (WPPConnect >= v2.8)
  // Você nos seus logs mostrou:
  // { content, sender: { id: "5561...@c.us", ... }, ... }
  else if (body.content && body.sender?.id) {
    phone   = body.sender.id.replace('@c.us','');
    message = body.content;
  }
  // ——————— Outro formato de webhook (antigo Baileys):
  // { event: 'onmessage', data: { message: { text }, sender: { id } } }
  else if (body.event === 'onmessage' && body.data?.message?.text && body.data.sender?.id) {
    phone   = body.data.sender.id.replace('@c.us','');
    message = body.data.message.text;
  }
  else {
    console.log('⚠️ Evento ignorado ou payload inválido:', body);
    return res.sendStatus(200);
  }

  console.log(`📩 Mensagem recebida de ${phone}: "${message}"`);

  try {
    // 1) Gera resposta com OpenAI
    const resposta = await processarMensagem(phone, message);

    // 2) Envia resposta via WPPConnect
    const result = await enviarMensagem(phone, resposta);

    // 3) Normaliza resultado para sempre ser objeto
    if (typeof result !== 'object' || result === null) {
      return res.json({
        status: 'error',
        message: String(result),
        session: SESSION
      });
    }

    // 4) Adiciona sessão e retorna
    result.session = SESSION;
    return res.json(result);

  } catch (err) {
    console.error('❌ Erro no atendimento:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      status: 'error',
      message: msg,
      session: SESSION
    });
  }
}

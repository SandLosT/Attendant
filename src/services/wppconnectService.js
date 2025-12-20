import 'dotenv/config';
import axios from 'axios';

const API_URL = process.env.WPP_API_URL;
const SESSION = process.env.WPP_SESSION;
const TOKEN = process.env.WPP_TOKEN;

export async function enviarMensagem(phone, message) {
  console.log('🧪 Verificando configurações de envio de mensagem...');
  console.log('✅ API_URL:', API_URL);
  console.log('✅ SESSION:', SESSION);
  console.log('📤 Enviando mensagem para:', phone);
  console.log('📨 Conteúdo:', message);

  try {
    const payload = {
      phone: Array.isArray(phone) ? phone : [phone],  // array de números
      isGroup: false,
      isNewsletter: false,
      isLid: false,
      message,
      options: {},                                 // se precisar de quotedMsg, etc
    };

    const response = await axios.post(
      `${API_URL}/${SESSION}/send-message`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`
        }
      }
    );

    console.log('✅ Mensagem enviada com sucesso:', response.data);
    return response.data;
  } catch (err) {
    console.error('❌ Erro ao enviar mensagem:', err.response?.data || err.message);
    return err.response?.data || err.message;
  }
}

export async function downloadMedia(messageId) {
  if (!messageId) {
    throw new Error('messageId é obrigatório para download de mídia.');
  }

  try {
    const response = await axios.post(
      `${API_URL}/${SESSION}/download-media`,
      { messageId },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`
        }
      }
    );

    const data = response.data?.response || response.data || {};
    const payload = {
      base64: data.base64 || data.fileBase64,
      mimetype: data.mimetype || data.mimeType,
      filename: data.filename || data.fileName,
    };

    if (!payload.base64) {
      throw new Error('Resposta do download-media não contém base64.');
    }

    return payload;
  } catch (err) {
    const reason = err.response?.data || err.message;
    console.error('❌ Erro ao baixar mídia:', reason);
    throw new Error(typeof reason === 'string' ? reason : JSON.stringify(reason));
  }
}

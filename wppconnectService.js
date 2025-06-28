import axios from 'axios';

const API_URL = 'http://localhost:21465/api';
const SESSION = 'teste';
const TOKEN = '$2b$10$ekoeQtBoEQK6u4986EK0zOWqgbQiV_J2qKWf88M_YuKvLmw0OFoR6';

export async function enviarMensagem(phone, message) {
  console.log('🧪 Verificando configurações de envio de mensagem...');
  console.log('✅ API_URL:', API_URL);
  console.log('✅ SESSION:', SESSION);
  console.log('✅ TOKEN parece válido:', TOKEN.startsWith('$2b$'));
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

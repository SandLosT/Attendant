import axios from 'axios';

const {
  WPP_API_URL = 'http://localhost:21465/api',
  WPP_SESSION = 'teste',
  WPP_TOKEN = '',
  WPP_SESSION_TOKEN,
  WPP_WEBHOOK = 'http://localhost:3001/webhook',
  WPP_WAIT_FOR_QR_CODE = 'false',
  WPP_PROXY_HOST,
  WPP_PROXY_PORT,
  WPP_PROXY_PROTOCOL,
  WPP_PROXY_USERNAME,
  WPP_PROXY_PASSWORD,
} = process.env;

const waitForQrCode = String(WPP_WAIT_FOR_QR_CODE).toLowerCase() === 'true';

const proxyConfig = WPP_PROXY_HOST
  ? {
      host: WPP_PROXY_HOST,
      ...(WPP_PROXY_PORT ? { port: Number(WPP_PROXY_PORT) } : {}),
      ...(WPP_PROXY_PROTOCOL ? { protocol: WPP_PROXY_PROTOCOL } : {}),
      ...(WPP_PROXY_USERNAME ? { username: WPP_PROXY_USERNAME } : {}),
      ...(WPP_PROXY_PASSWORD ? { password: WPP_PROXY_PASSWORD } : {}),
    }
  : undefined;

let sessionInitialized = false;
let sessionInitializingPromise = null;

async function iniciarSessaoSeNecessario() {
  if (sessionInitialized) {
    return;
  }

  if (sessionInitializingPromise) {
    return sessionInitializingPromise;
  }

  console.log('🚀 Garantindo inicialização da sessão no WPPConnect...');
  console.log('✅ API base utilizada:', WPP_API_URL);
  console.log('✅ Sessão alvo:', WPP_SESSION);
  console.log('✅ Webhook configurado:', WPP_WEBHOOK);
  console.log('✅ Esperar QR Code?:', waitForQrCode);
  if (proxyConfig) {
    console.log('✅ Proxy configurado:', JSON.stringify(proxyConfig));
  }

  const payload = {
    webhook: WPP_WEBHOOK,
    waitForQrCode,
    token: WPP_SESSION_TOKEN ?? WPP_TOKEN,
    ...(proxyConfig ? { proxy: proxyConfig } : {}),
  };

  sessionInitializingPromise = axios
    .post(`${WPP_API_URL}/${WPP_SESSION}/start-session`, payload, {
      headers: {
        Authorization: `Bearer ${WPP_TOKEN}`,
      },
    })
    .then((response) => {
      sessionInitialized = true;
      console.log('✅ Sessão iniciada ou já existente:', response.data);
      return response.data;
    })
    .catch((err) => {
      sessionInitialized = false;
      const errorData = err.response?.data || err.message;
      console.error('❌ Falha ao iniciar sessão no WPPConnect:', errorData);
      throw errorData;
    })
    .finally(() => {
      sessionInitializingPromise = null;
    });

  return sessionInitializingPromise;
}

export async function enviarMensagem(phone, message) {
  console.log('🧪 Preparando envio de mensagem...');
  console.log('📍 API URL:', WPP_API_URL);
  console.log('📍 Sessão:', WPP_SESSION);
  console.log('📍 Token configurado:', Boolean(WPP_TOKEN));
  console.log('📤 Destinatário:', phone);
  console.log('💬 Conteúdo:', message);

  await iniciarSessaoSeNecessario();

  try {
    const payload = {
      phone: Array.isArray(phone) ? phone : [phone],
      isGroup: false,
      isNewsletter: false,
      isLid: false,
      message,
      options: {},
    };

    const response = await axios.post(
      `${WPP_API_URL}/${WPP_SESSION}/send-message`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${WPP_TOKEN}`,
        },
      }
    );

    console.log('✅ Mensagem enviada com sucesso:', response.data);
    return response.data;
  } catch (err) {
    const errorData = err.response?.data || err.message;
    console.error('❌ Erro ao enviar mensagem:', errorData);
    return errorData;
  }
}

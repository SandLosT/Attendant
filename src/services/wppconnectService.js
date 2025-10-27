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

function buildAuthHeaders() {
  const headers = {};

  if (WPP_TOKEN) {
    headers.Authorization = `Bearer ${WPP_TOKEN}`;
  }

  if (WPP_SESSION_TOKEN) {
    headers['x-session-token'] = WPP_SESSION_TOKEN;
  }

  return headers;
}

function getBaseStartPayload() {
  return {
    webhook: WPP_WEBHOOK,
    waitForQrCode,
    token: WPP_SESSION_TOKEN ?? WPP_TOKEN,
    ...(proxyConfig ? { proxy: proxyConfig } : {}),
  };
}

function getStartSessionStrategies() {
  const basePayload = getBaseStartPayload();

  return [
    {
      description: 'legacy start-session route',
      url: `${WPP_API_URL}/${WPP_SESSION}/start-session`,
      payload: basePayload,
    },
    {
      description: 'new /sessions/start route',
      url: `${WPP_API_URL}/sessions/start`,
      payload: {
        session: WPP_SESSION,
        ...basePayload,
      },
    },
    {
      description: 'new /sessions/:session/start route',
      url: `${WPP_API_URL}/sessions/${WPP_SESSION}/start`,
      payload: basePayload,
    },
    {
      description: 'new /session/start route',
      url: `${WPP_API_URL}/session/start`,
      payload: {
        session: WPP_SESSION,
        ...basePayload,
      },
    },
    {
      description: 'fallback start route',
      url: `${WPP_API_URL}/${WPP_SESSION}/start`,
      payload: basePayload,
    },
    {
      description: 'fallback start-session root route',
      url: `${WPP_API_URL}/start-session`,
      payload: {
        session: WPP_SESSION,
        ...basePayload,
      },
    },
  ];
}

function getSendMessageStrategies(messagePayload) {
  const basePayload = {
    ...messagePayload,
    session: WPP_SESSION,
  };

  return [
    {
      description: 'legacy send-message route',
      url: `${WPP_API_URL}/${WPP_SESSION}/send-message`,
      payload: messagePayload,
    },
    {
      description: 'new /sessions/send-message route',
      url: `${WPP_API_URL}/sessions/send-message`,
      payload: basePayload,
    },
    {
      description: 'new /session/send-message route',
      url: `${WPP_API_URL}/session/send-message`,
      payload: basePayload,
    },
    {
      description: 'new /sessions/:session/send-message route',
      url: `${WPP_API_URL}/sessions/${WPP_SESSION}/send-message`,
      payload: messagePayload,
    },
    {
      description: 'messages/send route',
      url: `${WPP_API_URL}/messages/send`,
      payload: basePayload,
    },
    {
      description: 'messages/text route',
      url: `${WPP_API_URL}/messages/text`,
      payload: {
        session: WPP_SESSION,
        text: messagePayload.message,
        phone: messagePayload.recipientPhone ?? messagePayload.phone?.[0],
        recipientPhone: messagePayload.recipientPhone ?? messagePayload.phone?.[0],
      },
    },
    {
      description: 'message/text route',
      url: `${WPP_API_URL}/message/text`,
      payload: {
        session: WPP_SESSION,
        text: messagePayload.message,
        phone: messagePayload.recipientPhone ?? messagePayload.phone?.[0],
        recipientPhone: messagePayload.recipientPhone ?? messagePayload.phone?.[0],
      },
    },
  ];
}

async function executarEstrategias(estrategias, acao) {
  const headers = buildAuthHeaders();
  const erros = [];

  for (const { description, url, payload } of estrategias) {
    try {
      console.log(`➡️  Tentando ${acao} via ${description}: ${url}`);
      const response = await axios.post(url, payload, {
        headers,
      });
      return response;
    } catch (err) {
      const errorData = err.response?.data || err.message;
      console.warn(`⚠️  Falha usando ${description}:`, errorData);
      erros.push({ description, error: errorData });
    }
  }

  const errorSummary = erros
    .map((item) => `${item.description}: ${JSON.stringify(item.error)}`)
    .join(' | ');
  throw new Error(`Não foi possível ${acao}. Tentativas: ${errorSummary}`);
}

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

  sessionInitializingPromise = executarEstrategias(
    getStartSessionStrategies(),
    'iniciar sessão'
  )
    .then((response) => {
      sessionInitialized = true;
      console.log('✅ Sessão iniciada ou já existente:', response.data);
      return response.data;
    })
    .catch((err) => {
      sessionInitialized = false;
      console.error('❌ Falha ao iniciar sessão no WPPConnect:', err.message || err);
      throw err;
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
    const normalizedPhone = Array.isArray(phone) ? phone : [phone];
    const primaryPhone = normalizedPhone[0];
    const payload = {
      phone: normalizedPhone,
      isGroup: false,
      isNewsletter: false,
      isLid: false,
      message,
      options: {},
      recipientPhone: primaryPhone,
      text: message,
    };

    const response = await executarEstrategias(
      getSendMessageStrategies(payload),
      'enviar mensagem'
    );

    console.log('✅ Mensagem enviada com sucesso:', response.data);
    return response.data;
  } catch (err) {
    const errorData = err.response?.data || err.message;
    console.error('❌ Erro ao enviar mensagem:', errorData);
    return errorData;
  }
}

function sanitizePhone(rawPhone) {
  if (!rawPhone) return '';
  const stripped = rawPhone.replace(/@c\.us/g, '');
  return stripped.replace(/\D/g, '');
}

function extractFromCandidates(candidates = []) {
  for (const candidate of candidates) {
    if (candidate) {
      const sanitized = sanitizePhone(candidate);
      if (sanitized) return sanitized;
    }
  }
  return '';
}

function extractBoolean(candidates = []) {
  for (const candidate of candidates) {
    if (typeof candidate === 'boolean') {
      return candidate;
    }
  }
  return undefined;
}

function extractMessageId(candidates = []) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
    if (candidate && typeof candidate === 'object') {
      const serialized = candidate._serialized;
      if (typeof serialized === 'string' && serialized.trim()) {
        return serialized;
      }
    }
  }
  return undefined;
}

export function normalizeWppEvent(body) {
  const eventData = body?.data || body || {};
  const payload = body?.payload || {};
  const event = body?.event ?? body?.data?.event ?? payload?.event;
  const fromMe = extractBoolean([
    eventData.fromMe,
    payload.fromMe,
    eventData?.id?.fromMe,
    eventData?.key?.fromMe,
    eventData?.msg?.key?.fromMe,
  ]);
  const phone = extractFromCandidates([
    eventData.from,
    eventData.sender?.id,
    eventData.author,
    eventData.chatId,
    eventData?.key?.remoteJid,
  ]);

  const messageId = extractMessageId([
    body?.messageId,
    eventData.messageId,
    eventData?.id?._serialized,
    payload?.id?._serialized,
    eventData.id,
    payload.id,
  ]);
  const mimetype = eventData.mimetype || eventData.mimeType;
  const filename = eventData.filename || eventData.fileName;
  const hasImageType =
    eventData.type === 'image' ||
    eventData.isMedia === true ||
    (typeof mimetype === 'string' && mimetype.startsWith('image'));

  const base64 = eventData.base64 || eventData.fileBase64;
  const text = eventData.body || eventData.text || eventData.message?.conversation;

  if (hasImageType) {
    return {
      event,
      phone,
      kind: 'image',
      text,
      messageId,
      fromMe,
      mimetype,
      base64,
      filename,
    };
  }

  if (typeof text === 'string' && text.trim()) {
    return {
      event,
      phone,
      kind: 'text',
      text: text.trim(),
      messageId,
      fromMe,
    };
  }

  return {
    event,
    phone,
    kind: 'other',
    messageId,
    fromMe,
  };
}

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

function normalizeBoolean(candidate) {
  if (typeof candidate === 'boolean') {
    return candidate;
  }
  if (typeof candidate === 'string') {
    const normalized = candidate.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return false;
    }
  }
  if (typeof candidate === 'number') {
    if (candidate === 1) {
      return true;
    }
    if (candidate === 0) {
      return false;
    }
  }
  return undefined;
}

function extractBoolean(candidates = []) {
  for (const candidate of candidates) {
    const normalized = normalizeBoolean(candidate);
    if (typeof normalized === 'boolean') {
      return normalized;
    }
  }
  return undefined;
}

function extractMessageId(candidates = []) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    if (candidate && typeof candidate === 'object') {
      const serialized = candidate._serialized;
      if (typeof serialized === 'string' && serialized.trim()) {
        return serialized.trim();
      }
      const id = candidate.id;
      if (typeof id === 'string' && id.trim()) {
        return id.trim();
      }
    }
  }
  return undefined;
}

function normalizeEventName(value) {
  if (!value) {
    return '';
  }
  return value.toString().trim().toLowerCase();
}

function normalizeType(value) {
  if (!value) {
    return '';
  }
  return value.toString().trim().toLowerCase();
}

export function normalizeWppEvent(body) {
  const eventData = body?.data || body || {};
  const payload = body?.payload || {};
  const eventRaw = body?.event ?? body?.data?.event ?? payload?.event;
  const event = normalizeEventName(eventRaw);
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
    eventData?.key?.id,
    eventData?.msg?.key?.id,
    eventData.id,
    payload.id,
  ]);
  const mimetype = eventData.mimetype || eventData.mimeType;
  const filename = eventData.filename || eventData.fileName;
  const type = normalizeType(eventData.type || eventData.messageType || payload?.type);
  const hasImageType =
    type === 'image' ||
    eventData.isMedia === true ||
    (typeof mimetype === 'string' && mimetype.startsWith('image'));

  const base64 = eventData.base64 || eventData.fileBase64;
  const text = eventData.body || eventData.text || eventData.message?.conversation;

  if (hasImageType) {
    return {
      event,
      type,
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
      type,
      phone,
      kind: 'text',
      text: text.trim(),
      messageId,
      fromMe,
    };
  }

  return {
    event,
    type,
    phone,
    kind: 'other',
    messageId,
    fromMe,
  };
}

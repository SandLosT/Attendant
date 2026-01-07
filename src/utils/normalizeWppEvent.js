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

export function normalizeWppEvent(body) {
  const eventData = body?.data || body || {};
  const rawFromMe =
    eventData.fromMe ??
    eventData?.key?.fromMe ??
    body?.fromMe ??
    body?.data?.fromMe ??
    body?.data?.key?.fromMe;
  const fromMe = typeof rawFromMe === 'boolean' ? rawFromMe : undefined;
  const phone = extractFromCandidates([
    eventData.from,
    eventData.sender?.id,
    eventData.author,
    eventData.chatId,
    eventData?.key?.remoteJid,
  ]);

  const messageId =
    eventData.id ||
    eventData.messageId ||
    body?.messageId ||
    body?.id ||
    body?.data?.id ||
    body?.data?.messageId ||
    eventData?.key?.id;
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
      phone,
      kind: 'text',
      text: text.trim(),
      messageId,
      fromMe,
    };
  }

  return {
    phone,
    kind: 'other',
    messageId,
    fromMe,
  };
}

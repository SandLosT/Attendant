import { findAttendanceByCustomerId } from '../../../src/repositories/attendanceRepository.js';
import { listRecentMessages } from '../../../src/repositories/messageRepository.js';
import { findQuoteById } from '../../../src/repositories/quoteRepository.js';
import { findSlot } from '../../../src/repositories/scheduleRepository.js';
import { findCustomerByPhone } from '../../../src/repositories/customerRepository.js';

export function listResources() {
  return [];
}

export function listResourceTemplates() {
  return [
    {
      uriTemplate: 'attendance://customer/{customerId}/summary',
      name: 'attendance_summary',
      description: 'Resumo de atendimento por customerId.',
    },
    {
      uriTemplate: 'attendance://customer/{customerId}/history/recent?limit={1..50}',
      name: 'attendance_recent_history',
      description: 'Histórico recente de mensagens por customerId.',
    },
    {
      uriTemplate: 'quote://{quoteId}',
      name: 'quote_detail',
      description: 'Detalhes de um orçamento por quoteId.',
    },
    {
      uriTemplate: 'customer://phone/{phone}/profile',
      name: 'customer_profile',
      description: 'Perfil do cliente por telefone normalizado.',
    },
    {
      uriTemplate: 'schedule://availability?date=YYYY-MM-DD&period=MANHA|TARDE',
      name: 'schedule_availability',
      description: 'Disponibilidade de agenda por data e período.',
    },
  ];
}

function parseId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${label} inválido`);
  return id;
}

export async function readResource(uri) {
  if (uri.startsWith('attendance://customer/') && uri.endsWith('/summary')) {
    const idRaw = uri.replace('attendance://customer/', '').replace('/summary', '');
    const customerId = parseId(idRaw, 'customerId');
    return { uri, content: (await findAttendanceByCustomerId(customerId)) || null };
  }

  if (uri.startsWith('attendance://customer/') && uri.includes('/history/recent')) {
    const [path, rawQuery] = uri.split('?');
    const idRaw = path.replace('attendance://customer/', '').replace('/history/recent', '');
    const customerId = parseId(idRaw, 'customerId');
    const params = new URLSearchParams(rawQuery || '');
    const requestedLimit = Number(params.get('limit') || 12);
    const limit = Math.max(1, Math.min(50, Number.isNaN(requestedLimit) ? 12 : requestedLimit));
    return { uri, content: await listRecentMessages(customerId, limit) };
  }

  if (uri.startsWith('quote://')) {
    const quoteId = parseId(uri.replace('quote://', ''), 'quoteId');
    return { uri, content: (await findQuoteById(quoteId)) || null };
  }

  if (uri.startsWith('customer://phone/') && uri.endsWith('/profile')) {
    const phone = uri.replace('customer://phone/', '').replace('/profile', '').trim();
    if (!phone) throw new Error('phone inválido');
    return { uri, content: (await findCustomerByPhone(phone)) || null };
  }

  if (uri.startsWith('schedule://availability?')) {
    const query = new URLSearchParams(uri.split('?')[1]);
    const date = (query.get('date') || '').trim();
    const period = (query.get('period') || '').trim().toUpperCase();
    if (!date || !period) throw new Error('date e period são obrigatórios');
    if (!['MANHA', 'TARDE'].includes(period)) throw new Error('period inválido');
    const slot = await findSlot(date, period);
    return { uri, content: { date, period, available: slot ? !slot.bloqueado && slot.reservados < slot.capacidade : true, slot } };
  }

  throw new Error(`Resource URI não suportada: ${uri}`);
}

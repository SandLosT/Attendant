import { findAttendanceByCustomerId } from '../../../src/repositories/attendanceRepository.js';
import { listRecentMessages } from '../../../src/repositories/messageRepository.js';
import { findQuoteById } from '../../../src/repositories/quoteRepository.js';
import { findSlot } from '../../../src/repositories/scheduleRepository.js';
import { findCustomerByPhone } from '../../../src/repositories/customerRepository.js';

export function listResourceTemplates() {
  return [
    { uriTemplate: 'attendance://{id}/summary', name: 'attendance_summary' },
    { uriTemplate: 'attendance://{id}/history/recent', name: 'attendance_recent_history' },
    { uriTemplate: 'quote://{id}', name: 'quote_detail' },
    { uriTemplate: 'customer://{phone}/profile', name: 'customer_profile' },
    { uriTemplate: 'schedule://availability?date=YYYY-MM-DD&period=MANHA|TARDE', name: 'schedule_availability' },
  ];
}

export async function readResource(uri: string) {
  if (uri.startsWith('attendance://') && uri.endsWith('/summary')) {
    const id = Number(uri.replace('attendance://', '').replace('/summary', ''));
    const attendance = await findAttendanceByCustomerId(id);
    return { uri, content: attendance || null };
  }

  if (uri.startsWith('attendance://') && uri.endsWith('/history/recent')) {
    const id = Number(uri.replace('attendance://', '').replace('/history/recent', ''));
    const messages = await listRecentMessages(id, 12);
    return { uri, content: messages };
  }

  if (uri.startsWith('quote://')) {
    const id = Number(uri.replace('quote://', ''));
    const quote = await findQuoteById(id);
    return { uri, content: quote || null };
  }

  if (uri.startsWith('customer://') && uri.endsWith('/profile')) {
    const phone = uri.replace('customer://', '').replace('/profile', '');
    const customer = await findCustomerByPhone(phone);
    return { uri, content: customer || null };
  }

  if (uri.startsWith('schedule://availability?')) {
    const query = new URLSearchParams(uri.split('?')[1]);
    const date = query.get('date');
    const period = query.get('period');
    const slot = await findSlot(date, period);
    return {
      uri,
      content: {
        date,
        period,
        available: slot ? !slot.bloqueado && slot.reservados < slot.capacidade : true,
        slot,
      },
    };
  }

  throw new Error(`Resource não encontrado: ${uri}`);
}

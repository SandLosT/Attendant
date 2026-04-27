import { QUOTE_STATUS } from '../constants/attendance.js';

function normalizedStatusFaz(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'faz';
}

export function inferQuoteFromImageAnalysis(analysis) {
  const approved = analysis?.threshold_passed === true && normalizedStatusFaz(analysis?.best_match_status_faz);
  const estimatedValue = approved
    ? Number(analysis?.suggested_value ?? analysis?.best_match_valor_ref ?? 0) || null
    : null;

  return {
    status: approved ? QUOTE_STATUS.ANALYZED : QUOTE_STATUS.NEEDS_HUMAN,
    estimatedValue,
    matchScore: analysis?.best_match_score ?? null,
    refImageId: Number(analysis?.ref_image_id ?? analysis?.best_match_id ?? 0) || null,
    requiresHuman: !approved,
  };
}

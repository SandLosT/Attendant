export function normalizePeriod(periodo) {
  if (!periodo) return null;
  const text = String(periodo).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (text.includes('manha')) return 'MANHA';
  if (text.includes('tarde')) return 'TARDE';
  return null;
}

export function parseDateAndPeriod(texto = '') {
  const periodo = normalizePeriod(texto);
  const iso = texto.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return { data: `${iso[1]}-${iso[2]}-${iso[3]}`, periodo };

  const br = texto.match(/\b(\d{2})\/(\d{2})(?:\/(\d{4}))?\b/);
  if (!br) return { data: null, periodo };
  const year = br[3] ?? String(new Date().getFullYear());
  return { data: `${year}-${br[2]}-${br[1]}`, periodo };
}

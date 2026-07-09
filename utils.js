/* ============================================================
   utils.js — formatting helpers (Arabic month names, currency,
   dates). Kept separate from data.js so it can change freely
   without touching calculation logic.
   ============================================================ */

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'ماي', 'يونيو',
  'يوليوز', 'غشت', 'شتنبر', 'أكتوبر', 'نونبر', 'دجنبر'
];

function formatMonthKey(key) {
  if (!key) return '—';
  const [y, m] = key.split('-').map(Number);
  return `${ARABIC_MONTHS[m - 1]} ${y}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${ARABIC_MONTHS[m - 1]} ${y}`;
}

function formatMoney(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function statusLabel(status) {
  return { good: 'في الوضعية', warn: 'متأخر قليلا', bad: 'متأخر بشكل كبير' }[status] || status;
}

function statusColorVar(status) {
  return { good: 'var(--status-good)', warn: 'var(--status-warn)', bad: 'var(--status-bad)' }[status] || 'var(--muted)';
}

window.UTIL = {
  ARABIC_MONTHS,
  formatMonthKey,
  formatDate,
  formatMoney,
  todayISO,
  statusLabel,
  statusColorVar
};

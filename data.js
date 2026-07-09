/* ============================================================
   data.js — Data model, persistence, and calculation engine
   ============================================================
   All money math and date math for the building funds ledger
   lives here. No DOM code in this file — keeps it testable.
   ============================================================ */

const STORAGE_KEY = 'imm30_building_data_v1';
const MONTHLY_FEE_DEFAULT = 50;

const EXPENSE_CATEGORIES = [
  'السيدة المنظفة',
  'فاتورة الماء والكهرباء',
  'لوازم التنظيف',
  'إصلاحات',
  'الأنترفون',
  'تنظيف الحديقة',
  'أخرى'
];

/* ---------- month-index helpers ----------
   We represent a month as "YYYY-MM" (string) and as an integer
   index = year*12 + month (1-12) for arithmetic.  */

function monthKeyToIndex(key) {
  const [y, m] = key.split('-').map(Number);
  return y * 12 + (m - 1);
}

function indexToMonthKey(idx) {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function todayMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(key, n) {
  return indexToMonthKey(monthKeyToIndex(key) + n);
}

function monthsBetween(fromKey, toKey) {
  return monthKeyToIndex(toKey) - monthKeyToIndex(fromKey);
}

/* ---------- id generator ---------- */
function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ---------- seed data ----------
   Migrated from the family's real statement covering
   Jan 2026 - Jun 2026 (report reference month = 2026-06).
   `lastCoveredMonth` = the month up to which dues are settled
   ("receipt valid until"). Debt is always derived from this,
   never stored directly. */

const SEED_REFERENCE_MONTH = '2026-06';

const SEED_APARTMENTS = [
  { number: 1, name: 'حسن بلقايد', lastCoveredMonth: '2024-05', periodPayment: 500 },
  { number: 2, name: 'امبارك غندي', lastCoveredMonth: '2021-02', periodPayment: 0 },
  { number: 3, name: 'علي النهيري', lastCoveredMonth: '2025-12', periodPayment: 0 },
  { number: 4, name: 'الحاج لعمراتي', lastCoveredMonth: '2023-08', periodPayment: 0 },
  { number: 5, name: 'عبد الكبير ساتور', lastCoveredMonth: '2025-12', periodPayment: 200 },
  { number: 6, name: 'محمد العباسي', lastCoveredMonth: '2025-08', periodPayment: 0 },
  { number: 7, name: 'محمد القرشي', lastCoveredMonth: '2022-07', periodPayment: 0 },
  { number: 8, name: 'أسامة', lastCoveredMonth: '2026-04', periodPayment: 1100 },
  { number: 9, name: 'الزاهية المطلب', lastCoveredMonth: '2025-08', periodPayment: 200 },
  { number: 10, name: 'فاتحة الحراك', lastCoveredMonth: '2026-05', periodPayment: 300 },
  { number: 11, name: 'الحسن منتصر', lastCoveredMonth: '2025-12', periodPayment: 0 },
  { number: 12, name: 'احمد لغزاوي', lastCoveredMonth: '2026-04', periodPayment: 200 },
  { number: 13, name: 'لطيفة الزروالي', lastCoveredMonth: '2023-07', periodPayment: 0 },
  { number: 14, name: 'عبد الواحد بيكورن', lastCoveredMonth: '2026-06', periodPayment: 300 },
  { number: 15, name: 'احمد حميوي', lastCoveredMonth: '2025-01', periodPayment: 200 },
  { number: 16, name: 'خالد اجعوب', lastCoveredMonth: '2026-04', periodPayment: 800 }
];

const SEED_EXPENSES = [
  { category: 'السيدة المنظفة', amount: 1920, date: '2026-06-01', notes: 'مصاريف الدورة يناير - يونيو 2026' },
  { category: 'فاتورة الماء والكهرباء', amount: 300, date: '2026-06-01', notes: 'مصاريف الدورة يناير - يونيو 2026' },
  { category: 'لوازم التنظيف', amount: 245, date: '2026-06-01', notes: 'مصاريف الدورة يناير - يونيو 2026' },
  { category: 'إصلاحات', amount: 1700, date: '2026-06-01', notes: 'إصلاح الأنترفون' },
  { category: 'تنظيف الحديقة', amount: 700, date: '2026-06-01', notes: 'مصاريف الدورة يناير - يونيو 2026' }
];

/* Opening balance chosen so that:
   opening + totalSeedPayments - totalSeedExpenses = 7424 (the
   known balance as of the June 2026 statement). */
const SEED_TOTAL_PAYMENTS = SEED_APARTMENTS.reduce((s, a) => s + a.periodPayment, 0); // 3800
const SEED_TOTAL_EXPENSES = SEED_EXPENSES.reduce((s, e) => s + e.amount, 0); // 4865
const SEED_KNOWN_BALANCE = 7424;
const SEED_OPENING_BALANCE = SEED_KNOWN_BALANCE - SEED_TOTAL_PAYMENTS + SEED_TOTAL_EXPENSES;

function buildSeedData() {
  const apartments = SEED_APARTMENTS.map(a => {
    const monthsFromPayment = a.periodPayment > 0 ? Math.floor(a.periodPayment / MONTHLY_FEE_DEFAULT) : 0;
    const apt = {
      id: makeId('apt'),
      number: a.number,
      name: a.name,
      // The month the apartment was covered through BEFORE the seeded
      // payment below is replayed on top of it (kept in sync so future
      // payment deletions still replay to the correct state).
      openingCoveredMonth: addMonths(a.lastCoveredMonth, -monthsFromPayment),
      lastCoveredMonth: a.lastCoveredMonth,
      creditRemainder: 0,
      payments: []
    };
    if (a.periodPayment > 0) {
      apt.payments.push({
        id: makeId('pay'),
        date: `${SEED_REFERENCE_MONTH}-30`,
        amount: a.periodPayment,
        monthsCovered: monthsFromPayment,
        note: 'ترحيل من كشف يناير - يونيو 2026'
      });
    }
    return apt;
  });

  const expenses = SEED_EXPENSES.map(e => ({
    id: makeId('exp'),
    category: e.category,
    amount: e.amount,
    date: e.date,
    notes: e.notes
  }));

  return {
    meta: {
      buildingName: 'العمارة 30',
      monthlyFee: MONTHLY_FEE_DEFAULT,
      currency: 'DH',
      openingBalance: SEED_OPENING_BALANCE,
      openingBalanceDate: '2026-01-01',
      createdAt: new Date().toISOString(),
      setupComplete: true
    },
    apartments,
    expenses
  };
}

/* ---------- persistence ---------- */

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse stored data', e);
    return null;
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function ensureData() {
  let data = loadData();
  if (!data) {
    data = buildSeedData();
    saveData(data);
  }
  return data;
}

function resetToBlank(buildingName, apartmentCount) {
  const now = todayMonthKey();
  const apartments = [];
  for (let i = 1; i <= apartmentCount; i++) {
    apartments.push({
      id: makeId('apt'),
      number: i,
      name: `الشقة ${i}`,
      openingCoveredMonth: now,
      lastCoveredMonth: now,
      creditRemainder: 0,
      payments: []
    });
  }
  const data = {
    meta: {
      buildingName: buildingName || 'العمارة',
      monthlyFee: MONTHLY_FEE_DEFAULT,
      currency: 'DH',
      openingBalance: 0,
      openingBalanceDate: `${now}-01`,
      createdAt: new Date().toISOString(),
      setupComplete: true
    },
    apartments,
    expenses: []
  };
  saveData(data);
  return data;
}

/* ---------- calculation engine ---------- */

/** Debt in months for an apartment, as of a reference month (default: today). */
function debtMonths(apt, refMonthKey, data) {
  const ref = refMonthKey || todayMonthKey();
  const months = monthsBetween(apt.lastCoveredMonth, ref);
  return Math.max(0, months);
}

function debtAmount(apt, refMonthKey, data) {
  const fee = data.meta.monthlyFee || MONTHLY_FEE_DEFAULT;
  return debtMonths(apt, refMonthKey, data) * fee;
}

/** Status: 'good' | 'warn' | 'bad' based on months owed. */
function apartmentStatus(apt, refMonthKey, data) {
  const m = debtMonths(apt, refMonthKey, data);
  if (m === 0) return 'good';
  if (m <= 2) return 'warn';
  return 'bad';
}

function totalPaidByApartment(apt) {
  return apt.payments.reduce((s, p) => s + p.amount, 0);
}

/** Recomputes an apartment's lastCoveredMonth and creditRemainder by
 *  replaying every payment, in date order, starting from its
 *  openingCoveredMonth (the state before any recorded payment). This is
 *  what makes deleting an arbitrary past payment safe: we don't patch
 *  lastCoveredMonth incrementally, we rebuild it from scratch every time
 *  the payment list changes. */
function recomputeApartment(apt, data) {
  const fee = data.meta.monthlyFee || MONTHLY_FEE_DEFAULT;
  if (!apt.openingCoveredMonth) apt.openingCoveredMonth = apt.lastCoveredMonth;

  const ordered = apt.payments.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let covered = apt.openingCoveredMonth;
  let credit = 0;
  ordered.forEach(p => {
    const totalAvailable = credit + p.amount;
    const monthsCovered = Math.floor(totalAvailable / fee);
    credit = round2(totalAvailable - monthsCovered * fee);
    covered = addMonths(covered, monthsCovered);
    p.monthsCovered = monthsCovered;
  });

  apt.lastCoveredMonth = covered;
  apt.creditRemainder = credit;
}

/** Apply a payment: pays off debt first (by advancing lastCoveredMonth),
 *  any remainder that doesn't make a full month is kept as credit and
 *  combined with the next payment. Returns a summary of what happened. */
function recordPayment(data, apartmentId, amount, date, note) {
  const apt = data.apartments.find(a => a.id === apartmentId);
  if (!apt) throw new Error('Apartment not found');

  const beforeMonth = apt.lastCoveredMonth;
  const payment = {
    id: makeId('pay'),
    date: date || new Date().toISOString().slice(0, 10),
    amount: round2(amount),
    monthsCovered: 0,
    note: note || ''
  };
  apt.payments.push(payment);
  recomputeApartment(apt, data);

  return {
    payment,
    monthsCovered: payment.monthsCovered,
    fromMonth: beforeMonth,
    toMonth: apt.lastCoveredMonth,
    remainderCredit: apt.creditRemainder
  };
}

/** Removes a payment and rebuilds the apartment's debt state from
 *  scratch, so deleting an old payment correctly ripples forward
 *  through every payment recorded after it. */
function deletePayment(data, apartmentId, paymentId) {
  const apt = data.apartments.find(a => a.id === apartmentId);
  if (!apt) throw new Error('Apartment not found');
  apt.payments = apt.payments.filter(p => p.id !== paymentId);
  recomputeApartment(apt, data);
  return apt;
}

/** Manually set an apartment's "receipt valid until" month from Settings.
 *  Shifts openingCoveredMonth by the same delta so that replaying the
 *  existing payment history still lands on this corrected value — the
 *  override survives future payment deletions instead of being lost. */
function setLastCoveredMonth(data, apartmentId, newMonthKey) {
  const apt = data.apartments.find(a => a.id === apartmentId);
  if (!apt) throw new Error('Apartment not found');
  if (!apt.openingCoveredMonth) apt.openingCoveredMonth = apt.lastCoveredMonth;
  const delta = monthsBetween(apt.lastCoveredMonth, newMonthKey);
  apt.openingCoveredMonth = addMonths(apt.openingCoveredMonth, delta);
  recomputeApartment(apt, data);
}

function addExpense(data, category, amount, date, notes) {
  const exp = {
    id: makeId('exp'),
    category,
    amount: round2(amount),
    date: date || new Date().toISOString().slice(0, 10),
    notes: notes || ''
  };
  data.expenses.push(exp);
  return exp;
}

function totalExpenses(data, fromDate, toDate) {
  return data.expenses
    .filter(e => inRange(e.date, fromDate, toDate))
    .reduce((s, e) => s + e.amount, 0);
}

function totalPayments(data, fromDate, toDate) {
  let sum = 0;
  data.apartments.forEach(a => {
    a.payments.forEach(p => {
      if (inRange(p.date, fromDate, toDate)) sum += p.amount;
    });
  });
  return sum;
}

function inRange(dateStr, fromDate, toDate) {
  if (!fromDate && !toDate) return true;
  const d = dateStr;
  if (fromDate && d < fromDate) return false;
  if (toDate && d > toDate) return false;
  return true;
}

/** Current overall balance = opening balance + all payments ever - all expenses ever. */
function currentBalance(data) {
  const allPayments = data.apartments.reduce((s, a) => s + totalPaidByApartment(a), 0);
  const allExpenses = data.expenses.reduce((s, e) => s + e.amount, 0);
  return round2(data.meta.openingBalance + allPayments - allExpenses);
}

/** Balance at the end of a given period (for six-month reports), assuming
 *  chronological entry of payments/expenses. */
function balanceAsOf(data, throughDate) {
  const paymentsSum = data.apartments.reduce((sum, a) => {
    return sum + a.payments.filter(p => p.date <= throughDate).reduce((s, p) => s + p.amount, 0);
  }, 0);
  const expensesSum = data.expenses.filter(e => e.date <= throughDate).reduce((s, e) => s + e.amount, 0);
  return round2(data.meta.openingBalance + paymentsSum - expensesSum);
}

function totalOutstandingDebt(data, refMonthKey) {
  return data.apartments.reduce((s, a) => s + debtAmount(a, refMonthKey, data), 0);
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/* ---------- six-month period helpers ---------- */

/** Given a date (default today), returns the "natural" half-year period
 *  it falls in: {startKey, endKey, label} using Jan-Jun / Jul-Dec. */
function currentHalfYearPeriod(refDate) {
  const d = refDate ? new Date(refDate) : new Date();
  const y = d.getFullYear();
  const half = d.getMonth() < 6 ? 1 : 2;
  return halfYearPeriod(y, half);
}

function halfYearPeriod(year, half) {
  if (half === 1) {
    return { startKey: `${year}-01`, endKey: `${year}-06`, startDate: `${year}-01-01`, endDate: `${year}-06-30` };
  }
  return { startKey: `${year}-07`, endKey: `${year}-12`, startDate: `${year}-07-01`, endDate: `${year}-12-31` };
}

/* Export a global namespace (no bundler/module system, keep it simple for
   GitHub Pages: plain <script> tags). */
window.DB = {
  STORAGE_KEY,
  MONTHLY_FEE_DEFAULT,
  EXPENSE_CATEGORIES,
  monthKeyToIndex,
  indexToMonthKey,
  todayMonthKey,
  addMonths,
  monthsBetween,
  makeId,
  loadData,
  saveData,
  ensureData,
  resetToBlank,
  buildSeedData,
  debtMonths,
  debtAmount,
  apartmentStatus,
  totalPaidByApartment,
  recomputeApartment,
  recordPayment,
  deletePayment,
  setLastCoveredMonth,
  addExpense,
  totalExpenses,
  totalPayments,
  currentBalance,
  balanceAsOf,
  totalOutstandingDebt,
  round2,
  currentHalfYearPeriod,
  halfYearPeriod,
  inRange
};

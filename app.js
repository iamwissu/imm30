/* ============================================================
   app.js — views, rendering, and events. Talks to window.DB for
   data/calculations, window.UTIL for formatting, window.PRINT
   for receipt/report generation.
   ============================================================ */

let DATA = null;
let currentView = 'dashboard';
let lastPaymentForReceipt = null; // {aptId, paymentId}

/* ---------------- boot ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  DATA = DB.ensureData();
  wireNav();
  wireModals();
  renderAll();
  showView('dashboard');
});

function persist() {
  DB.saveData(DATA);
}

function renderAll() {
  renderDashboard();
  renderPaymentsView();
  renderExpensesView();
  renderReportsView();
  renderSettingsView();
}

/* ---------------- navigation ---------------- */
function wireNav() {
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.getAttribute('data-nav')));
  });
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
  document.getElementById('sidebarOverlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
  });
}

function showView(name) {
  currentView = name;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('[data-nav]').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-nav') === name);
  });
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('appMain').scrollTop = 0;
  if (name === 'dashboard') renderDashboard();
  if (name === 'payments') renderPaymentsView();
  if (name === 'expenses') renderExpensesView();
  if (name === 'reports') renderReportsView();
  if (name === 'settings') renderSettingsView();
}

/* ================================================================
   DASHBOARD
   ================================================================ */
function renderDashboard() {
  const ref = DB.todayMonthKey();
  const balance = DB.currentBalance(DATA);
  const totalDebt = DB.totalOutstandingDebt(DATA, ref);
  const badCount = DATA.apartments.filter(a => DB.apartmentStatus(a, ref, DATA) !== 'good').length;

  document.getElementById('kpiBalance').textContent = UTIL.formatMoney(balance) + ' ' + DATA.meta.currency;
  document.getElementById('kpiDebt').textContent = UTIL.formatMoney(totalDebt) + ' ' + DATA.meta.currency;
  document.getElementById('kpiLate').textContent = badCount + ' / ' + DATA.apartments.length;
  document.getElementById('dashBuildingName').textContent = DATA.meta.buildingName;

  const grid = document.getElementById('apartmentGrid');
  grid.innerHTML = DATA.apartments
    .slice()
    .sort((a, b) => a.number - b.number)
    .map(apt => {
      const status = DB.apartmentStatus(apt, ref, DATA);
      const debt = DB.debtAmount(apt, ref, DATA);
      return `
        <button class="apt-card status-${status}" data-apt-id="${apt.id}">
          <div class="apt-card-top">
            <span class="apt-number">${apt.number}</span>
            <span class="apt-status-dot"></span>
          </div>
          <div class="apt-name">${escapeAttr(apt.name)}</div>
          <div class="apt-meta">
            <span>${debt > 0 ? UTIL.formatMoney(debt) + ' ' + DATA.meta.currency : 'لا متأخرات'}</span>
          </div>
          <div class="apt-meta-sub">صالح إلى ${UTIL.formatMonthKey(apt.lastCoveredMonth)}</div>
        </button>`;
    }).join('');

  grid.querySelectorAll('.apt-card').forEach(card => {
    card.addEventListener('click', () => openApartmentModal(card.getAttribute('data-apt-id')));
  });
}

/* ================================================================
   APARTMENT DETAIL MODAL
   ================================================================ */
function openApartmentModal(aptId) {
  const apt = DATA.apartments.find(a => a.id === aptId);
  if (!apt) return;
  const ref = DB.todayMonthKey();
  const debt = DB.debtAmount(apt, ref, DATA);
  const status = DB.apartmentStatus(apt, ref, DATA);
  const totalPaid = DB.totalPaidByApartment(apt);

  const body = document.getElementById('aptModalBody');
  body.innerHTML = `
    <div class="modal-head">
      <div>
        <div class="modal-eyebrow">الشقة رقم ${apt.number}</div>
        <h3>${escapeAttr(apt.name)}</h3>
      </div>
      <span class="badge status-${status}">${UTIL.statusLabel(status)}</span>
    </div>
    <div class="modal-stats">
      <div><span>المتأخرات الحالية</span><strong>${UTIL.formatMoney(debt)} ${DATA.meta.currency}</strong></div>
      <div><span>الوصل صالح إلى غاية</span><strong>${UTIL.formatMonthKey(apt.lastCoveredMonth)}</strong></div>
      <div><span>مجموع ما تم أداؤه</span><strong>${UTIL.formatMoney(totalPaid)} ${DATA.meta.currency}</strong></div>
    </div>
    <h4 class="modal-sub">سجل الأداءات</h4>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>التاريخ</th><th>المبلغ</th><th>الأشهر</th><th></th></tr></thead>
        <tbody>
          ${apt.payments.slice().reverse().map(p => `
            <tr>
              <td>${UTIL.formatDate(p.date)}</td>
              <td>${UTIL.formatMoney(p.amount)}</td>
              <td>${p.monthsCovered}</td>
              <td><button class="btn-link" data-print-receipt="${p.id}">طباعة الوصل</button></td>
            </tr>`).join('') || '<tr><td colspan="4" class="empty-cell">لا توجد أداءات مسجلة بعد</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="modalRecordPayment">تسجيل أداء لهذه الشقة</button>
    </div>
  `;

  body.querySelectorAll('[data-print-receipt]').forEach(btn => {
    btn.addEventListener('click', () => {
      const payment = apt.payments.find(p => p.id === btn.getAttribute('data-print-receipt'));
      PRINT.printHTML(PRINT.receiptHTML(DATA, apt, payment));
    });
  });
  document.getElementById('modalRecordPayment').addEventListener('click', () => {
    closeModal('aptModal');
    showView('payments');
    document.getElementById('paySelectApt').value = apt.id;
  });

  openModal('aptModal');
}

/* ================================================================
   PAYMENTS VIEW
   ================================================================ */
function renderPaymentsView() {
  const select = document.getElementById('paySelectApt');
  const ref = DB.todayMonthKey();
  select.innerHTML = DATA.apartments
    .slice()
    .sort((a, b) => a.number - b.number)
    .map(a => {
      const debt = DB.debtAmount(a, ref, DATA);
      return `<option value="${a.id}">شقة ${a.number} — ${escapeAttr(a.name)}${debt ? ' (متأخرات ' + UTIL.formatMoney(debt) + ')' : ''}</option>`;
    }).join('');

  document.getElementById('payDate').value = UTIL.todayISO();
  renderPaymentPreview();
  renderRecentPayments();
}

function renderPaymentPreview() {
  const aptId = document.getElementById('paySelectApt').value;
  const amount = Number(document.getElementById('payAmount').value) || 0;
  const box = document.getElementById('payPreview');
  const apt = DATA.apartments.find(a => a.id === aptId);
  if (!apt || amount <= 0) {
    box.innerHTML = '<p class="hint">أدخل المبلغ لمعاينة أثره على وضعية الشقة</p>';
    return;
  }
  const fee = DATA.meta.monthlyFee;
  const totalAvailable = (apt.creditRemainder || 0) + amount;
  const months = Math.floor(totalAvailable / fee);
  const newLastCovered = DB.addMonths(apt.lastCoveredMonth, months);
  const remainder = totalAvailable - months * fee;
  const debtNow = DB.debtAmount(apt, DB.todayMonthKey(), DATA);

  box.innerHTML = `
    <div class="preview-row"><span>المتأخرات الحالية</span><strong>${UTIL.formatMoney(debtNow)} ${DATA.meta.currency}</strong></div>
    <div class="preview-row"><span>عدد الأشهر التي سيغطيها هذا المبلغ</span><strong>${months}</strong></div>
    <div class="preview-row"><span>الوصل سيصبح صالحا إلى غاية</span><strong>${UTIL.formatMonthKey(newLastCovered)}</strong></div>
    ${remainder > 0 ? `<div class="preview-row muted"><span>رصيد متبقٍ يُرحّل للأداء القادم</span><strong>${UTIL.formatMoney(remainder)} ${DATA.meta.currency}</strong></div>` : ''}
  `;
}

function renderRecentPayments() {
  const all = [];
  DATA.apartments.forEach(a => a.payments.forEach(p => all.push({ apt: a, payment: p })));
  all.sort((x, y) => y.payment.date.localeCompare(x.payment.date));
  const tbody = document.getElementById('recentPaymentsBody');
  tbody.innerHTML = all.slice(0, 12).map(({ apt, payment }) => `
    <tr>
      <td>${UTIL.formatDate(payment.date)}</td>
      <td>شقة ${apt.number} — ${escapeAttr(apt.name)}</td>
      <td>${UTIL.formatMoney(payment.amount)}</td>
      <td>${payment.monthsCovered}</td>
      <td><button class="btn-link" data-print-recent="${apt.id}|${payment.id}">طباعة الوصل</button></td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="empty-cell">لم يتم تسجيل أي أداء بعد</td></tr>`;

  tbody.querySelectorAll('[data-print-recent]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [aptId, payId] = btn.getAttribute('data-print-recent').split('|');
      const apt = DATA.apartments.find(a => a.id === aptId);
      const payment = apt.payments.find(p => p.id === payId);
      PRINT.printHTML(PRINT.receiptHTML(DATA, apt, payment));
    });
  });
}

function wirePaymentsForm() {
  document.getElementById('paySelectApt').addEventListener('change', renderPaymentPreview);
  document.getElementById('payAmount').addEventListener('input', renderPaymentPreview);

  document.getElementById('paymentForm').addEventListener('submit', e => {
    e.preventDefault();
    const aptId = document.getElementById('paySelectApt').value;
    const amount = Number(document.getElementById('payAmount').value);
    const date = document.getElementById('payDate').value || UTIL.todayISO();
    const note = document.getElementById('payNote').value.trim();
    if (!aptId || !amount || amount <= 0) {
      toast('الرجاء اختيار الشقة وإدخال مبلغ صحيح', 'error');
      return;
    }
    const result = DB.recordPayment(DATA, aptId, amount, date, note);
    persist();
    const apt = DATA.apartments.find(a => a.id === aptId);
    lastPaymentForReceipt = { aptId, paymentId: result.payment.id };

    toast(`تم تسجيل الأداء. الوصل صالح الآن إلى غاية ${UTIL.formatMonthKey(result.toMonth)}`, 'success');
    document.getElementById('paymentForm').reset();
    document.getElementById('payDate').value = UTIL.todayISO();

    showReceiptPrompt(apt, result.payment);

    renderDashboard();
    renderPaymentsView();
  });
}

function showReceiptPrompt(apt, payment) {
  const box = document.getElementById('receiptPrompt');
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="receipt-prompt-text">
      تم تسجيل أداء بمبلغ ${UTIL.formatMoney(payment.amount)} ${DATA.meta.currency} لفائدة شقة ${apt.number} — ${escapeAttr(apt.name)}.
    </div>
    <button class="btn btn-primary" id="printLastReceipt">طباعة / حفظ الوصل PDF</button>
  `;
  document.getElementById('printLastReceipt').addEventListener('click', () => {
    PRINT.printHTML(PRINT.receiptHTML(DATA, apt, payment));
  });
}

/* ================================================================
   EXPENSES VIEW
   ================================================================ */
function renderExpensesView() {
  const catSelect = document.getElementById('expCategory');
  catSelect.innerHTML = DB.EXPENSE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
  document.getElementById('expDate').value = UTIL.todayISO();
  renderExpensesTable();
}

function renderExpensesTable() {
  const tbody = document.getElementById('expensesBody');
  const sorted = DATA.expenses.slice().sort((a, b) => b.date.localeCompare(a.date));
  tbody.innerHTML = sorted.map(e => `
    <tr>
      <td>${UTIL.formatDate(e.date)}</td>
      <td>${escapeAttr(e.category)}</td>
      <td>${UTIL.formatMoney(e.amount)}</td>
      <td class="notes-cell">${escapeAttr(e.notes || '—')}</td>
      <td><button class="btn-link btn-link-danger" data-del-exp="${e.id}">حذف</button></td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="empty-cell">لا توجد مصاريف مسجلة</td></tr>`;

  const total = DATA.expenses.reduce((s, e) => s + e.amount, 0);
  document.getElementById('expensesTotal').textContent = UTIL.formatMoney(total) + ' ' + DATA.meta.currency;

  tbody.querySelectorAll('[data-del-exp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-del-exp');
      confirmDialog('حذف هذا المصروف؟', () => {
        DATA.expenses = DATA.expenses.filter(e => e.id !== id);
        persist();
        renderExpensesTable();
        renderDashboard();
      });
    });
  });
}

function wireExpensesForm() {
  document.getElementById('expCategory').addEventListener('change', () => {
    const isOther = document.getElementById('expCategory').value === 'أخرى';
    document.getElementById('expOtherWrap').classList.toggle('hidden', !isOther);
  });

  document.getElementById('expenseForm').addEventListener('submit', e => {
    e.preventDefault();
    let category = document.getElementById('expCategory').value;
    if (category === 'أخرى') {
      const custom = document.getElementById('expOther').value.trim();
      if (custom) category = custom;
    }
    const amount = Number(document.getElementById('expAmount').value);
    const date = document.getElementById('expDate').value || UTIL.todayISO();
    const notes = document.getElementById('expNotes').value.trim();
    if (!amount || amount <= 0) {
      toast('الرجاء إدخال مبلغ صحيح', 'error');
      return;
    }
    DB.addExpense(DATA, category, amount, date, notes);
    persist();
    toast('تم تسجيل المصروف', 'success');
    document.getElementById('expenseForm').reset();
    document.getElementById('expDate').value = UTIL.todayISO();
    document.getElementById('expOtherWrap').classList.add('hidden');
    renderExpensesTable();
    renderDashboard();
  });
}

/* ================================================================
   REPORTS VIEW
   ================================================================ */
function renderReportsView() {
  const select = document.getElementById('reportPeriod');
  const periods = generatePeriodOptions();
  select.innerHTML = periods.map(p =>
    `<option value="${p.startKey}|${p.endKey}">${UTIL.formatMonthKey(p.startKey)} — ${UTIL.formatMonthKey(p.endKey)}</option>`
  ).join('');
  renderReportPreview();
}

function generatePeriodOptions() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const opts = [];
  for (let y = currentYear + 1; y >= currentYear - 3; y--) {
    opts.push(DB.halfYearPeriod(y, 2));
    opts.push(DB.halfYearPeriod(y, 1));
  }
  return opts;
}

function wireReportsForm() {
  document.getElementById('reportPeriod').addEventListener('change', renderReportPreview);
  document.getElementById('reportPrint').addEventListener('click', () => {
    const period = getSelectedPeriod();
    PRINT.printHTML(PRINT.reportHTML(DATA, period));
  });
}

function getSelectedPeriod() {
  const [startKey, endKey] = document.getElementById('reportPeriod').value.split('|');
  const [sy, sm] = startKey.split('-');
  const [ey, em] = endKey.split('-');
  const lastDay = new Date(Number(ey), Number(em), 0).getDate();
  return {
    startKey, endKey,
    startDate: `${sy}-${sm}-01`,
    endDate: `${ey}-${em}-${String(lastDay).padStart(2, '0')}`
  };
}

function renderReportPreview() {
  const period = getSelectedPeriod();
  document.getElementById('reportPreviewArea').innerHTML = PRINT.reportHTML(DATA, period);
}

/* ================================================================
   SETTINGS VIEW (building info, apartments, backup)
   ================================================================ */
function renderSettingsView() {
  document.getElementById('setBuildingName').value = DATA.meta.buildingName;
  document.getElementById('setMonthlyFee').value = DATA.meta.monthlyFee;
  renderApartmentsSettingsTable();
}

function renderApartmentsSettingsTable() {
  const tbody = document.getElementById('aptSettingsBody');
  const ref = DB.todayMonthKey();
  tbody.innerHTML = DATA.apartments
    .slice()
    .sort((a, b) => a.number - b.number)
    .map(apt => `
      <tr>
        <td><input type="number" class="cell-input" data-apt-number="${apt.id}" value="${apt.number}" min="1"></td>
        <td><input type="text" class="cell-input" data-apt-name="${apt.id}" value="${escapeAttr(apt.name)}"></td>
        <td><input type="month" class="cell-input" data-apt-covered="${apt.id}" value="${apt.lastCoveredMonth}"></td>
        <td>${UTIL.formatMoney(DB.debtAmount(apt, ref, DATA))}</td>
        <td><button class="btn-link btn-link-danger" data-del-apt="${apt.id}">حذف</button></td>
      </tr>
    `).join('');

  tbody.querySelectorAll('[data-apt-name]').forEach(inp => {
    inp.addEventListener('change', () => {
      const apt = DATA.apartments.find(a => a.id === inp.getAttribute('data-apt-name'));
      apt.name = inp.value.trim() || apt.name;
      persist();
      renderDashboard();
    });
  });
  tbody.querySelectorAll('[data-apt-number]').forEach(inp => {
    inp.addEventListener('change', () => {
      const apt = DATA.apartments.find(a => a.id === inp.getAttribute('data-apt-number'));
      const n = Number(inp.value);
      if (n > 0) { apt.number = n; persist(); renderDashboard(); }
    });
  });
  tbody.querySelectorAll('[data-apt-covered]').forEach(inp => {
    inp.addEventListener('change', () => {
      const apt = DATA.apartments.find(a => a.id === inp.getAttribute('data-apt-covered'));
      if (inp.value) {
        apt.lastCoveredMonth = inp.value;
        persist();
        renderApartmentsSettingsTable();
        renderDashboard();
        toast('تم تحديث تاريخ صلاحية الوصل', 'success');
      }
    });
  });
  tbody.querySelectorAll('[data-del-apt]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-del-apt');
      confirmDialog('حذف هذه الشقة نهائيا؟ سيتم فقدان سجل أداءاتها.', () => {
        DATA.apartments = DATA.apartments.filter(a => a.id !== id);
        persist();
        renderApartmentsSettingsTable();
        renderDashboard();
      });
    });
  });
}

function wireSettingsForm() {
  document.getElementById('buildingInfoForm').addEventListener('submit', e => {
    e.preventDefault();
    DATA.meta.buildingName = document.getElementById('setBuildingName').value.trim() || DATA.meta.buildingName;
    const fee = Number(document.getElementById('setMonthlyFee').value);
    if (fee > 0) DATA.meta.monthlyFee = fee;
    persist();
    toast('تم حفظ الإعدادات', 'success');
    renderDashboard();
  });

  document.getElementById('addAptBtn').addEventListener('click', () => {
    const nextNumber = Math.max(0, ...DATA.apartments.map(a => a.number)) + 1;
    DATA.apartments.push({
      id: DB.makeId('apt'),
      number: nextNumber,
      name: `الشقة ${nextNumber}`,
      lastCoveredMonth: DB.todayMonthKey(),
      creditRemainder: 0,
      payments: []
    });
    persist();
    renderApartmentsSettingsTable();
    renderDashboard();
  });

  document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = UTIL.todayISO();
    a.href = url;
    a.download = `نسخة-احتياطية-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('importInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.apartments || !parsed.meta) throw new Error('bad shape');
        confirmDialog('سيتم استبدال جميع البيانات الحالية بالبيانات المستوردة. متابعة؟', () => {
          DATA = parsed;
          persist();
          renderAll();
          toast('تم استيراد البيانات بنجاح', 'success');
          showView('dashboard');
        });
      } catch (err) {
        toast('الملف غير صالح', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    confirmDialog('سيتم حذف جميع البيانات نهائيا. هل أنت متأكد؟', () => {
      confirmDialog('تأكيد أخير: لا يمكن التراجع عن هذا الإجراء. متابعة؟', () => {
        DATA = DB.resetToBlank(DATA.meta.buildingName, 16);
        renderAll();
        toast('تم إعادة تعيين البيانات', 'success');
        showView('settings');
      });
    });
  });
}

/* ================================================================
   MODALS / TOASTS / CONFIRM
   ================================================================ */
function wireModals() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close-modal')));
  });
  wirePaymentsForm();
  wireExpensesForm();
  wireReportsForm();
  wireSettingsForm();
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

let confirmCallback = null;
function confirmDialog(message, onConfirm) {
  document.getElementById('confirmMessage').textContent = message;
  confirmCallback = onConfirm;
  openModal('confirmModal');
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('confirmYes').addEventListener('click', () => {
    closeModal('confirmModal');
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
  });
});

function toast(message, type) {
  const el = document.createElement('div');
  el.className = `toast toast-${type || 'info'}`;
  el.textContent = message;
  document.getElementById('toastHost').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3800);
}

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

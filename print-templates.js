/* ============================================================
   print-templates.js — builds the HTML markup for the printable
   receipt and six-month report. Rendered into #printArea and
   sent to window.print() (browser's own "Save as PDF" handles
   the PDF export — no external PDF library needed, and it
   renders Arabic correctly since the browser does the shaping).
   ============================================================ */

function receiptHTML(data, apt, payment) {
  const fee = data.meta.monthlyFee;
  const months = payment.monthsCovered;
  return `
    <div class="print-receipt">
      <div class="pr-header">
        <div class="pr-building">${escapeHTML(data.meta.buildingName)}</div>
        <div class="pr-title">وصل أداء واجبات السكن</div>
      </div>
      <div class="pr-row"><span>رقم الوصل</span><span>${escapeHTML(payment.id.slice(-8))}</span></div>
      <div class="pr-row"><span>تاريخ الأداء</span><span>${UTIL.formatDate(payment.date)}</span></div>
      <hr/>
      <div class="pr-row"><span>رقم الشقة</span><span>${apt.number}</span></div>
      <div class="pr-row"><span>اسم الساكن</span><span>${escapeHTML(apt.name)}</span></div>
      <hr/>
      <div class="pr-row"><span>المبلغ المؤدى</span><span>${UTIL.formatMoney(payment.amount)} ${data.meta.currency}</span></div>
      <div class="pr-row"><span>عدد الأشهر المغطاة</span><span>${months} ${months === 1 ? 'شهر' : 'أشهر'}</span></div>
      <div class="pr-row"><span>الوجيبة الشهرية</span><span>${UTIL.formatMoney(fee)} ${data.meta.currency}</span></div>
      <hr/>
      <div class="pr-row pr-strong"><span>الوصل صالح إلى غاية</span><span>${UTIL.formatMonthKey(apt.lastCoveredMonth)}</span></div>
      <div class="pr-row"><span>المتأخرات الحالية</span><span>${UTIL.formatMoney(DB.debtAmount(apt, DB.todayMonthKey(), data))} ${data.meta.currency}</span></div>
      <div class="pr-footer">شكرا لتعاونكم في تسيير شؤون العمارة</div>
    </div>
  `;
}

function reportHTML(data, period) {
  const { startDate, endDate, startKey, endKey } = period;
  const refMonth = endKey;

  const rows = data.apartments
    .slice()
    .sort((a, b) => a.number - b.number)
    .map(apt => {
      const periodPaid = apt.payments
        .filter(p => DB.inRange(p.date, startDate, endDate))
        .reduce((s, p) => s + p.amount, 0);
      const debt = DB.debtAmount(apt, refMonth, data);
      const status = DB.apartmentStatus(apt, refMonth, data);
      return `
        <tr>
          <td>${apt.number}</td>
          <td class="rp-name">${escapeHTML(apt.name)}</td>
          <td>${periodPaid ? UTIL.formatMoney(periodPaid) : '-'}</td>
          <td>${UTIL.formatMonthKey(apt.lastCoveredMonth)}</td>
          <td class="rp-status rp-status-${status}">${debt ? UTIL.formatMoney(debt) : '-'}</td>
        </tr>`;
    }).join('');

  const totalPayments = DB.totalPayments(data, startDate, endDate);
  const totalExpenses = DB.totalExpenses(data, startDate, endDate);
  const totalDebt = DB.totalOutstandingDebt(data, refMonth);
  const balance = DB.balanceAsOf(data, endDate);

  const periodExpenses = data.expenses.filter(e => DB.inRange(e.date, startDate, endDate));
  const byCategory = {};
  periodExpenses.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
  const expenseRows = Object.keys(byCategory).map(cat =>
    `<tr><td class="rp-name">${escapeHTML(cat)}</td><td>${UTIL.formatMoney(byCategory[cat])}</td></tr>`
  ).join('') || `<tr><td colspan="2" class="rp-empty">لا توجد مصاريف مسجلة في هذه الفترة</td></tr>`;

  return `
    <div class="print-report">
      <div class="pr-header">
        <div class="pr-building">${escapeHTML(data.meta.buildingName)}</div>
        <div class="pr-title">كشف حساب من ${UTIL.formatMonthKey(startKey)} إلى غاية ${UTIL.formatMonthKey(endKey)}</div>
      </div>

      <table class="rp-table">
        <thead>
          <tr>
            <th>رقم</th>
            <th>الاسم</th>
            <th>الأداء خلال الفترة</th>
            <th>الوصل صالح إلى غاية</th>
            <th>المتأخرات</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="2">المجموع</td>
            <td>${UTIL.formatMoney(totalPayments)}</td>
            <td></td>
            <td>${UTIL.formatMoney(totalDebt)}</td>
          </tr>
        </tfoot>
      </table>

      <h3 class="rp-subtitle">المصاريف</h3>
      <table class="rp-table rp-expenses">
        <thead><tr><th>نوع المصاريف</th><th>المبلغ</th></tr></thead>
        <tbody>${expenseRows}</tbody>
        <tfoot><tr><td>المجموع</td><td>${UTIL.formatMoney(totalExpenses)}</td></tr></tfoot>
      </table>

      <div class="rp-summary">
        <div class="rp-summary-item"><span>مجموع الأداءات</span><strong>${UTIL.formatMoney(totalPayments)} ${data.meta.currency}</strong></div>
        <div class="rp-summary-item"><span>مجموع المصاريف</span><strong>${UTIL.formatMoney(totalExpenses)} ${data.meta.currency}</strong></div>
        <div class="rp-summary-item"><span>مجموع المتأخرات</span><strong>${UTIL.formatMoney(totalDebt)} ${data.meta.currency}</strong></div>
        <div class="rp-summary-item rp-balance"><span>الرصيد الحالي</span><strong>${UTIL.formatMoney(balance)} ${data.meta.currency}</strong></div>
      </div>
    </div>
  `;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function printHTML(html) {
  const area = document.getElementById('printArea');
  area.innerHTML = html;
  document.body.classList.add('printing');
  window.print();
  setTimeout(() => document.body.classList.remove('printing'), 300);
}

window.PRINT = { receiptHTML, reportHTML, printHTML };

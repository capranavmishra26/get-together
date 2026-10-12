const STORAGE_KEY = "gather-party-expenses-v1";
const AVATAR_CLASSES = ["avatar-violet", "avatar-coral", "avatar-blue", "avatar-gold", "avatar-teal"];
const EXPENSE_ICONS = ["✦", "◈", "↗", "✳", "⌁"];
function getLocalDateString() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60_000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

const SAMPLE_DATA = {
  currency: "INR",
  partyDate: getLocalDateString(),
  history: [],
  people: [
    { id: "person-pranav", name: "Pranav" },
    { id: "person-harikesh", name: "Harikesh" },
    { id: "person-pawan", name: "Pawan" },
  ],
  expenses: [
    { id: "expense-dinner", description: "Dinner & shared plates", payerId: "person-pranav", amountCents: 9600 },
    { id: "expense-drinks", description: "Drinks for the table", payerId: "person-harikesh", amountCents: 4800 },
    { id: "expense-cab", description: "Ride home", payerId: "person-pawan", amountCents: 2400 },
  ],
};
const LEGACY_SAMPLE_IDS = {
  people: ["person-alex", "person-jordan", "person-sam", "person-taylor"],
  expenses: ["expense-dinner", "expense-drinks", "expense-cab"],
};

const TAB_KEY = "gather-party-tab-v1";
const TABS = ["people", "expenses", "settle", "records"];

let nextId = 0;
let toastTimeout;
let undoAction = null;
let selectedPayerId = null;
let editingExpenseId = null;

function isValidSavedData(value) {
  return value !== null
    && typeof value === "object"
    && isValidPartyRecord(value)
    && (value.history === undefined || (
      Array.isArray(value.history)
      && value.history.every((record) => record
        && typeof record.id === "string"
        && typeof record.recordedAt === "string"
        && !Number.isNaN(Date.parse(record.recordedAt))
        && isValidPartyRecord(record))
    ));
}

function isValidPartyRecord(value) {
  return value !== null
    && typeof value === "object"
    && Array.isArray(value.people)
    && Array.isArray(value.expenses)
    && ["INR", "USD", "EUR", "GBP"].includes(value.currency)
    && typeof value.partyDate === "string"
    && isValidDateString(value.partyDate)
    && value.people.every((person) => person && typeof person.id === "string" && typeof person.name === "string")
    && value.expenses.every((expense) => expense
      && typeof expense.id === "string"
      && typeof expense.description === "string"
      && typeof expense.payerId === "string"
      && Number.isSafeInteger(expense.amountCents)
      && expense.amountCents > 0)
    && value.expenses.every((expense) => value.people.some((person) => person.id === expense.payerId));
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function migrateLegacySample(value) {
  const oldPeople = [
    ["person-alex", "Alex"],
    ["person-jordan", "Jordan"],
    ["person-sam", "Sam"],
    ["person-taylor", "Taylor"],
  ];
  const oldExpenses = [
    ["expense-dinner", "Dinner & shared plates", "person-alex", 9600],
    ["expense-drinks", "Drinks for the table", "person-jordan", 4800],
    ["expense-cab", "Ride home", "person-sam", 2400],
  ];
  const isLegacySample = value.currency === "INR"
    && value.people.length === LEGACY_SAMPLE_IDS.people.length
    && value.expenses.length === LEGACY_SAMPLE_IDS.expenses.length
    && oldPeople.every(([id, name]) => value.people.some((person) => person.id === id && person.name === name))
    && oldExpenses.every(([id, description, payerId, amountCents]) => value.expenses.some((expense) =>
      expense.id === id
      && expense.description === description
      && expense.payerId === payerId
      && expense.amountCents === amountCents));
  return isLegacySample ? structuredClone(SAMPLE_DATA) : value;
}

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return structuredClone(SAMPLE_DATA);
    const parsed = JSON.parse(saved);
    if (!isValidSavedData(parsed)) return structuredClone(SAMPLE_DATA);
    const restored = migrateLegacySample(parsed);
    if (!restored.partyDate) restored.partyDate = getLocalDateString();
    if (!Array.isArray(restored.history)) restored.history = [];
    return restored;
  } catch (error) {
    console.error("Could not load saved party expenses.", error);
    return structuredClone(SAMPLE_DATA);
  }
}

let data = loadData();

const elements = {
  totalSpent: document.querySelector("#total-spent"),
  expenseCount: document.querySelector("#expense-count"),
  perPerson: document.querySelector("#per-person"),
  peopleCount: document.querySelector("#people-count"),
  settlementCount: document.querySelector("#settlement-count"),
  peoplePill: document.querySelector("#people-pill"),
  expensesPill: document.querySelector("#expenses-pill"),
  peopleList: document.querySelector("#people-list"),
  expenseList: document.querySelector("#expense-list"),
  payerChips: document.querySelector("#expense-payer"),
  expenseForm: document.querySelector("#expense-form"),
  expenseSubmit: document.querySelector("#expense-submit"),
  expenseCancel: document.querySelector("#expense-cancel"),
  peopleNext: document.querySelector("#people-next"),
  expensesNext: document.querySelector("#expenses-next"),
  balanceList: document.querySelector("#balance-list"),
  transferList: document.querySelector("#transfer-list"),
  allEven: document.querySelector("#all-even"),
  settleBadge: document.querySelector("#settle-badge"),
  tabs: document.querySelectorAll(".tab"),
  toast: document.querySelector("#toast"),
  toastMessage: document.querySelector("#toast-message"),
  toastUndo: document.querySelector("#toast-undo"),
  currencySelect: document.querySelector("#currency-select"),
  partyDate: document.querySelector("#party-date"),
  recordPartyButton: document.querySelector("#record-party"),
  viewRecordsButton: document.querySelector("#view-records"),
  savedPartiesPanel: document.querySelector("#saved-parties-panel"),
  savedPartiesList: document.querySelector("#saved-parties-list"),
};

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatMoney(cents, currency = data.currency) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatPartyDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(year, month - 1, day));
}

function getCurrencySymbol(currency = data.currency) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency })
    .formatToParts(0)
    .find((part) => part.type === "currency").value;
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

function avatar(person, index) {
  return `<span class="avatar ${AVATAR_CLASSES[index % AVATAR_CLASSES.length]}" aria-hidden="true">${escapeHtml(initials(person.name))}</span>`;
}

function getTotals(party = data) {
  const paidByPerson = new Map(party.people.map((person) => [person.id, 0]));
  let total = 0;
  for (const expense of party.expenses) {
    total += expense.amountCents;
    paidByPerson.set(expense.payerId, (paidByPerson.get(expense.payerId) ?? 0) + expense.amountCents);
  }
  return { total, paidByPerson };
}

function getShares(total, paidByPerson, party = data) {
  const shares = new Map();
  const baseShare = party.people.length > 0 ? Math.floor(total / party.people.length) : 0;
  let remainder = party.people.length > 0 ? total % party.people.length : 0;
  for (const person of party.people) {
    const share = baseShare + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    shares.set(person.id, share);
  }
  return shares;
}

function createTransfers(shares, paidByPerson, party = data) {
  const debtors = [];
  const creditors = [];
  for (const person of party.people) {
    const balance = (paidByPerson.get(person.id) ?? 0) - (shares.get(person.id) ?? 0);
    if (balance < 0) debtors.push({ person, amount: -balance });
    if (balance > 0) creditors.push({ person, amount: balance });
  }

  const transfers = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);
    if (amount > 0) transfers.push({ from: debtor.person, to: creditor.person, amount });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }
  return transfers;
}

function renderPeople(paidByPerson) {
  elements.peopleList.innerHTML = data.people.map((person, index) => `
    <div class="person-row">
      ${avatar(person, index)}
      <span class="person-details">
        <span class="person-name">${escapeHtml(person.name)}</span>
        <span class="person-spend">Paid ${formatMoney(paidByPerson.get(person.id) ?? 0)}</span>
      </span>
      <button class="remove-button" type="button" data-remove-person="${escapeHtml(person.id)}" aria-label="Remove ${escapeHtml(person.name)}" title="Remove person">×</button>
    </div>
  `).join("");
  elements.peoplePill.textContent = `${data.people.length} ${data.people.length === 1 ? "person" : "people"}`;

  if (!data.people.some((person) => person.id === selectedPayerId)) selectedPayerId = data.people[0]?.id ?? null;
  elements.payerChips.innerHTML = data.people.length === 0
    ? '<span class="payer-empty">Add people first, then pick who paid.</span>'
    : data.people.map((person) => `
      <label class="payer-chip">
        <input type="radio" name="payer" value="${escapeHtml(person.id)}"${person.id === selectedPayerId ? " checked" : ""} required />
        <span>${escapeHtml(person.name)}</span>
      </label>
    `).join("");
  elements.expenseSubmit.disabled = data.people.length === 0;
  elements.peopleNext.hidden = data.people.length < 2;
}

function renderExpenses() {
  if (!data.expenses.some((expense) => expense.id === editingExpenseId)) editingExpenseId = null;
  const noExpensesMessage = data.people.length === 0
    ? '<div class="empty-state">Add the people in your party first.<button class="button button-soft empty-action" type="button" data-go-tab="people" data-focus="#person-name">Add people</button></div>'
    : '<div class="empty-state">No expenses yet. Add one below to get started.</div>';
  elements.expenseList.innerHTML = data.expenses.length === 0
    ? noExpensesMessage
    : data.expenses.map((expense, index) => {
      const payer = data.people.find((person) => person.id === expense.payerId);
      return `
        <div class="expense-row${expense.id === editingExpenseId ? " editing" : ""}">
          <button class="expense-edit" type="button" data-edit-expense="${escapeHtml(expense.id)}" aria-label="Edit ${escapeHtml(expense.description)}, ${formatMoney(expense.amountCents)}, paid by ${escapeHtml(payer.name)}" title="Tap to edit">
            <span class="expense-mark" aria-hidden="true">${EXPENSE_ICONS[index % EXPENSE_ICONS.length]}</span>
            <span class="expense-details">
              <span class="expense-description">${escapeHtml(expense.description)}</span>
              <span class="expense-payer">Paid by ${escapeHtml(payer.name)}</span>
            </span>
            <span class="expense-amount">${formatMoney(expense.amountCents)}</span>
          </button>
          <button class="remove-button" type="button" data-remove-expense="${escapeHtml(expense.id)}" aria-label="Remove ${escapeHtml(expense.description)}" title="Remove expense">×</button>
        </div>
      `;
    }).join("");
  elements.expensesPill.textContent = `${data.expenses.length} ${data.expenses.length === 1 ? "expense" : "expenses"}`;

  const isEditing = editingExpenseId !== null;
  elements.expenseForm.classList.toggle("editing", isEditing);
  elements.expenseCancel.hidden = !isEditing;
  elements.expenseSubmit.innerHTML = isEditing ? "Save changes" : '<span aria-hidden="true">+</span> Add expense';
  elements.expensesNext.hidden = data.expenses.length === 0 || data.people.length < 2;
}

function renderBalances(shares, paidByPerson) {
  elements.balanceList.innerHTML = data.people.length === 0
    ? '<div class="empty-state">Add people to see everyone’s balance.</div>'
    : data.people.map((person, index) => {
      const share = shares.get(person.id) ?? 0;
      const balance = (paidByPerson.get(person.id) ?? 0) - share;
      const amount = balance > 0
        ? `<span class="balance-amount">+${formatMoney(balance)}</span>`
        : balance < 0
          ? `<span class="balance-amount owes">−${formatMoney(-balance)}</span>`
          : `<span class="balance-amount">${formatMoney(0)}</span>`;
      return `
        <div class="balance-row">
          ${avatar(person, index)}
          <span class="balance-person">${escapeHtml(person.name)}</span>
          <span class="balance-share">${formatMoney(share)} share</span>
          ${amount}
        </div>
      `;
    }).join("");
}

function renderTransfers(transfers) {
  elements.transferList.innerHTML = transfers.map((transfer) => {
    const fromIndex = data.people.findIndex((person) => person.id === transfer.from.id);
    const toIndex = data.people.findIndex((person) => person.id === transfer.to.id);
    return `
      <div class="transfer-row">
        <span class="transfer-avatars">${avatar(transfer.from, fromIndex)}${avatar(transfer.to, toIndex)}</span>
        <span class="transfer-text"><strong>${escapeHtml(transfer.from.name)}</strong> pays <strong>${escapeHtml(transfer.to.name)}</strong></span>
        <span class="transfer-amount">${formatMoney(transfer.amount)}</span>
      </div>
    `;
  }).join("");
  elements.allEven.hidden = transfers.length > 0;
  elements.settleBadge.textContent = transfers.length > 0 ? String(transfers.length) : "";
  elements.settlementCount.textContent = `${transfers.length} ${transfers.length === 1 ? "transfer" : "transfers"}`;
}

function xmlEscape(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function excelColumnName(index) {
  let name = "";
  while (index > 0) {
    index -= 1;
    name = String.fromCharCode(65 + (index % 26)) + name;
    index = Math.floor(index / 26);
  }
  return name;
}

function excelCellXml(cell, reference) {
  const styleId = cell.style === "Header" ? 1 : cell.style === "Currency" ? 2 : cell.style === "Number" ? 3 : 0;
  const styleAttribute = styleId ? ` s="${styleId}"` : "";
  if (cell.type === "Number") {
    return `<c r="${reference}"${styleAttribute}><v>${xmlEscape(cell.value)}</v></c>`;
  }
  return `<c r="${reference}" t="inlineStr"${styleAttribute}><is><t xml:space="preserve">${xmlEscape(cell.value)}</t></is></c>`;
}

function excelWorksheetXml(rows) {
  const worksheetRows = rows.map((cells, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const worksheetCells = cells.map((cell, columnIndex) =>
      excelCellXml(cell, `${excelColumnName(columnIndex + 1)}${rowNumber}`)).join("");
    return `<row r="${rowNumber}">${worksheetCells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${worksheetRows}</sheetData></worksheet>`;
}

function zipFiles(files) {
  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for (let index = 0; index < crcTable.length; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    crcTable[index] = crc >>> 0;
  }
  const crc32 = (bytes) => {
    let crc = 0xFFFFFFFF;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };
  const entries = [];
  let offset = 0;

  for (const [name, content] of files) {
    const filename = encoder.encode(name);
    const body = encoder.encode(content);
    const checksum = crc32(body);
    const localHeader = new Uint8Array(30 + filename.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034B50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, body.length, true);
    localView.setUint32(22, body.length, true);
    localView.setUint16(26, filename.length, true);
    localHeader.set(filename, 30);
    entries.push({ filename, body, checksum, localHeader, offset });
    offset += localHeader.length + body.length;
  }

  const centralHeaders = entries.map((entry) => {
    const header = new Uint8Array(46 + entry.filename.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014B50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint32(16, entry.checksum, true);
    view.setUint32(20, entry.body.length, true);
    view.setUint32(24, entry.body.length, true);
    view.setUint16(28, entry.filename.length, true);
    view.setUint32(42, entry.offset, true);
    header.set(entry.filename, 46);
    return header;
  });
  const centralDirectory = new Uint8Array(centralHeaders.reduce((length, header) => length + header.length, 0));
  let centralOffset = 0;
  for (const header of centralHeaders) {
    centralDirectory.set(header, centralOffset);
    centralOffset += header.length;
  }

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054B50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, offset, true);

  const archive = new Uint8Array(offset + centralDirectory.length + endRecord.length);
  let archiveOffset = 0;
  for (const entry of entries) {
    archive.set(entry.localHeader, archiveOffset);
    archiveOffset += entry.localHeader.length;
    archive.set(entry.body, archiveOffset);
    archiveOffset += entry.body.length;
  }
  archive.set(centralDirectory, archiveOffset);
  archive.set(endRecord, archiveOffset + centralDirectory.length);
  return archive;
}

function createSettlementWorkbook(total, transfers, shares, paidByPerson) {
  const symbol = getCurrencySymbol();
  const partyDateRow = [
    { value: "Party date", style: "Header" },
    { value: formatPartyDate(data.partyDate) },
  ];
  const partyTotalRow = [
    { value: "Party total", style: "Header" },
    { value: (total / 100).toFixed(2), type: "Number", style: "Currency" },
    { value: "" },
    { value: "" },
    { value: `${data.people.length} ${data.people.length === 1 ? "person" : "people"} · ${data.expenses.length} ${data.expenses.length === 1 ? "expense" : "expenses"}` },
  ];
  const settlementRows = [partyDateRow, partyTotalRow, [
    { value: "Name" },
    { value: `Amount spent (${symbol})` },
    { value: `Allocated amount (${symbol})` },
    { value: `Settle amount (${symbol})` },
    { value: "Remark — paid to / received from" },
  ].map((cell) => ({ ...cell, style: "Header" }))];

  for (const person of data.people) {
    const outgoing = transfers.filter((transfer) => transfer.from.id === person.id);
    const incoming = transfers.filter((transfer) => transfer.to.id === person.id);
    const netBalance = (paidByPerson.get(person.id) ?? 0) - (shares.get(person.id) ?? 0);
    const remarks = [
      ...outgoing.map((transfer) => `Pay ${formatMoney(transfer.amount)} to ${transfer.to.name}`),
      ...incoming.map((transfer) => `Receive ${formatMoney(transfer.amount)} from ${transfer.from.name}`),
    ];
    settlementRows.push([
      { value: person.name },
      { value: ((paidByPerson.get(person.id) ?? 0) / 100).toFixed(2), type: "Number", style: "Currency" },
      { value: ((shares.get(person.id) ?? 0) / 100).toFixed(2), type: "Number", style: "Currency" },
      { value: (Math.abs(netBalance) / 100).toFixed(2), type: "Number", style: "Currency" },
      { value: remarks.join("; ") || "Settled" },
    ]);
  }

  const transferRows = [partyDateRow, [
    { value: "Paid by", style: "Header" },
    { value: "Paid to", style: "Header" },
    { value: `Amount (${symbol})`, style: "Header" },
  ]];
  for (const transfer of transfers) {
    transferRows.push([
      { value: transfer.from.name },
      { value: transfer.to.name },
      { value: (transfer.amount / 100).toFixed(2), type: "Number", style: "Currency" },
    ]);
  }

  const expenseRows = [partyDateRow, [
    { value: "Expense", style: "Header" },
    { value: "Paid by", style: "Header" },
    { value: `Amount (${symbol})`, style: "Header" },
  ]];
  for (const expense of data.expenses) {
    const payer = data.people.find((person) => person.id === expense.payerId);
    expenseRows.push([
      { value: expense.description },
      { value: payer.name },
      { value: (expense.amountCents / 100).toFixed(2), type: "Number", style: "Currency" },
    ]);
  }
  expenseRows.push([
    { value: "Total", style: "Header" },
    { value: "", style: "Header" },
    { value: (total / 100).toFixed(2), type: "Number", style: "Currency" },
  ]);

  const historyRows = [[
    { value: "Record", style: "Header" },
    { value: "Party date", style: "Header" },
    { value: "Currency", style: "Header" },
    { value: "Total spent", style: "Header" },
    { value: "People", style: "Header" },
    { value: "Expenses", style: "Header" },
    { value: "Allocated per person", style: "Header" },
    { value: "Settlement details", style: "Header" },
  ]];
  const reportParties = [
    ...data.history.map((record) => ({ ...record, recordLabel: "Saved record" })),
    { ...data, recordLabel: "Current party" },
  ].sort((first, second) => {
    const dateOrder = first.partyDate.localeCompare(second.partyDate);
    if (dateOrder !== 0) return dateOrder;
    if (first.recordLabel !== second.recordLabel) return first.recordLabel === "Current party" ? -1 : 1;
    return (first.recordedAt ?? "").localeCompare(second.recordedAt ?? "");
  });
  const seenReportSummaries = new Set();

  for (const party of reportParties) {
    const partyTotals = getTotals(party);
    const partyShares = getShares(partyTotals.total, partyTotals.paidByPerson, party);
    const partyTransfers = createTransfers(partyShares, partyTotals.paidByPerson, party);
    const equalShareCents = party.people.length > 0
      ? Math.round(partyTotals.total / party.people.length)
      : 0;
    const transferDetails = partyTransfers.length > 0
      ? partyTransfers.map((transfer) =>
        `${transfer.from.name} pays ${transfer.to.name} ${formatMoney(transfer.amount, party.currency)}`).join("; ")
      : "Everyone is settled up";
    const summaryKey = JSON.stringify([
      party.partyDate,
      party.currency,
      partyTotals.total,
      party.people.length,
      party.expenses.length,
      equalShareCents,
      transferDetails,
    ]);
    if (seenReportSummaries.has(summaryKey)) continue;
    seenReportSummaries.add(summaryKey);

    historyRows.push([
      { value: party.recordLabel },
      { value: formatPartyDate(party.partyDate) },
      { value: party.currency },
      { value: (partyTotals.total / 100).toFixed(2), type: "Number", style: "Number" },
      { value: String(party.people.length), type: "Number", style: "Number" },
      { value: String(party.expenses.length), type: "Number", style: "Number" },
      { value: (equalShareCents / 100).toFixed(2), type: "Number", style: "Number" },
      { value: transferDetails },
    ]);
  }

  const sheets = [
    { name: "Settlement", rows: settlementRows },
    { name: "Expenses", rows: expenseRows },
    { name: "Transfers", rows: transferRows },
    { name: "Party Date-wise", rows: historyRows },
  ];
  const sheetOverrides = sheets.map((sheet, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const workbookSheets = sheets.map((sheet, index) =>
    `<sheet name="${sheet.name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  const workbookRelationships = [
    ...sheets.map((sheet, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`),
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
  ].join("");
  const currencyFormat = xmlEscape(`"${symbol}"#,##0.00`);
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRelationships}</Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="${currencyFormat}"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF356849"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ...sheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, excelWorksheetXml(sheet.rows)]),
  ];
  return zipFiles(files);
}

function downloadSettlementReport() {
  const { paidByPerson } = getTotals();
  const total = [...paidByPerson.values()].reduce((sum, amount) => sum + amount, 0);
  const shares = getShares(total, paidByPerson);
  const transfers = createTransfers(shares, paidByPerson);
  const workbook = createSettlementWorkbook(total, transfers, shares, paidByPerson);
  const blob = new Blob([workbook], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `party-settlement-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Settlement report downloaded.");
}

function wrapCanvasText(context, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function createSettlementImage(transfers, shares, paidByPerson, total) {
  const width = 1080;
  const padding = 64;
  const tableWidth = width - padding * 2;
  const nameWidth = 210;
  const amountWidth = 175;
  const remarkWidth = tableWidth - nameWidth - amountWidth * 3;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not supported in this browser.");

  context.font = "500 20px Arial, sans-serif";
  const people = data.people.map((person) => {
    const balance = (paidByPerson.get(person.id) ?? 0) - (shares.get(person.id) ?? 0);
    const remarks = [
      ...transfers.filter((transfer) => transfer.from.id === person.id)
        .map((transfer) => `Pay ${formatMoney(transfer.amount)} to ${transfer.to.name}`),
      ...transfers.filter((transfer) => transfer.to.id === person.id)
        .map((transfer) => `Receive ${formatMoney(transfer.amount)} from ${transfer.from.name}`),
    ];
    const remark = remarks.join("; ") || "Settled";
    const lines = wrapCanvasText(context, remark, remarkWidth - 24);
    return { person, balance, remarkLines: lines };
  });
  const tableHeaderHeight = 62;
  const rowHeights = people.map((item) => Math.max(72, item.remarkLines.length * 25 + 30));
  const transfersHeight = transfers.length ? 92 + transfers.length * 46 : 90;
  const height = 300 + tableHeaderHeight + rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0) + transfersHeight + 60;
  canvas.width = width;
  canvas.height = height;

  context.fillStyle = "#f4f6f1";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#356849";
  context.fillRect(0, 0, width, 220);

  context.fillStyle = "#c9dfc9";
  context.font = "700 18px Arial, sans-serif";
  context.fillText("GET TOGETHER", padding, 58);
  context.fillStyle = "#ffffff";
  context.font = "700 42px Arial, sans-serif";
  context.fillText("Party settlement", padding, 116);
  context.fillStyle = "#e1eee1";
  context.font = "500 20px Arial, sans-serif";
  context.fillText(`${data.people.length} people  ·  ${data.expenses.length} expenses`, padding, 158);
  context.font = "500 18px Arial, sans-serif";
  context.fillText(`Party date: ${formatPartyDate(data.partyDate)}`, padding, 192);
  context.font = "700 24px Arial, sans-serif";
  context.textAlign = "right";
  context.fillText(`Total ${formatMoney(total)}`, width - padding, 158);
  context.textAlign = "left";

  const tableX = padding;
  let y = 244;
  context.fillStyle = "#ffffff";
  context.fillRect(tableX, y, tableWidth, tableHeaderHeight + rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0));
  context.fillStyle = "#e8f0e8";
  context.fillRect(tableX, y, tableWidth, tableHeaderHeight);
  context.fillStyle = "#506354";
  context.font = "700 16px Arial, sans-serif";
  context.fillText("PERSON", tableX + 20, y + 38);
  context.fillText("SPENT", tableX + nameWidth, y + 38);
  context.fillText("SHARE", tableX + nameWidth + amountWidth, y + 38);
  context.fillText("SETTLE", tableX + nameWidth + amountWidth * 2, y + 38);
  context.fillText("SETTLEMENT DETAILS", tableX + nameWidth + amountWidth * 3, y + 38);
  y += tableHeaderHeight;

  people.forEach((item, index) => {
    const rowHeight = rowHeights[index];
    if (index > 0) {
      context.strokeStyle = "#edf0ec";
      context.beginPath();
      context.moveTo(tableX + 18, y);
      context.lineTo(tableX + tableWidth - 18, y);
      context.stroke();
    }
    context.fillStyle = "#303b33";
    context.font = "700 20px Arial, sans-serif";
    context.fillText(item.person.name, tableX + 20, y + 42);
    context.font = "500 20px Arial, sans-serif";
    context.fillText(formatMoney(paidByPerson.get(item.person.id) ?? 0), tableX + nameWidth, y + 42);
    context.fillText(formatMoney(shares.get(item.person.id) ?? 0), tableX + nameWidth + amountWidth, y + 42);
    context.fillStyle = item.balance < 0 ? "#b7654e" : item.balance > 0 ? "#39754f" : "#657269";
    context.font = "700 20px Arial, sans-serif";
    context.fillText(formatMoney(Math.abs(item.balance)), tableX + nameWidth + amountWidth * 2, y + 42);
    context.fillStyle = "#4b554e";
    context.font = "500 16px Arial, sans-serif";
    item.remarkLines.forEach((line, lineIndex) =>
      context.fillText(line, tableX + nameWidth + amountWidth * 3, y + 32 + lineIndex * 24));
    y += rowHeight;
  });

  y += 34;
  context.fillStyle = "#283d2f";
  context.font = "700 24px Arial, sans-serif";
  context.fillText("Who pays whom", padding, y);
  y += 38;
  context.fillStyle = "#526057";
  context.font = "500 19px Arial, sans-serif";
  if (transfers.length === 0) {
    context.fillText("Everyone is settled up.", padding, y);
  } else {
    for (const transfer of transfers) {
      context.fillText(`${transfer.from.name}  →  ${transfer.to.name}     ${formatMoney(transfer.amount)}`, padding, y);
      y += 34;
    }
  }
  y += 35;
  context.fillStyle = "#7c887e";
  context.font = "500 15px Arial, sans-serif";
  context.fillText("Created by CA PRANAV MISHRA", padding, y);
  return canvas;
}

function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The settlement image could not be created."));
    }, "image/png");
  });
}

async function downloadSettlementImage() {
  const { paidByPerson } = getTotals();
  const total = [...paidByPerson.values()].reduce((sum, amount) => sum + amount, 0);
  const shares = getShares(total, paidByPerson);
  const transfers = createTransfers(shares, paidByPerson);

  try {
    const canvas = createSettlementImage(transfers, shares, paidByPerson, total);
    const blob = await canvasToPng(canvas);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "get-together-settlement.png";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Settlement image downloaded.");
  } catch (error) {
    console.error("Could not download settlement image.", error);
    showToast("Could not create or download the settlement image.");
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    document.querySelector(".save-status").innerHTML = '<span class="status-dot"></span> Saved on this device';
  } catch (error) {
    console.error("Could not save party expenses.", error);
    document.querySelector(".save-status").innerHTML = '<span class="status-dot" style="background:#cb805d"></span> Could not save';
    showToast("Your changes could not be saved on this device.");
  }
}

function render() {
  const { total, paidByPerson } = getTotals();
  const shares = getShares(total, paidByPerson);
  const averageShare = data.people.length > 0 ? total / data.people.length : 0;
  const transfers = createTransfers(shares, paidByPerson);

  elements.totalSpent.textContent = formatMoney(total);
  elements.currencySelect.value = data.currency;
  elements.partyDate.value = data.partyDate;
  document.querySelector("#currency-symbol").textContent = getCurrencySymbol();
  elements.expenseCount.textContent = `Across ${data.expenses.length} ${data.expenses.length === 1 ? "expense" : "expenses"}`;
  elements.perPerson.textContent = formatMoney(Math.round(averageShare));
  elements.peopleCount.textContent = `Split equally between ${data.people.length} ${data.people.length === 1 ? "person" : "people"}`;
  renderPeople(paidByPerson);
  renderExpenses();
  renderBalances(shares, paidByPerson);
  renderTransfers(transfers);
  renderRecordStatus();
}

function getPartySnapshotKey(party) {
  const peopleById = new Map(party.people.map((person) => [person.id, person.name]));
  return JSON.stringify({
    partyDate: party.partyDate,
    currency: party.currency,
    people: party.people.map((person) => person.name),
    expenses: party.expenses.map((expense) => ({
      description: expense.description,
      payer: peopleById.get(expense.payerId),
      amountCents: expense.amountCents,
    })),
  });
}

function renderRecordStatus() {
  const hasMatchingRecord = data.history.some((record) =>
    getPartySnapshotKey(record) === getPartySnapshotKey(data));
  elements.viewRecordsButton.textContent = `View saved parties (${data.history.length})`;
  elements.recordPartyButton.disabled = hasMatchingRecord || data.people.length === 0 || data.expenses.length === 0;
  elements.recordPartyButton.textContent = hasMatchingRecord ? "Party saved to records" : "Save party to records";
  renderSavedParties();
}

function renderSavedParties() {
  if (data.history.length === 0) {
    elements.savedPartiesList.innerHTML = '<p class="saved-party-empty">No saved parties yet. Save a party to keep a record here.</p>';
    return;
  }

  const sortedHistory = [...data.history].sort((first, second) =>
    second.partyDate.localeCompare(first.partyDate)
    || (second.recordedAt ?? "").localeCompare(first.recordedAt ?? ""));
  elements.savedPartiesList.innerHTML = sortedHistory.map((party) => {
    const { total, paidByPerson } = getTotals(party);
    const shares = getShares(total, paidByPerson, party);
    const transfers = createTransfers(shares, paidByPerson, party);
    const expenseRows = party.expenses.length > 0
      ? party.expenses.map((expense) => {
        const payer = party.people.find((person) => person.id === expense.payerId);
        return `<li>${escapeHtml(expense.description)} — ${escapeHtml(payer.name)} paid ${formatMoney(expense.amountCents, party.currency)}</li>`;
      }).join("")
      : "<li>No expenses recorded</li>";
    const transferRows = transfers.length > 0
      ? transfers.map((transfer) =>
        `<li>${escapeHtml(transfer.from.name)} pays ${escapeHtml(transfer.to.name)} ${formatMoney(transfer.amount, party.currency)}</li>`).join("")
      : "<li>Everyone is settled up</li>";

    return `
      <details class="saved-party-item">
        <summary>
          <span class="saved-party-date">${escapeHtml(formatPartyDate(party.partyDate))}</span>
          <span class="saved-party-total">${escapeHtml(formatMoney(total, party.currency))}</span>
          <span class="saved-party-meta">${party.people.length} ${party.people.length === 1 ? "person" : "people"} · ${party.expenses.length} ${party.expenses.length === 1 ? "expense" : "expenses"}</span>
        </summary>
        <div class="saved-party-details">
          <section><h3>Expenses</h3><ul>${expenseRows}</ul></section>
          <section><h3>Settlement transfers</h3><ul>${transferRows}</ul></section>
        </div>
      </details>
    `;
  }).join("");
}

function savePartyToHistory() {
  if (data.people.length === 0 || data.expenses.length === 0) {
    showToast("Add people and at least one expense before saving this party to records.");
    return;
  }
  const snapshot = structuredClone({
    partyDate: data.partyDate,
    currency: data.currency,
    people: data.people,
    expenses: data.expenses,
  });
  if (data.history.some((record) => getPartySnapshotKey(record) === getPartySnapshotKey(snapshot))) {
    showToast("This party is already saved in the records.");
    return;
  }
  data.history.push({
    id: makeId("party-record"),
    recordedAt: new Date().toISOString(),
    ...snapshot,
  });
  saveData();
  renderRecordStatus();
  showToast(`Party from ${formatPartyDate(data.partyDate)} saved to records.`);
}

function hideToast() {
  elements.toast.classList.remove("visible");
  undoAction = null;
}

function showToast(message, onUndo = null) {
  elements.toastMessage.textContent = message;
  undoAction = onUndo;
  elements.toastUndo.hidden = !onUndo;
  elements.toast.classList.add("visible");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(hideToast, onUndo ? 6000 : 2600);
}

function snapshotParty() {
  return structuredClone({ people: data.people, expenses: data.expenses });
}

function restoreParty(snapshot) {
  data.people = snapshot.people;
  data.expenses = snapshot.expenses;
  editingExpenseId = null;
  render();
  saveData();
  showToast("Restored.");
}

function setTab(tab) {
  if (!TABS.includes(tab)) tab = "people";
  document.body.dataset.tab = tab;
  elements.tabs.forEach((button) => {
    if (button.dataset.tab === tab) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    // Remembering the tab is only a convenience.
  }
}

function getStoredTab() {
  try {
    return localStorage.getItem(TAB_KEY);
  } catch {
    return null;
  }
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 600px)").matches;
}

function startEditingExpense(expenseId) {
  const expense = data.expenses.find((item) => item.id === expenseId);
  if (!expense) return;
  editingExpenseId = expense.id;
  selectedPayerId = expense.payerId;
  elements.expenseForm.elements.description.value = expense.description;
  elements.expenseForm.elements.amount.value = (expense.amountCents / 100).toFixed(2);
  render();
  elements.expenseForm.scrollIntoView({ behavior: "smooth", block: "center" });
  elements.expenseForm.elements.description.focus({ preventScroll: true });
}

function stopEditingExpense() {
  editingExpenseId = null;
  elements.expenseForm.reset();
  render();
}

function getSettlementText() {
  const { total, paidByPerson } = getTotals();
  const shares = getShares(total, paidByPerson);
  const transfers = createTransfers(shares, paidByPerson);
  const share = data.people.length > 0 ? Math.round(total / data.people.length) : 0;
  return [
    `Get Together — party on ${formatPartyDate(data.partyDate)}`,
    `Total ${formatMoney(total)} · ${data.people.length} ${data.people.length === 1 ? "person" : "people"} · ${formatMoney(share)} each`,
    "",
    transfers.length > 0 ? "Settle up:" : "Everyone is settled up.",
    ...transfers.map((transfer) => `• ${transfer.from.name} pays ${transfer.to.name} ${formatMoney(transfer.amount)}`),
  ].join("\n");
}

async function shareSettlement() {
  const text = getSettlementText();
  try {
    if (navigator.share) {
      await navigator.share({ title: "Party settlement", text });
      return;
    }
    await navigator.clipboard.writeText(text);
    showToast("Settlement copied. Paste it in your group chat.");
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.error("Could not share the settlement.", error);
    showToast("Could not share. Try downloading the image instead.");
  }
}

function makeId(prefix) {
  nextId += 1;
  return `${prefix}-${Date.now()}-${nextId}`;
}

document.querySelector("#person-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#person-name");
  const name = input.value.trim();
  if (!name) return;
  if (data.people.some((person) => person.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    showToast("That person is already in the party.");
    input.focus();
    return;
  }
  data.people.push({ id: makeId("person"), name });
  input.value = "";
  render();
  saveData();
  input.focus();
});

document.querySelector("#expense-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (data.people.length === 0) {
    showToast("Add at least one person before adding an expense.");
    return;
  }
  const form = event.currentTarget;
  const formData = new FormData(form);
  const amount = Number(formData.get("amount"));
  const amountCents = Math.round(amount * 100);
  const description = String(formData.get("description")).trim();
  const payerId = String(formData.get("payer") ?? selectedPayerId);
  if (!description || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
    showToast("Enter an expense name and an amount greater than zero.");
    return;
  }
  if (!data.people.some((person) => person.id === payerId)) {
    showToast("Choose someone in the party who paid.");
    return;
  }
  const editingExpense = data.expenses.find((expense) => expense.id === editingExpenseId);
  if (editingExpense) {
    Object.assign(editingExpense, { description, payerId, amountCents });
    editingExpenseId = null;
    showToast(`Updated “${description}”.`);
  } else {
    data.expenses.push({ id: makeId("expense"), description, payerId, amountCents });
    showToast(`Added ${description} · ${formatMoney(amountCents)}.`);
  }
  selectedPayerId = payerId;
  form.reset();
  render();
  saveData();
});

elements.payerChips.addEventListener("change", (event) => {
  if (event.target.name === "payer") selectedPayerId = event.target.value;
});

elements.expenseCancel.addEventListener("click", stopEditingExpense);

elements.peopleList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-person]");
  if (!button) return;
  const person = data.people.find((item) => item.id === button.dataset.removePerson);
  if (!person) return;
  const snapshot = snapshotParty();
  const paidExpenses = data.expenses.filter((expense) => expense.payerId === person.id);
  data.people = data.people.filter((item) => item.id !== person.id);
  data.expenses = data.expenses.filter((expense) => expense.payerId !== person.id);
  render();
  saveData();
  const extra = paidExpenses.length > 0
    ? ` and ${paidExpenses.length} ${paidExpenses.length === 1 ? "expense" : "expenses"} they paid`
    : "";
  showToast(`Removed ${person.name}${extra}.`, () => restoreParty(snapshot));
});

elements.expenseList.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-expense]");
  if (editButton) {
    startEditingExpense(editButton.dataset.editExpense);
    return;
  }
  const button = event.target.closest("[data-remove-expense]");
  if (!button) return;
  const expense = data.expenses.find((item) => item.id === button.dataset.removeExpense);
  if (!expense) return;
  const snapshot = snapshotParty();
  if (editingExpenseId === expense.id) {
    editingExpenseId = null;
    elements.expenseForm.reset();
  }
  data.expenses = data.expenses.filter((item) => item.id !== expense.id);
  render();
  saveData();
  showToast(`Removed “${expense.description}”.`, () => restoreParty(snapshot));
});

elements.toastUndo.addEventListener("click", () => {
  const action = undoAction;
  hideToast();
  if (action) action();
});

elements.tabs.forEach((button) => button.addEventListener("click", () => {
  setTab(button.dataset.tab);
  window.scrollTo({ top: 0 });
}));

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-go-tab]");
  if (!link) return;
  setTab(link.dataset.goTab);
  if (isMobileLayout()) window.scrollTo({ top: 0 });
  if (link.dataset.focus) document.querySelector(link.dataset.focus)?.focus();
});

document.querySelector("#share-settlement").addEventListener("click", shareSettlement);

document.querySelector("#reset-button").addEventListener("click", () => {
  if (!window.confirm("Start a new party with the sample expenses? Saved party records will be kept.")) return;
  data = { ...structuredClone(SAMPLE_DATA), history: data.history };
  editingExpenseId = null;
  elements.expenseForm.reset();
  render();
  saveData();
  showToast("New party started. Saved party records were kept.");
});

document.querySelector("#download-report").addEventListener("click", downloadSettlementReport);
document.querySelector("#download-image").addEventListener("click", downloadSettlementImage);
elements.recordPartyButton.addEventListener("click", savePartyToHistory);
elements.viewRecordsButton.addEventListener("click", () => {
  const isOpening = elements.savedPartiesPanel.hidden;
  elements.savedPartiesPanel.hidden = !isOpening;
  elements.viewRecordsButton.setAttribute("aria-expanded", String(isOpening));
  if (isOpening) elements.savedPartiesPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
document.querySelector("#close-records").addEventListener("click", () => {
  elements.savedPartiesPanel.hidden = true;
  elements.viewRecordsButton.setAttribute("aria-expanded", "false");
  elements.viewRecordsButton.focus();
});

elements.currencySelect.addEventListener("change", (event) => {
  data.currency = event.currentTarget.value;
  render();
  saveData();
});

elements.partyDate.addEventListener("change", (event) => {
  const partyDate = event.currentTarget.value;
  if (!isValidDateString(partyDate)) {
    showToast("Choose a valid party date.");
    event.currentTarget.value = data.partyDate;
    return;
  }
  data.partyDate = partyDate;
  saveData();
  renderRecordStatus();
});

let installPrompt;
const installButton = document.querySelector("#install-app");
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  if (choice.outcome === "accepted") showToast("Get Together is being installed.");
  installPrompt = null;
  installButton.hidden = true;
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  installButton.hidden = true;
  showToast("Get Together is installed on this device.");
});

if (window.isSecureContext && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js")
    .catch((error) => console.error("Could not register offline app support.", error));
}

setTab(getStoredTab() ?? "people");
render();

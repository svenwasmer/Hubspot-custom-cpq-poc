const form = document.getElementById('quote-form');
const itemsBody = document.getElementById('items');
const rowTemplate = document.getElementById('item-row');
const totalEl = document.getElementById('total');
const statusEl = document.getElementById('form-status');
const submitBtn = document.getElementById('submit');
const quotesEl = document.getElementById('quotes');
const emptyEl = document.getElementById('empty');

const money = (n) => n.toFixed(2);

function addItem(values = {}) {
  const row = rowTemplate.content.firstElementChild.cloneNode(true);
  for (const [name, value] of Object.entries(values)) row.querySelector(`[name="${name}"]`).value = value;
  row.querySelector('.remove').addEventListener('click', () => {
    if (itemsBody.children.length > 1) row.remove();
    recalc();
  });
  itemsBody.append(row);
  recalc();
}

function readItems() {
  return [...itemsBody.children].map((row) => ({
    description: row.querySelector('[name="description"]').value.trim(),
    quantity: Number(row.querySelector('[name="quantity"]').value),
    unitPrice: Number(row.querySelector('[name="unitPrice"]').value),
  }));
}

function recalc() {
  let total = 0;
  [...itemsBody.children].forEach((row, i) => {
    const { quantity, unitPrice } = readItems()[i];
    const line = (quantity || 0) * (unitPrice || 0);
    row.querySelector('.line-total').textContent = money(line);
    total += line;
  });
  totalEl.textContent = money(total);
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) {
    const details = data?.details ? `\n${JSON.stringify(data.details, null, 2)}` : '';
    throw new Error(`${data?.error ?? res.statusText}${details}`);
  }
  return data;
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function renderQuotes(quotes) {
  emptyEl.hidden = quotes.length > 0;
  quotesEl.replaceChildren(...quotes.map((q) => {
    const copyBtn = el('button', { type: 'button', className: 'secondary small', textContent: 'Copy' });
    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(q.password);
      copyBtn.textContent = 'Copied';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    });

    const deleteBtn = el('button', { type: 'button', className: 'danger small', textContent: 'Delete page' });
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete the landing page for quote ${q.quoteNumber}?`)) return;
      deleteBtn.disabled = true;
      try {
        await api('DELETE', `/api/quotes/${q.id}`);
        await loadQuotes();
      } catch (err) {
        alert(`Delete failed: ${err.message}`);
        deleteBtn.disabled = false;
      }
    });

    return el('li', { className: 'quote' },
      el('div', { className: 'quote__head' },
        el('strong', { textContent: `${q.quoteNumber} · ${q.company}` }),
        el('span', { className: 'muted', textContent: `${money(q.total)} ${q.currency}` })),
      el('a', { href: q.url, target: '_blank', rel: 'noopener', textContent: q.url }),
      el('div', { className: 'quote__meta' },
        el('span', {}, 'Password: ', el('code', { textContent: q.password })), copyBtn,
        el('span', { className: 'muted', textContent: `Expires ${new Date(q.expiresAt).toLocaleDateString()}` })),
      el('div', { className: 'quote__actions' },
        el('a', { href: q.url, target: '_blank', rel: 'noopener', className: 'button small', textContent: 'Open' }),
        deleteBtn));
  }));
}

async function loadQuotes() {
  renderQuotes(await api('GET', '/api/quotes'));
}

itemsBody.addEventListener('input', recalc);
document.getElementById('add-item').addEventListener('click', () => addItem());

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const data = Object.fromEntries(new FormData(form));
  const quote = {
    quoteNumber: data.quoteNumber,
    currency: data.currency,
    customerName: data.customerName,
    company: data.company,
    notes: data.notes,
    lineItems: readItems(),
  };
  submitBtn.disabled = true;
  setStatus('Creating landing page in HubSpot…');
  try {
    const record = await api('POST', '/api/quotes', quote);
    setStatus(`Created ${record.url}`);
    form.reset();
    itemsBody.replaceChildren();
    addItem();
    await loadQuotes();
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    submitBtn.disabled = false;
  }
});

addItem({ description: 'Platform license (annual)', quantity: 1, unitPrice: 12000 });
loadQuotes().catch((err) => setStatus(`Could not load quotes: ${err.message}`, true));

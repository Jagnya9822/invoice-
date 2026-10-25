import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';

const app = express();
const PORT = process.env.PORT || 3001;
const dataDir = join(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true });
const db = new Database(join(dataDir, 'invoice.db'));

db.pragma('journal_mode = WAL');

const roundCurrency = (value) => {
  const decimal = new Decimal(value ?? 0);
  return Number(decimal.toDecimalPlaces(2).toFixed(2));
};

const safeSum = (values) => values.reduce((sum, current) => sum.plus(new Decimal(current ?? 0)), new Decimal(0));
const nonNegative = (value) => (new Decimal(value ?? 0).isNegative() ? new Decimal(0) : new Decimal(value ?? 0));

const calculateInvoiceTotals = ({ items = [], additionalCharges = 0, invoiceDiscount = 0 }) => {
  let subtotal = new Decimal(0);
  let igstTotal = new Decimal(0);
  let cgstTotal = new Decimal(0);
  let sgstTotal = new Decimal(0);

  for (const item of items) {
    const quantity = new Decimal(item.quantity ?? 0);
    const unitPrice = new Decimal(item.unitPrice ?? item.unit_price ?? 0);
    const lineDiscount = new Decimal(item.discount ?? 0);
    const taxableValue = nonNegative(quantity.mul(unitPrice).minus(lineDiscount));
    const igstRate = new Decimal(item.igstRate ?? item.igst_rate ?? 0).div(100);
    const cgstRate = new Decimal(item.cgstRate ?? item.cgst_rate ?? 0).div(100);
    const sgstRate = new Decimal(item.sgstRate ?? item.sgst_rate ?? 0).div(100);

    subtotal = subtotal.plus(taxableValue);
    igstTotal = igstTotal.plus(taxableValue.mul(igstRate));
    cgstTotal = cgstTotal.plus(taxableValue.mul(cgstRate));
    sgstTotal = sgstTotal.plus(taxableValue.mul(sgstRate));
  }

  const discountAmount = new Decimal(invoiceDiscount ?? 0);
  const taxTotal = igstTotal.plus(cgstTotal).plus(sgstTotal);
  const beforeTotal = subtotal.plus(taxTotal).plus(new Decimal(additionalCharges ?? 0));
  const total = nonNegative(beforeTotal.minus(discountAmount));

  return {
    subtotal: roundCurrency(subtotal),
    igstTax: roundCurrency(igstTotal),
    cgstTax: roundCurrency(cgstTotal),
    sgstTax: roundCurrency(sgstTotal),
    taxAmount: roundCurrency(taxTotal),
    invoiceDiscount: roundCurrency(discountAmount),
    additionalCharges: roundCurrency(additionalCharges ?? 0),
    total: roundCurrency(total),
  };
};

const defaultCompanyProfile = {
  id: 'default',
  legal_name: 'Shakti Tarinee Modern Rice Mill',
  display_name: 'Shakti Tarinee Modern Rice Mill',
  email: '',
  phone: '',
  website: '',
  address: '',
  billing_address: '',
  gstin: '',
  pan: '',
  bank_name: '',
  account_name: '',
  account_number: '',
  ifsc_code: '',
  payment_terms: 'Payable within agreed terms.',
  notes: '',
  footer: '',
  authorized_signatory: '',
  brand_color: '#7a4b1f',
  accent_color: '#d4a373',
};

const ensureSchema = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_profile (
      id TEXT PRIMARY KEY,
      legal_name TEXT,
      display_name TEXT,
      email TEXT,
      phone TEXT,
      website TEXT,
      address TEXT,
      billing_address TEXT,
      gstin TEXT,
      pan TEXT,
      bank_name TEXT,
      account_name TEXT,
      account_number TEXT,
      ifsc_code TEXT,
      payment_terms TEXT,
      notes TEXT,
      footer TEXT,
      authorized_signatory TEXT,
      brand_color TEXT,
      accent_color TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      company TEXT,
      email TEXT,
      phone TEXT,
      billing_address TEXT,
      shipping_address TEXT,
      tax_id TEXT,
      is_archived INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      variety TEXT,
      unit TEXT,
      default_rate REAL DEFAULT 0,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT UNIQUE,
      customer_id TEXT,
      issue_date TEXT,
      due_date TEXT,
      status TEXT,
      notes TEXT,
      terms TEXT,
      po_number TEXT,
      reference TEXT,
      buyer_address TEXT,
      buyer_gstin TEXT,
      advance_received REAL DEFAULT 0,
      previous_balance REAL DEFAULT 0,
      additional_charges REAL DEFAULT 0,
      invoice_discount REAL DEFAULT 0,
      subtotal REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      amount_paid REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      currency TEXT DEFAULT 'INR',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT,
      product_name TEXT,
      code TEXT,
      description TEXT,
      variety TEXT,
      grade TEXT,
      quantity REAL,
      unit TEXT,
      unit_price REAL,
      bags INTEGER,
      bag_weight REAL,
      packaging TEXT,
      discount REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      loading_charges REAL DEFAULT 0,
      transportation_charges REAL DEFAULT 0,
      amount REAL,
      tax_amount REAL,
      total REAL,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      invoice_id TEXT,
      payment_date TEXT,
      amount REAL,
      method TEXT,
      reference TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      invoice_id TEXT,
      action TEXT,
      details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const addColumnIfMissing = (tableName, columnName, columnDefinition) => {
    try {
      db.prepare(`SELECT ${columnName} FROM ${tableName} LIMIT 1`).get();
    } catch {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
    }
  };

  addColumnIfMissing('invoices', 'buyer_address', 'buyer_address TEXT');
  addColumnIfMissing('invoices', 'buyer_gstin', 'buyer_gstin TEXT');
  addColumnIfMissing('invoices', 'advance_received', 'advance_received REAL DEFAULT 0');
  addColumnIfMissing('invoices', 'previous_balance', 'previous_balance REAL DEFAULT 0');

  addColumnIfMissing('invoice_items', 'product_name', 'product_name TEXT');
  addColumnIfMissing('invoice_items', 'variety', 'variety TEXT');
  addColumnIfMissing('invoice_items', 'grade', 'grade TEXT');
  addColumnIfMissing('invoice_items', 'bags', 'bags INTEGER');
  addColumnIfMissing('invoice_items', 'bag_weight', 'bag_weight REAL');
  addColumnIfMissing('invoice_items', 'packaging', 'packaging TEXT');
  addColumnIfMissing('invoice_items', 'loading_charges', 'loading_charges REAL DEFAULT 0');
  addColumnIfMissing('invoice_items', 'transportation_charges', 'transportation_charges REAL DEFAULT 0');

  const companyRow = db.prepare('SELECT * FROM company_profile WHERE id = ?').get('default');
  if (!companyRow) {
    db.prepare(`
      INSERT INTO company_profile (
        id, legal_name, display_name, email, phone, website, address, billing_address,
        gstin, pan, bank_name, account_name, account_number, ifsc_code, payment_terms,
        notes, footer, authorized_signatory, brand_color, accent_color
      ) VALUES (
        @id, @legal_name, @display_name, @email, @phone, @website, @address, @billing_address,
        @gstin, @pan, @bank_name, @account_name, @account_number, @ifsc_code, @payment_terms,
        @notes, @footer, @authorized_signatory, @brand_color, @accent_color
      )
    `).run(defaultCompanyProfile);
  }

  const productCount = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
  if (productCount === 0) {
    db.exec(`
      INSERT INTO products (id, name, variety, unit, default_rate, description)
      VALUES
        ('prod-1', 'Paddy', 'Sona Masoori', 'quintal', 2450, 'Mill-run rice suitable for regular trading and local supply.'),
        ('prod-2', 'Rice', 'Basmati', 'quintal', 3650, 'Premium basmati grain for retail and export-oriented orders.'),
        ('prod-3', 'Broken Rice', 'Grade A', 'quintal', 1750, 'Broken rice used for feed and industrial processing.'),
        ('prod-4', 'Rice Bran', 'By-product', 'kg', 38, 'Processing by-product used for animal feed.' );
    `);
  }

  const customerCount = db.prepare('SELECT COUNT(*) AS count FROM customers').get().count;
  if (customerCount === 0) {
    db.exec(`
      INSERT INTO customers (id, name, company, email, phone, billing_address, shipping_address, tax_id)
      VALUES
        ('cust-1', 'Ramesh Kumar', 'Green Valley Traders', 'ramesh@greenvalley.in', '+91 98765 12345', 'Banjara Hills, Hyderabad', 'Banjara Hills, Hyderabad', '36AAACG1234Q1Z8'),
        ('cust-2', 'Neha Singh', 'Kaveri Agro Supply', 'neha@kaveriagro.in', '+91 98111 45678', 'Madhapur, Hyderabad', 'Madhapur, Hyderabad', '36AABCK9876F1Z7');

      INSERT INTO invoices (id, invoice_number, customer_id, issue_date, due_date, status, notes, terms, po_number, reference, buyer_address, buyer_gstin, advance_received, previous_balance, additional_charges, invoice_discount, subtotal, tax_amount, total, amount_paid, balance, currency)
      VALUES
        ('inv-1', 'INV-2026-0001', 'cust-1', '2026-10-01', '2026-10-15', 'paid', 'Advance received against rice dispatch.', 'Payable within agreed terms.', 'PO-1101', 'SO-4401', 'Banjara Hills, Hyderabad', '36AAACG1234Q1Z8', 80000, 0, 2500, 0, 173450, 31221, 207171, 207171, 0, 'INR'),
        ('inv-2', 'INV-2026-0002', 'cust-2', '2026-10-08', '2026-10-22', 'partial', 'Rice dispatch for bulk supply order.', 'Payable within agreed terms.', 'PO-1120', 'SO-4455', 'Madhapur, Hyderabad', '36AABCK9876F1Z7', 50000, 12000, 0, 1500, 184500, 33100, 217100, 70000, 147100, 'INR');

      INSERT INTO invoice_items (id, invoice_id, product_name, code, description, variety, grade, quantity, unit, unit_price, bags, bag_weight, packaging, discount, tax_rate, loading_charges, transportation_charges, amount, tax_amount, total)
      VALUES
        ('item-1', 'inv-1', 'Paddy', 'PADDY-001', 'Sona Masoori paddy supply', 'Sona Masoori', 'Grade A', 95, 'quintal', 2450, 190, 50, 'Jute bag', 0, 5, 1200, 3000, 232750, 11637.5, 244387.5),
        ('item-2', 'inv-1', 'Rice', 'RICE-003', 'Basmati rice supply', 'Basmati', 'Premium', 35, 'quintal', 3650, 70, 50, 'PP bag', 0, 5, 800, 1500, 127750, 6387.5, 134137.5),
        ('item-3', 'inv-2', 'Rice', 'RICE-004', 'Bulk basmati supply', 'Basmati', 'Premium', 48, 'quintal', 3600, 96, 50, 'PP bag', 1500, 5, 1200, 2200, 172800, 8640, 181440),
        ('item-4', 'inv-2', 'Rice Bran', 'RB-010', 'Rice bran by-product supply', 'By-product', 'Standard', 200, 'kg', 38, 4, 50, 'HDPE bag', 0, 0, 0, 0, 7600, 0, 7600);

      INSERT INTO payments (id, invoice_id, payment_date, amount, method, reference, notes)
      VALUES
        ('pay-1', 'inv-1', '2026-10-03', 206671, 'Bank Transfer', 'UTR-1001', 'Full settlement'),
        ('pay-2', 'inv-2', '2026-10-12', 70000, 'Bank Transfer', 'UTR-2207', 'Partial payment');
    `);
  }
};

const generateInvoiceNumber = () => {
  const year = new Date().getFullYear();
  const record = db.prepare(`
    SELECT COALESCE(MAX(CAST(substr(invoice_number, -4) AS INTEGER)), 0) AS last_number
    FROM invoices
    WHERE invoice_number LIKE ?
  `).get(`INV-${year}-%`);

  const next = Number(record?.last_number || 0) + 1;
  return `INV-${year}-${String(next).padStart(4, '0')}`;
};

const getCompanyProfile = () => db.prepare('SELECT * FROM company_profile WHERE id = ?').get('default');

const getCustomerById = (customerId) => db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);

const getInvoiceDetail = (invoiceId) => {
  const invoice = db.prepare(`
    SELECT i.*, c.name AS customer_name, c.company AS customer_company, c.email AS customer_email,
           c.phone AS customer_phone, c.billing_address AS customer_billing_address,
           c.tax_id AS customer_tax_id
    FROM invoices i
    LEFT JOIN customers c ON c.id = i.customer_id
    WHERE i.id = ?
  `).get(invoiceId);

  if (!invoice) return null;

  invoice.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY rowid').all(invoiceId);
  invoice.payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC').all(invoiceId);
  return invoice;
};

const updateInvoiceBalance = (invoiceId) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  if (!invoice) return null;

  const paymentTotal = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE invoice_id = ?').get(invoiceId).total_paid;
  const balance = roundCurrency(Number(invoice.total) - Number(paymentTotal));
  const nextStatus = Number(balance) <= 0 ? 'paid' : Number(balance) === Number(invoice.total) ? 'unpaid' : 'partial';

  db.prepare('UPDATE invoices SET amount_paid = ?, balance = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(paymentTotal, balance, nextStatus, invoiceId);
  return { ...invoice, amount_paid: paymentTotal, balance, status: nextStatus };
};

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const distDir = join(process.cwd(), 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api).*/, (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(join(distDir, 'index.html'));
  });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: 'ready' });
});

app.get('/api/company', (_req, res) => {
  const company = getCompanyProfile();
  res.json(company);
});

app.post('/api/company', (req, res) => {
  const payload = req.body || {};
  db.prepare(`
    UPDATE company_profile
    SET legal_name = @legal_name,
        display_name = @display_name,
        email = @email,
        phone = @phone,
        website = @website,
        address = @address,
        billing_address = @billing_address,
        gstin = @gstin,
        pan = @pan,
        bank_name = @bank_name,
        account_name = @account_name,
        account_number = @account_number,
        ifsc_code = @ifsc_code,
        payment_terms = @payment_terms,
        notes = @notes,
        footer = @footer,
        authorized_signatory = @authorized_signatory,
        brand_color = @brand_color,
        accent_color = @accent_color
    WHERE id = 'default'
  `).run({
    ...defaultCompanyProfile,
    ...payload,
    id: 'default',
  });

  res.json(getCompanyProfile());
});

app.get('/api/customers', (_req, res) => {
  const customers = db.prepare('SELECT * FROM customers ORDER BY created_at DESC').all();
  res.json(customers);
});

app.post('/api/customers', (req, res) => {
  const { name, company, email, phone, billingAddress, shippingAddress, taxId } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Customer name is required.' });
  }

  const id = `cust-${uuidv4()}`;
  const customer = {
    id,
    name: name.trim(),
    company: company || '',
    email: email || '',
    phone: phone || '',
    billing_address: billingAddress || '',
    shipping_address: shippingAddress || '',
    tax_id: taxId || '',
  };

  db.prepare(`
    INSERT INTO customers (id, name, company, email, phone, billing_address, shipping_address, tax_id)
    VALUES (@id, @name, @company, @email, @phone, @billing_address, @shipping_address, @tax_id)
  `).run(customer);

  res.status(201).json(customer);
});

app.get('/api/products', (_req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json(products);
});

app.post('/api/products', (req, res) => {
  const payload = req.body || {};
  const name = String(payload.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Product name is required.' });
  }

  const product = {
    id: `prod-${uuidv4()}`,
    name,
    variety: payload.variety || '',
    unit: payload.unit || 'kg',
    default_rate: Number(payload.defaultRate || 0),
    description: payload.description || '',
  };

  db.prepare(`
    INSERT INTO products (id, name, variety, unit, default_rate, description)
    VALUES (@id, @name, @variety, @unit, @default_rate, @description)
  `).run(product);

  res.status(201).json(product);
});

app.get('/api/invoices', (_req, res) => {
  const invoices = db.prepare(`
    SELECT i.*, c.name AS customer_name, c.company AS customer_company
    FROM invoices i
    LEFT JOIN customers c ON c.id = i.customer_id
    ORDER BY i.issue_date DESC, i.created_at DESC
  `).all();

  res.json(invoices);
});

app.get('/api/invoices/:id', (req, res) => {
  const invoice = getInvoiceDetail(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  res.json(invoice);
});

app.post('/api/invoices', (req, res) => {
  const payload = req.body || {};
  const customerId = payload.customerId || payload.customer_id;
  const customer = getCustomerById(customerId);
  if (!customer) return res.status(400).json({ error: 'Customer not found.' });

  const items = (payload.items || []).map((item) => ({
    id: `line-${uuidv4()}`,
    productName: item.productName || item.product_name || item.description || '',
    code: item.code || '',
    description: item.description || '',
    variety: item.variety || '',
    grade: item.grade || '',
    quantity: Number(item.quantity || 0),
    unit: item.unit || 'kg',
    unitPrice: Number(item.unitPrice || item.unit_price || 0),
    bags: Number(item.bags || 0),
    bagWeight: Number(item.bagWeight || item.bag_weight || 0),
    packaging: item.packaging || '',
    discount: Number(item.discount || 0),
    taxRate: Number(item.taxRate || item.tax_rate || (Number(item.igstRate || 0) + Number(item.cgstRate || 0) + Number(item.sgstRate || 0))),
    igstRate: Number(item.igstRate || item.igst_rate || 0),
    cgstRate: Number(item.cgstRate || item.cgst_rate || 0),
    sgstRate: Number(item.sgstRate || item.sgst_rate || 0),
    loadingCharges: Number(item.loadingCharges || item.loading_charges || 0),
    transportationCharges: Number(item.transportationCharges || item.transportation_charges || 0),
  }));

  const totals = calculateInvoiceTotals({
    items,
    additionalCharges: Number(payload.additionalCharges || 0) + Number(payload.transportCharges || 0) + Number(payload.loadingCharges || 0),
    invoiceDiscount: Number(payload.invoiceDiscount || 0),
  });

  const invoiceId = `inv-${uuidv4()}`;
  const invoiceNumber = generateInvoiceNumber();
  const issueDate = payload.issueDate || new Date().toISOString().slice(0, 10);
  const dueDate = payload.dueDate || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  db.prepare(`
    INSERT INTO invoices (
      id, invoice_number, customer_id, issue_date, due_date, status, notes, terms,
      po_number, reference, buyer_address, buyer_gstin, advance_received, previous_balance,
      additional_charges, invoice_discount, subtotal, tax_amount, total, amount_paid,
      balance, currency, created_at, updated_at
    ) VALUES (
      @id, @invoice_number, @customer_id, @issue_date, @due_date, @status, @notes, @terms,
      @po_number, @reference, @buyer_address, @buyer_gstin, @advance_received, @previous_balance,
      @additional_charges, @invoice_discount, @subtotal, @tax_amount, @total, @amount_paid,
      @balance, @currency, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run({
    id: invoiceId,
    invoice_number: invoiceNumber,
    customer_id: customerId,
    issue_date: issueDate,
    due_date: dueDate,
    status: payload.status || 'draft',
    notes: payload.notes || '',
    terms: payload.terms || 'Payable within agreed terms.',
    po_number: payload.poNumber || '',
    reference: payload.reference || '',
    buyer_address: payload.buyerAddress || customer.billing_address || '',
    buyer_gstin: payload.buyerGstin || customer.tax_id || '',
    advance_received: Number(payload.advanceReceived || 0),
    previous_balance: Number(payload.previousBalance || 0),
    additional_charges: totals.additionalCharges,
    invoice_discount: totals.invoiceDiscount,
    subtotal: totals.subtotal,
    tax_amount: totals.taxAmount,
    total: totals.total,
    amount_paid: 0,
    balance: totals.total,
    currency: payload.currency || 'INR',
  });

  const insertItem = db.prepare(`
    INSERT INTO invoice_items (
      id, invoice_id, product_name, code, description, variety, grade, quantity, unit,
      unit_price, bags, bag_weight, packaging, discount, tax_rate, loading_charges,
      transportation_charges, amount, tax_amount, total
    ) VALUES (
      @id, @invoice_id, @product_name, @code, @description, @variety, @grade, @quantity, @unit,
      @unit_price, @bags, @bag_weight, @packaging, @discount, @tax_rate, @loading_charges,
      @transportation_charges, @amount, @tax_amount, @total
    )
  `);

  for (const item of items) {
    const lineSubtotal = nonNegative(new Decimal(item.quantity || 0).mul(item.unitPrice || 0).minus(item.discount || 0));
    const igstTax = lineSubtotal.mul(new Decimal(item.igstRate || 0).div(100));
    const cgstTax = lineSubtotal.mul(new Decimal(item.cgstRate || 0).div(100));
    const sgstTax = lineSubtotal.mul(new Decimal(item.sgstRate || 0).div(100));
    const itemTaxAmount = igstTax.plus(cgstTax).plus(sgstTax);
    const itemTotal = lineSubtotal.plus(itemTaxAmount).plus(new Decimal(item.loadingCharges || 0)).plus(new Decimal(item.transportationCharges || 0));

    insertItem.run({
      id: `line-${uuidv4()}`,
      invoice_id: invoiceId,
      product_name: item.productName || item.description || '',
      code: item.code || '',
      description: item.description || '',
      variety: item.variety || '',
      grade: item.grade || '',
      quantity: Number(item.quantity || 0),
      unit: item.unit || 'kg',
      unit_price: Number(item.unitPrice || 0),
      bags: Number(item.bags || 0),
      bag_weight: Number(item.bagWeight || 0),
      packaging: item.packaging || '',
      discount: Number(item.discount || 0),
      tax_rate: Number(item.taxRate || (Number(item.igstRate || 0) + Number(item.cgstRate || 0) + Number(item.sgstRate || 0))),
      loading_charges: Number(item.loadingCharges || 0),
      transportation_charges: Number(item.transportationCharges || 0),
      amount: roundCurrency(lineSubtotal),
      tax_amount: roundCurrency(itemTaxAmount),
      total: roundCurrency(itemTotal),
    });
  }

  db.prepare('INSERT INTO audit_log (id, invoice_id, action, details) VALUES (?, ?, ?, ?)')
    .run(`audit-${uuidv4()}`, invoiceId, 'created', JSON.stringify({ invoice_number: invoiceNumber, status: payload.status || 'draft' }));

  const invoice = getInvoiceDetail(invoiceId);
  res.status(201).json(invoice);
});

app.post('/api/invoices/:id/payments', (req, res) => {
  const { amount, method, reference, notes, paymentDate } = req.body || {};
  const invoiceId = req.params.id;

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
  }

  const payment = {
    id: `pay-${uuidv4()}`,
    invoice_id: invoiceId,
    payment_date: paymentDate || new Date().toISOString().slice(0, 10),
    amount: Number(amount),
    method: method || 'Bank Transfer',
    reference: reference || '',
    notes: notes || '',
  };

  db.prepare(`
    INSERT INTO payments (id, invoice_id, payment_date, amount, method, reference, notes)
    VALUES (@id, @invoice_id, @payment_date, @amount, @method, @reference, @notes)
  `).run(payment);

  const updatedInvoice = updateInvoiceBalance(invoiceId);
  db.prepare('INSERT INTO audit_log (id, invoice_id, action, details) VALUES (?, ?, ?, ?)')
    .run(`audit-${uuidv4()}`, invoiceId, 'payment', JSON.stringify({ amount: payment.amount, method: payment.method, reference: payment.reference }));

  res.status(201).json(updatedInvoice);
});

app.get('/api/overview', (_req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total_invoices,
      COALESCE(SUM(total), 0) AS total_invoiced,
      COALESCE(SUM(amount_paid), 0) AS amount_received,
      COALESCE(SUM(balance), 0) AS outstanding,
      SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft_invoices,
      SUM(CASE WHEN status IN ('partial', 'unpaid') AND balance > 0 THEN 1 ELSE 0 END) AS overdue_invoices
    FROM invoices
  `).get();

  const recentInvoices = db.prepare(`
    SELECT i.*, c.name AS customer_name
    FROM invoices i
    LEFT JOIN customers c ON c.id = i.customer_id
    ORDER BY i.issue_date DESC
    LIMIT 5
  `).all();

  const chartData = db.prepare(`
    SELECT strftime('%Y-%m', issue_date) AS month,
           COALESCE(SUM(total), 0) AS revenue,
           COALESCE(SUM(amount_paid), 0) AS received
    FROM invoices
    GROUP BY strftime('%Y-%m', issue_date)
    ORDER BY month ASC
    LIMIT 6
  `).all();

  const customers = db.prepare('SELECT * FROM customers ORDER BY created_at DESC LIMIT 6').all();

  res.json({ stats, recentInvoices, chartData, customers });
});

app.get('/api/reports', (_req, res) => {
  const summary = db.prepare(`
    SELECT c.name AS customer_name, COUNT(i.id) AS invoice_count, COALESCE(SUM(i.total), 0) AS total_billed, COALESCE(SUM(i.amount_paid), 0) AS total_paid, COALESCE(SUM(i.balance), 0) AS balance
    FROM customers c
    LEFT JOIN invoices i ON i.customer_id = c.id
    GROUP BY c.id, c.name
    ORDER BY total_billed DESC
  `).all();

  const taxSummary = db.prepare(`
    SELECT strftime('%Y-%m', issue_date) AS month, COALESCE(SUM(tax_amount), 0) AS tax_collected
    FROM invoices
    GROUP BY month
    ORDER BY month DESC
    LIMIT 6
  `).all();

  res.json({ summary, taxSummary });
});


ensureSchema();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Invoice management API running on http://0.0.0.0:${PORT}`);
});

import { useEffect, useMemo, useState } from 'react';
import './App.css';

const API = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3001/api');

const readJson = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(text ? text.slice(0, 180) : 'Unexpected server response.');
  }
  return response.json();
};

const formatCurrency = (value) => {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(numeric);
};

const formatDate = (date) => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const createEmptyRow = () => ({
  description: '',
  hsn: '',
  quantity: 1,
  rate: 0,
  igst: 0,
  cgst: 0,
  sgst: 0,
});

const buildInitialCompany = () => ({
  legal_name: 'Shakti Tarinee Modern Rice Mill',
  display_name: 'Shakti Tarinee Modern Rice Mill',
  email: '',
  phone: '',
  website: '',
  address: 'AT: Talagadakuhudi, Po: Chandeswar, Khordha-752023, Odisha, India',
  billing_address: '',
  gstin: '21ACJFS9898R1ZU',
  pan: '',
  bank_name: '',
  account_name: '',
  account_number: '',
  ifsc_code: '',
  payment_terms: '',
  notes: '',
  footer: '',
  authorized_signatory: '',
  brand_color: '#173b5b',
  accent_color: '#0f766e',
});

const buildInitialForm = () => ({
  invoiceNo: 'INV-2026-0001',
  invoiceDate: new Date().toISOString().slice(0, 10),
  dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 15).toISOString().slice(0, 10),
  buyerName: '',
  buyerCompany: '',
  buyerAddress: '',
  buyerGstin: '',
  phone: '',
  place: '',
  transport: '',
  transportId: '',
  challanNo: '',
  challanDate: '',
  eWayNo: '',
  rows: [createEmptyRow()],
  terms: '',
  notes: '',
  bankName: '',
  accountName: '',
  accountNumber: '',
  ifscCode: '',
  upi: '',
  signature: '',
});

function App() {
  const [company, setCompany] = useState(buildInitialCompany());
  const [companySettingsOpen, setCompanySettingsOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState('landing');
  const [invoiceForm, setInvoiceForm] = useState(buildInitialForm());
  const [alert, setAlert] = useState('');
  const [savedInvoiceId, setSavedInvoiceId] = useState(null);

  useEffect(() => {
    const loadCompany = async () => {
      try {
        const response = await fetch(`${API}/company`);
        const data = await readJson(response);
        if (data) {
          setCompany({ ...buildInitialCompany(), ...data });
        }
      } catch (error) {
        setCompany(buildInitialCompany());
      }
    };
    loadCompany();
  }, []);

  const totals = useMemo(() => {
    const rows = invoiceForm.rows.map((row) => {
      const quantity = Number(row.quantity || 0);
      const rate = Number(row.rate || 0);
      const taxable = quantity * rate;
      const igstAmount = taxable * (Number(row.igst || 0) / 100);
      const cgstAmount = taxable * (Number(row.cgst || 0) / 100);
      const sgstAmount = taxable * (Number(row.sgst || 0) / 100);
      const total = taxable + igstAmount + cgstAmount + sgstAmount;
      return { taxable, igstAmount, cgstAmount, sgstAmount, total };
    });

    const subtotal = rows.reduce((sum, row) => sum + row.taxable, 0);
    const igstTotal = rows.reduce((sum, row) => sum + row.igstAmount, 0);
    const cgstTotal = rows.reduce((sum, row) => sum + row.cgstAmount, 0);
    const sgstTotal = rows.reduce((sum, row) => sum + row.sgstAmount, 0);
    const total = subtotal + igstTotal + cgstTotal + sgstTotal;

    return { rows, subtotal, igstTotal, cgstTotal, sgstTotal, total };
  }, [invoiceForm.rows]);

  const updateRow = (index, field, value) => {
    setInvoiceForm((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)),
    }));
  };

  const addRow = () => {
    setInvoiceForm((current) => ({ ...current, rows: [...current.rows, createEmptyRow()] }));
  };

  const removeRow = (index) => {
    setInvoiceForm((current) => ({
      ...current,
      rows: current.rows.filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const saveCompanySettings = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch(`${API}/company`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...company }),
      });
      if (!response.ok) {
        throw new Error('Unable to save company settings.');
      }
      const updated = await readJson(response);
      setCompany({ ...buildInitialCompany(), ...updated });
      setAlert('Company settings saved.');
    } catch (error) {
      setAlert(error.message || 'Company settings could not be saved.');
    }
  };

  const handleSaveInvoice = async () => {
    try {
      if (!invoiceForm.buyerName.trim()) {
        throw new Error('Buyer name is required.');
      }

      const customerPayload = {
        name: invoiceForm.buyerName,
        company: invoiceForm.buyerCompany || '',
        phone: invoiceForm.phone || '',
        billingAddress: invoiceForm.buyerAddress || '',
        shippingAddress: invoiceForm.buyerAddress || '',
        taxId: invoiceForm.buyerGstin || '',
      };

      const customerResponse = await fetch(`${API}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customerPayload),
      });

      if (!customerResponse.ok) {
        const error = await readJson(customerResponse).catch(() => ({ error: 'Buyer could not be saved.' }));
        throw new Error(error.error || 'Buyer could not be saved.');
      }

      const customer = await readJson(customerResponse);
      const invoicePayload = {
        customerId: customer.id,
        issueDate: invoiceForm.invoiceDate,
        dueDate: invoiceForm.dueDate,
        buyerAddress: invoiceForm.buyerAddress,
        buyerGstin: invoiceForm.buyerGstin,
        notes: invoiceForm.notes,
        terms: invoiceForm.terms,
        poNumber: invoiceForm.challanNo,
        reference: invoiceForm.eWayNo,
        additionalCharges: 0,
        invoiceDiscount: 0,
        status: 'draft',
        items: invoiceForm.rows.map((row) => ({
          description: row.description,
          quantity: Number(row.quantity || 0),
          unit: 'NOS',
          unitPrice: Number(row.rate || 0),
          discount: 0,
          igstRate: Number(row.igst || 0),
          cgstRate: Number(row.cgst || 0),
          sgstRate: Number(row.sgst || 0),
          taxRate: Number(row.igst || 0) + Number(row.cgst || 0) + Number(row.sgst || 0),
        })),
      };

      const invoiceResponse = await fetch(`${API}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoicePayload),
      });

      if (!invoiceResponse.ok) {
        const error = await readJson(invoiceResponse).catch(() => ({ error: 'Invoice could not be created.' }));
        throw new Error(error.error || 'Invoice could not be created.');
      }

      const invoice = await readJson(invoiceResponse);
      setSavedInvoiceId(invoice.id);
      setAlert('Invoice prepared successfully.');
      window.open(`${API}/invoices/${invoice.id}/pdf`, '_blank');
    } catch (error) {
      setAlert(error.message || 'Invoice could not be created.');
    }
  };

  const handleCompanyValue = (field, value) => {
    setCompany((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="app-shell">
      {currentPage === 'landing' ? (
        <div className="landing-page">
          <div className="landing-card">
            <span className="eyebrow">Business invoice maker</span>
            <h1>{company.display_name || 'Shakti Tarinee Modern Rice Mill'}</h1>
            <p>Simple and professional billing for rice milling and trading transactions.</p>
            <div className="landing-actions">
              <button type="button" className="primary-button" onClick={() => setCurrentPage('invoice')}>Create Invoice</button>
              <button type="button" className="secondary-button" onClick={() => setCompanySettingsOpen(true)}>Company Settings</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="invoice-page">
          <header className="invoice-topbar">
            <button type="button" className="ghost-button" onClick={() => setCurrentPage('landing')}>Back</button>
            <div>
              <p className="eyebrow">Invoice maker</p>
              <h2>{company.display_name || 'Shakti Tarinee Modern Rice Mill'}</h2>
            </div>
            <div className="header-actions">
              <button type="button" className="secondary-button" onClick={() => setCompanySettingsOpen(true)}>Company Settings</button>
              <button type="button" className="primary-button" onClick={handleSaveInvoice}>Save & Download</button>
            </div>
          </header>

          {alert && <div className="alert-banner">{alert}</div>}

          <div className="invoice-editor">
            <div className="form-panel">
              <div className="field-grid two-col">
                <label>
                  Invoice no.
                  <input value={invoiceForm.invoiceNo} onChange={(event) => setInvoiceForm((current) => ({ ...current, invoiceNo: event.target.value }))} />
                </label>
                <label>
                  Invoice date
                  <input type="date" value={invoiceForm.invoiceDate} onChange={(event) => setInvoiceForm((current) => ({ ...current, invoiceDate: event.target.value }))} />
                </label>
                <label>
                  Due date
                  <input type="date" value={invoiceForm.dueDate} onChange={(event) => setInvoiceForm((current) => ({ ...current, dueDate: event.target.value }))} />
                </label>
                <label>
                  Buyer name
                  <input value={invoiceForm.buyerName} onChange={(event) => setInvoiceForm((current) => ({ ...current, buyerName: event.target.value }))} />
                </label>
                <label>
                  Buyer company
                  <input value={invoiceForm.buyerCompany} onChange={(event) => setInvoiceForm((current) => ({ ...current, buyerCompany: event.target.value }))} />
                </label>
                <label>
                  Buyer GSTIN
                  <input value={invoiceForm.buyerGstin} onChange={(event) => setInvoiceForm((current) => ({ ...current, buyerGstin: event.target.value }))} />
                </label>
                <label className="full-span">
                  Buyer address
                  <textarea rows="3" value={invoiceForm.buyerAddress} onChange={(event) => setInvoiceForm((current) => ({ ...current, buyerAddress: event.target.value }))} />
                </label>
                <label>
                  Phone
                  <input value={invoiceForm.phone} onChange={(event) => setInvoiceForm((current) => ({ ...current, phone: event.target.value }))} />
                </label>
                <label>
                  Place of supply
                  <input value={invoiceForm.place} onChange={(event) => setInvoiceForm((current) => ({ ...current, place: event.target.value }))} />
                </label>
                <label>
                  Transport
                  <input value={invoiceForm.transport} onChange={(event) => setInvoiceForm((current) => ({ ...current, transport: event.target.value }))} />
                </label>
                <label>
                  Transport ID
                  <input value={invoiceForm.transportId} onChange={(event) => setInvoiceForm((current) => ({ ...current, transportId: event.target.value }))} />
                </label>
                <label>
                  Challan no.
                  <input value={invoiceForm.challanNo} onChange={(event) => setInvoiceForm((current) => ({ ...current, challanNo: event.target.value }))} />
                </label>
                <label>
                  Challan date
                  <input type="date" value={invoiceForm.challanDate} onChange={(event) => setInvoiceForm((current) => ({ ...current, challanDate: event.target.value }))} />
                </label>
                <label>
                  E-way bill no.
                  <input value={invoiceForm.eWayNo} onChange={(event) => setInvoiceForm((current) => ({ ...current, eWayNo: event.target.value }))} />
                </label>
              </div>

              <div className="item-table-wrap">
                <div className="table-header-row">
                  <span>Item</span>
                  <span>HSN</span>
                  <span>Qty</span>
                  <span>Rate</span>
                  <span>IGST %</span>
                  <span>CGST %</span>
                  <span>SGST %</span>
                  <span>Amount</span>
                  <span></span>
                </div>

                {invoiceForm.rows.map((row, index) => (
                  <div key={index} className="item-row">
                    <input value={row.description} onChange={(event) => updateRow(index, 'description', event.target.value)} placeholder="Rice variety / item" />
                    <input value={row.hsn} onChange={(event) => updateRow(index, 'hsn', event.target.value)} placeholder="HSN" />
                    <input type="number" value={row.quantity} onChange={(event) => updateRow(index, 'quantity', event.target.value)} />
                    <input type="number" value={row.rate} onChange={(event) => updateRow(index, 'rate', event.target.value)} />
                    <input type="number" value={row.igst} onChange={(event) => updateRow(index, 'igst', event.target.value)} />
                    <input type="number" value={row.cgst} onChange={(event) => updateRow(index, 'cgst', event.target.value)} />
                    <input type="number" value={row.sgst} onChange={(event) => updateRow(index, 'sgst', event.target.value)} />
                    <strong>{formatCurrency(totals.rows[index]?.total || 0)}</strong>
                    <button type="button" className="remove-row" onClick={() => removeRow(index)}>Remove</button>
                  </div>
                ))}

                <button type="button" className="secondary-button add-row-button" onClick={addRow}>+ Add item</button>
              </div>

              <div className="field-grid two-col">
                <label>
                  Bank name
                  <input value={invoiceForm.bankName} onChange={(event) => setInvoiceForm((current) => ({ ...current, bankName: event.target.value }))} />
                </label>
                <label>
                  Account name
                  <input value={invoiceForm.accountName} onChange={(event) => setInvoiceForm((current) => ({ ...current, accountName: event.target.value }))} />
                </label>
                <label>
                  Account no.
                  <input value={invoiceForm.accountNumber} onChange={(event) => setInvoiceForm((current) => ({ ...current, accountNumber: event.target.value }))} />
                </label>
                <label>
                  IFSC code
                  <input value={invoiceForm.ifscCode} onChange={(event) => setInvoiceForm((current) => ({ ...current, ifscCode: event.target.value }))} />
                </label>
                <label>
                  UPI ID
                  <input value={invoiceForm.upi} onChange={(event) => setInvoiceForm((current) => ({ ...current, upi: event.target.value }))} />
                </label>
                <label>
                  Signature / name
                  <input value={invoiceForm.signature} onChange={(event) => setInvoiceForm((current) => ({ ...current, signature: event.target.value }))} />
                </label>
                <label className="full-span">
                  Notes
                  <textarea rows="2" value={invoiceForm.notes} onChange={(event) => setInvoiceForm((current) => ({ ...current, notes: event.target.value }))} />
                </label>
                <label className="full-span">
                  Terms & conditions
                  <textarea rows="3" value={invoiceForm.terms} onChange={(event) => setInvoiceForm((current) => ({ ...current, terms: event.target.value }))} />
                </label>
              </div>
            </div>

            <div className="preview-panel">
              <div className="invoice-sheet physical-bill">
                <div className="physical-header">
                  <div className="header-badge">MANUFACTURING TAX INVOICE</div>
                  <div className="header-company-box">
                    <div className="header-company">{company.display_name || 'Shakti Tarinee Modern Rice Mill'}</div>
                    <div className="header-company-sub">AT: {company.address || 'Talagadakuhudi, Po: Chandeswar, Khordha-752023, Odisha, India'}</div>
                  </div>
                  <div className="header-gstin">GSTIN-{company.gstin || '21ACJFS9898R1ZU'}</div>
                </div>

                <div className="physical-meta-row">
                  <div className="meta-cell date-cell">
                    <span>Date</span>
                    <strong>{formatDate(invoiceForm.invoiceDate)}</strong>
                  </div>
                  <div className="meta-cell si-no-cell">
                    <span>SI.No.</span>
                    <strong>{invoiceForm.invoiceNo || '—'}</strong>
                  </div>
                </div>

                <div className="physical-customer-box">
                  <div className="customer-line"><span>M/s.</span><strong>{invoiceForm.buyerName || '—'}</strong></div>
                  <div className="customer-line"><span>Address:</span><strong>{invoiceForm.buyerAddress || '—'}</strong></div>
                  <div className="customer-line"><span>Mob:</span><strong>{invoiceForm.phone || '—'}</strong></div>
                  <div className="customer-line"><span>GSTIN:</span><strong>{invoiceForm.buyerGstin || '—'}</strong></div>
                </div>

                <table className="physical-items-table">
                  <thead>
                    <tr>
                      <th>SL. NO.</th>
                      <th>Description of Goods</th>
                      <th>HSN Code</th>
                      <th>Qty.</th>
                      <th>Price per Unit</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceForm.rows.map((row, index) => {
                      const amount = Number(row.quantity || 0) * Number(row.rate || 0);
                      return (
                        <tr key={index}>
                          <td>{index + 1}</td>
                          <td>{row.description || '—'}</td>
                          <td>{row.hsn || '—'}</td>
                          <td>{row.quantity || 0}</td>
                          <td>{formatCurrency(row.rate || 0)}</td>
                          <td>{formatCurrency(amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="physical-summary-wrap">
                  <div className="physical-summary-row">
                    <span>Total</span>
                    <strong>{formatCurrency(totals.subtotal)}</strong>
                  </div>
                  <div className="physical-summary-row">
                    <span>IGST</span>
                    <strong>{formatCurrency(totals.igstTotal)}</strong>
                  </div>
                  <div className="physical-summary-row">
                    <span>CGST</span>
                    <strong>{formatCurrency(totals.cgstTotal)}</strong>
                  </div>
                  <div className="physical-summary-row">
                    <span>SGST</span>
                    <strong>{formatCurrency(totals.sgstTotal)}</strong>
                  </div>
                  <div className="physical-summary-row total-row">
                    <span>GRAND TOTAL</span>
                    <strong>{formatCurrency(totals.total)}</strong>
                  </div>
                </div>

                <div className="physical-lower-row">
                  <div className="physical-notes-box">
                    <div className="notes-title">NOTES:</div>
                   <p>{invoiceForm.notes || ''}</p>
                  </div>
                  <div className="physical-signature-box">
                    <span>Authorized Signatory</span>
                    <strong>{invoiceForm.signature || company.authorized_signatory || '—'}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {companySettingsOpen && (
        <div className="modal-backdrop" onClick={() => setCompanySettingsOpen(false)}>
          <div className="company-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Company Settings</h3>
              <button type="button" className="ghost-button" onClick={() => setCompanySettingsOpen(false)}>Close</button>
            </div>
            <form onSubmit={saveCompanySettings} className="company-settings-form">
              <div className="field-grid two-col">
                <label>
                  Company name
                  <input value={company.legal_name} onChange={(event) => handleCompanyValue('legal_name', event.target.value)} />
                </label>
                <label>
                  Display name
                  <input value={company.display_name} onChange={(event) => handleCompanyValue('display_name', event.target.value)} />
                </label>
                <label>
                  Email
                  <input value={company.email} onChange={(event) => handleCompanyValue('email', event.target.value)} />
                </label>
                <label>
                  Phone
                  <input value={company.phone} onChange={(event) => handleCompanyValue('phone', event.target.value)} />
                </label>
                <label>
                  Website
                  <input value={company.website} onChange={(event) => handleCompanyValue('website', event.target.value)} />
                </label>
                <label>
                  GSTIN
                  <input value={company.gstin} onChange={(event) => handleCompanyValue('gstin', event.target.value)} />
                </label>
                <label>
                  PAN
                  <input value={company.pan} onChange={(event) => handleCompanyValue('pan', event.target.value)} />
                </label>
                <label>
                  Address
                  <input value={company.address} onChange={(event) => handleCompanyValue('address', event.target.value)} />
                </label>
                <label>
                  Bank name
                  <input value={company.bank_name} onChange={(event) => handleCompanyValue('bank_name', event.target.value)} />
                </label>
                <label>
                  Account name
                  <input value={company.account_name} onChange={(event) => handleCompanyValue('account_name', event.target.value)} />
                </label>
                <label>
                  Account number
                  <input value={company.account_number} onChange={(event) => handleCompanyValue('account_number', event.target.value)} />
                </label>
                <label>
                  IFSC code
                  <input value={company.ifsc_code} onChange={(event) => handleCompanyValue('ifsc_code', event.target.value)} />
                </label>
                <label className="full-span">
                  Payment terms
                  <textarea rows="2" value={company.payment_terms} onChange={(event) => handleCompanyValue('payment_terms', event.target.value)} />
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setCompanySettingsOpen(false)}>Cancel</button>
                <button type="submit" className="primary-button">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

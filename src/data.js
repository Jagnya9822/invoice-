export const initialCompanyProfile = {
  id: 'default',
  legal_name: 'Your Company LLP',
  display_name: 'Your Company',
  email: 'hello@yourcompany.com',
  phone: '+91 98765 43210',
  website: 'https://www.yourcompany.com',
  address: '12 Business Avenue, Banjara Hills, Hyderabad 500034, Telangana, India',
  billing_address: '12 Business Avenue, Banjara Hills, Hyderabad 500034, Telangana, India',
  gstin: '36AAAAA0000A1Z5',
  pan: 'AAAAA0000A',
  bank_name: 'State Bank of India',
  account_name: 'Your Company LLP',
  account_number: '12345678901',
  ifsc_code: 'SBIN0001234',
  payment_terms: 'Net 15 Days',
  notes: 'Thank you for your business. Please remit payment within the approved terms.',
  footer: 'This invoice is generated electronically and is valid without a physical signature.',
  authorized_signatory: 'Finance Manager',
  brand_color: '#1e3a8a',
  accent_color: '#0ea5e9',
};

export const initialCustomers = [
  { id: 'cust-1', name: 'Ananya Sharma', company: 'Apex Logistics Pvt. Ltd.', email: 'ananya@apexlogistics.in', phone: '+91 98101 22334', billingAddress: 'Plot 17, Secunderabad, Telangana', shippingAddress: 'Plot 17, Secunderabad, Telangana', taxId: '36AABCA6233M1ZQ' },
  { id: 'cust-2', name: 'Rohit Singh', company: 'Bluepeak Infra', email: 'rohit@bluepeakinfra.com', phone: '+91 99880 11763', billingAddress: '14th Floor, Bengaluru, Karnataka', shippingAddress: '14th Floor, Bengaluru, Karnataka', taxId: '29AAFCB1122L1ZP' },
];

export const initialInvoices = [
  {
    id: 'inv-1',
    invoice_number: 'INV-2026-0001',
    customer_id: 'cust-1',
    issue_date: '2026-10-01',
    due_date: '2026-10-15',
    status: 'paid',
    total: 13970,
    amount_paid: 13970,
    balance: 0,
    customer_name: 'Ananya Sharma',
    customer_company: 'Apex Logistics Pvt. Ltd.',
    items: [
      { code: 'SER-001', description: 'Business consulting retainership', quantity: 1, unit: 'Month', unitPrice: 10500, discount: 0, taxRate: 18, total: 12390 },
      { code: 'SER-002', description: 'Documentation and reporting support', quantity: 1, unit: 'Unit', unitPrice: 1350, discount: 0, taxRate: 18, total: 1593 },
    ],
  },
  {
    id: 'inv-2',
    invoice_number: 'INV-2026-0002',
    customer_id: 'cust-2',
    issue_date: '2026-10-08',
    due_date: '2026-10-22',
    status: 'partial',
    total: 28700,
    amount_paid: 15000,
    balance: 13700,
    customer_name: 'Rohit Singh',
    customer_company: 'Bluepeak Infra',
    items: [
      { code: 'CONS-005', description: 'Strategy workshop', quantity: 4, unit: 'Hours', unitPrice: 3500, discount: 250, taxRate: 18, total: 16225 },
      { code: 'CONS-006', description: 'Platform implementation', quantity: 1, unit: 'Project', unitPrice: 11000, discount: 0, taxRate: 18, total: 12980 },
    ],
  },
];

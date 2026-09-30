import type { SeedCustomer } from './seed.types';
/**
 * Several names share words on purpose (Acme, Harbour, Cross, Pty Ltd) so the
 * partial, case-insensitive search has something interesting to match.
 */
export const CUSTOMERS: readonly SeedCustomer[] = [
  {
    fullname: 'Acme Pty Ltd',
    email: 'billing@acme-pty.example.com',
    mobile: '+61 2 5550 0101',
    address: '12 George Street, Sydney NSW 2000',
  },
  {
    fullname: 'Acme Holdings',
    email: 'accounts@acme-holdings.example.com',
    mobile: '+61 3 5550 0102',
    address: '88 Collins Street, Melbourne VIC 3000',
  },
  {
    fullname: 'Acme Logistics Group',
    email: 'ap@acme-logistics.example.com',
    mobile: '+61 7 5550 0103',
    address: '5 Eagle Street, Brisbane QLD 4000',
  },
  {
    fullname: 'Blue Harbour Pty Ltd',
    email: 'finance@blueharbour.example.com',
    mobile: '+61 2 5550 0104',
    address: '1 Circular Quay, Sydney NSW 2000',
  },
  {
    fullname: 'Harbour Freight Co',
    email: 'invoices@harbourfreight.example.com',
    mobile: '+61 8 5550 0105',
    address: '20 Mews Road, Fremantle WA 6160',
  },
  {
    fullname: 'Kanglee Motors',
    email: 'paul@kanglee.example.com',
    mobile: '+65 6555 0106',
    address: '31 Ubi Road 1, Singapore 408694',
  },
  {
    fullname: 'Northwind Traders',
    email: 'orders@northwind.example.com',
    mobile: '+1 425 555 0107',
    address: '110 Pine Street, Seattle WA 98101',
  },
  {
    fullname: 'Southern Cross Consulting',
    email: 'hello@southerncross.example.com',
    mobile: '+61 2 5550 0108',
    address: '400 Pitt Street, Sydney NSW 2000',
  },
  {
    fullname: 'Cross Country Couriers',
    email: 'dispatch@crosscountry.example.com',
    mobile: '+44 20 7946 0109',
    address: '7 Canal Road, Leeds LS1 4AB',
  },
  {
    fullname: 'Bright Path Education',
    email: 'admin@brightpath.example.com',
    mobile: '+61 3 5550 0110',
    address: '56 Swanston Street, Melbourne VIC 3000',
  },
  {
    fullname: 'Lotus Digital Studio',
    email: 'studio@lotusdigital.example.com',
    mobile: '+65 6555 0111',
    address: '2 Kallang Avenue, Singapore 339407',
  },
  {
    fullname: 'Merlion Trading Pte Ltd',
    email: 'accounts@merliontrading.example.com',
    mobile: '+65 6555 0112',
    address: '50 Raffles Place, Singapore 048623',
  },
  {
    fullname: 'Thames & Co Solicitors',
    email: 'billing@thamesco.example.com',
    mobile: '+44 20 7946 0113',
    address: '14 Fleet Street, London EC4Y 1AA',
  },
  {
    fullname: 'Evergreen Landscaping',
    email: 'jobs@evergreen.example.com',
    mobile: '+61 8 5550 0114',
    address: '9 Hay Street, Perth WA 6000',
  },
  {
    fullname: 'Pacific Rim Imports',
    email: 'imports@pacificrim.example.com',
    mobile: '+1 415 555 0115',
    address: '900 Market Street, San Francisco CA 94102',
  },
  {
    fullname: 'Orchard Road Bakery',
    email: 'owner@orchardbakery.example.com',
    mobile: '+65 6555 0116',
    address: '277 Orchard Road, Singapore 238858',
  },
  {
    fullname: 'Summit Engineering',
    email: 'projects@summiteng.example.com',
    mobile: '+61 7 5550 0117',
    address: '15 Adelaide Street, Brisbane QLD 4000',
  },
  {
    fullname: 'Redwood Health Clinic',
    email: 'reception@redwoodhealth.example.com',
    mobile: '+61 2 5550 0118',
    address: '73 Oxford Street, Sydney NSW 2010',
  },
  {
    fullname: 'Paulson & Sons',
    email: 'office@paulsonsons.example.com',
    mobile: '+44 161 496 0119',
    address: '3 Deansgate, Manchester M3 4LQ',
  },
  {
    fullname: 'Tan Family Office',
    email: 'admin@tanfamily.example.com',
    mobile: '+81 3 5550 0120',
    address: '1-1 Marunouchi, Chiyoda-ku, Tokyo 100-0005',
  },
];

export const ITEM_NAMES: readonly string[] = [
  'Consulting services',
  'Website maintenance retainer',
  'Freight forwarding',
  'Office chairs',
  'Laptop stands',
  'Software licence (annual)',
  'Catering for event',
  'Logo and brand design',
  'Equipment hire',
  'Training workshop',
  'Bookkeeping services',
  'Landscaping works',
  'Motorcycle service package',
  'Printed marketing brochures',
];

export const DESCRIPTIONS: readonly string[] = [
  'Monthly services as per agreement',
  'Invoice is issued to the accounts payable team',
  'Includes delivery and set-up',
  'Payment terms as per signed quote',
  'Recurring engagement, second instalment',
];

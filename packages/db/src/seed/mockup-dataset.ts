/**
 * The mockup's demo data, rebuilt as rows that match the domain model.
 *
 * Products, batch numbers, quantities and expiry dates are reproduced exactly
 * from the mockup (same catalog, same seeded random sequence), so on hand from
 * the ledger equals the mockup's quantities. Sales, stock requests and
 * timestamps are generated around them so every movement in the ledger is
 * consistent: receipts = final on hand + units sold + units transferred out.
 *
 * Used by the static front end (FakeDataClient, Milestone 2) and the database
 * seed (Milestone 4). Pure TypeScript, no database access.
 */
import {
  type DiscountRule,
  type PricingSettings,
  type RequestPriority,
  type RequestStatus,
  type Role,
  type StaffPosition,
  addDaysToDate,
  computeTotals,
  formatReceiptNo,
  manilaToday,
  quickCashAmounts,
} from "@steward/domain";
import { v7 as uuidv7 } from "uuid";

// ---------------------------------------------------------------------------
// Row types

export interface BranchRow {
  id: string;
  code: string;
  name: string;
  isCentral: boolean;
  address: string;
  city: string;
  phone: string;
  email: string | null;
  opensAt: string;
  closesAt: string;
  openDays: number[];
}

export interface UserRow {
  id: string;
  fullName: string;
  username: string;
  /** Demo password, for the seed only. Never shown in the app. */
  demoPassword: string;
  role: Role;
  position: StaffPosition | null;
  branchId: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  prcLicenseNo: string | null;
  active: boolean;
}

export interface DeviceRow {
  id: string;
  branchId: string;
  label: string;
  receiptSeries: string;
  printWidth: 58 | 80;
}

export interface ProductRow {
  id: string;
  sku: string;
  genericName: string;
  brand: string;
  strength: string;
  form: string;
  category: string;
  priceCentavos: number;
  isTaxable: boolean;
  active: boolean;
}

export interface BatchRow {
  id: string;
  productId: string;
  branchId: string;
  batchNo: string;
  expiryDate: string;
  receivedAt: string;
}

export type MovementKind =
  "receive" | "sale" | "transfer_out" | "transfer_in" | "adjustment" | "void";

export interface MovementRow {
  id: string;
  batchId: string;
  qty: number;
  kind: MovementKind;
  refType: "sale" | "stock_request" | "receipt" | null;
  refId: string | null;
  createdByUserId: string;
  createdAt: string;
}

export interface DiscountRow extends DiscountRule {
  id: string;
  active: boolean;
}

export interface SaleLineRow {
  id: string;
  saleId: string;
  productId: string;
  qty: number;
  unitPriceCentavos: number;
  isTaxable: boolean;
  lineTotalCentavos: number;
  batches: { batchId: string; qty: number }[];
}

export interface SaleRow {
  id: string;
  receiptNo: string;
  branchId: string;
  deviceId: string | null;
  cashierUserId: string;
  soldAt: string;
  subtotal: number;
  discount: number;
  vat: number;
  vatable: number;
  nonVat: number;
  vatExemptRemoved: number;
  total: number;
  itemCount: number;
  paymentMethod: "cash" | "gcash";
  cashReceived: number | null;
  change: number | null;
  gcashRef: string | null;
  discountId: string | null;
  discountLabel: string | null;
  isVatExemptSale: boolean;
  status: "completed" | "voided";
  lines: SaleLineRow[];
}

export interface StockRequestRow {
  id: string;
  requestNo: string;
  branchId: string;
  requestedByUserId: string;
  priority: RequestPriority;
  note: string;
  status: RequestStatus;
  createdAt: string;
  items: { productId: string; qtyRequested: number; qtyAllocated: number | null }[];
  events: {
    id: string;
    kind: "created" | "approved" | "declined" | "fulfilled";
    actorUserId: string;
    note: string;
    createdAt: string;
  }[];
}

export interface SettingsRow {
  lowStockThreshold: number;
  receiptPrefix: string;
  vatRateBp: number;
  vatMode: PricingSettings["vatMode"];
}

export interface MockupDataset {
  generatedAt: string;
  settings: SettingsRow;
  branches: BranchRow[];
  users: UserRow[];
  devices: DeviceRow[];
  products: ProductRow[];
  batches: BatchRow[];
  movements: MovementRow[];
  discounts: DiscountRow[];
  sales: SaleRow[];
  requests: StockRequestRow[];
  /** Next request sequence number (REQ-1044 in the mockup). */
  nextRequestSequence: number;
  /** Next receipt sequence per device id. */
  nextReceiptSequence: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Deterministic helpers

/** The mockup's mulberry32 generator, seeded with 42. Kept identical so quantities match. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function idFactory(seed: number, baseMs: number) {
  const rng = mulberry32(seed);
  let counter = 0;
  return (atMs: number = baseMs + counter) => {
    counter += 1;
    const random = new Uint8Array(16);
    for (let i = 0; i < 16; i++) random[i] = Math.floor(rng() * 256);
    return uuidv7({ msecs: Math.floor(atMs), random });
  };
}

const ID_BASE_MS = Date.UTC(2026, 0, 1);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// ---------------------------------------------------------------------------
// Catalog (from the mockup)

type CatalogEntry = [
  generic: string,
  brand: string,
  category: string,
  form: string,
  strengths: string[],
  price: number,
];

const CORE_PRODUCTS: [
  sku: string,
  generic: string,
  brand: string,
  strength: string,
  form: string,
  category: string,
  price: number,
][] = [
  ["PS-1001", "Paracetamol", "Biogesic", "500mg", "Tab", "Analgesic", 4.5],
  ["PS-1002", "Ibuprofen", "Advil", "200mg", "Tab", "Analgesic", 6.25],
  ["PS-1003", "Amoxicillin", "Amoxil", "500mg", "Cap", "Antibiotic", 12.0],
  ["PS-1004", "Cetirizine", "Virlix", "10mg", "Tab", "Antihistamine", 8.75],
  ["PS-1005", "Loperamide", "Imodium", "2mg", "Cap", "Antidiarrheal", 7.0],
  ["PS-1006", "Ascorbic Acid", "Cecon", "500mg", "Tab", "Vitamin", 3.5],
  ["PS-1007", "Multivitamins", "Centrum", "—", "Cap", "Vitamin", 9.5],
  ["PS-1008", "Losartan", "Cozaar", "50mg", "Tab", "Antihypertensive", 15.25],
  ["PS-1009", "Metformin", "Glucophage", "500mg", "Tab", "Antidiabetic", 5.75],
  ["PS-1010", "Salbutamol", "Ventolin", "100mcg", "Inhaler", "Respiratory", 385.0],
  ["PS-1011", "Omeprazole", "Losec", "20mg", "Cap", "Antacid", 11.5],
  ["PS-1012", "Mefenamic Acid", "Dolfenal", "500mg", "Tab", "Analgesic", 6.8],
];

const CATALOG: CatalogEntry[] = [
  ["Cefalexin", "Keflex", "Antibiotic", "Cap", ["250mg", "500mg", "750mg", "1g"], 9.5],
  ["Cefuroxime", "Zinnat", "Antibiotic", "Tab", ["125mg", "250mg", "500mg"], 32.0],
  ["Ciprofloxacin", "Ciprobay", "Antibiotic", "Tab", ["250mg", "500mg", "750mg"], 18.0],
  ["Azithromycin", "Zithromax", "Antibiotic", "Tab", ["250mg", "500mg"], 45.0],
  ["Clarithromycin", "Klaricid", "Antibiotic", "Tab", ["250mg", "500mg"], 38.0],
  ["Doxycycline", "Vibramycin", "Antibiotic", "Cap", ["50mg", "100mg"], 12.0],
  ["Co-amoxiclav", "Augmentin", "Antibiotic", "Tab", ["375mg", "625mg", "1g"], 28.0],
  ["Metronidazole", "Flagyl", "Antibiotic", "Tab", ["250mg", "500mg"], 7.5],
  ["Clindamycin", "Dalacin C", "Antibiotic", "Cap", ["150mg", "300mg"], 22.0],
  ["Cloxacillin", "Prostaphlin-A", "Antibiotic", "Cap", ["250mg", "500mg"], 8.5],
  ["Aspirin", "Bayer", "Analgesic", "Tab", ["80mg", "100mg", "325mg"], 3.25],
  ["Naproxen", "Flanax", "Analgesic", "Tab", ["275mg", "550mg"], 9.75],
  ["Celecoxib", "Celebrex", "Analgesic", "Cap", ["200mg", "400mg"], 42.0],
  ["Tramadol", "Milador", "Analgesic", "Cap", ["50mg", "100mg"], 14.0],
  ["Diclofenac", "Voltaren", "Analgesic", "Tab", ["25mg", "50mg", "75mg"], 11.0],
  ["Ibuprofen", "Medicol Advance", "Analgesic", "Cap", ["200mg", "400mg"], 5.5],
  ["Etoricoxib", "Arcoxia", "Analgesic", "Tab", ["60mg", "90mg", "120mg"], 39.0],
  ["Loratadine", "Claritin", "Antihistamine", "Tab", ["5mg", "10mg"], 16.0],
  ["Fexofenadine", "Allegra", "Antihistamine", "Tab", ["60mg", "120mg", "180mg"], 24.0],
  ["Diphenhydramine", "Benadryl", "Antihistamine", "Cap", ["25mg", "50mg"], 6.5],
  ["Chlorphenamine", "Antamin", "Antihistamine", "Tab", ["2mg", "4mg"], 3.0],
  ["Levocetirizine", "Xyzal", "Antihistamine", "Tab", ["2.5mg", "5mg"], 21.0],
  ["Meclizine", "Bonamine", "Antihistamine", "Tab", ["12.5mg", "25mg"], 9.0],
  ["Carbocisteine", "Solmux", "Cough & Cold", "Cap", ["200mg", "375mg", "500mg"], 8.0],
  ["Ambroxol", "Mucosolvan", "Cough & Cold", "Tab", ["30mg", "60mg", "75mg"], 9.0],
  ["Butamirate", "Sinecod", "Cough & Cold", "Tab", ["20mg", "50mg"], 12.0],
  ["Phenylephrine + Paracetamol", "Neozep", "Cough & Cold", "Tab", ["500mg", "Forte"], 4.5],
  ["Paracetamol + Phenylephrine + Zinc", "Bioflu", "Cough & Cold", "Tab", ["500mg"], 5.25],
  ["Dextromethorphan", "Robitussin DM", "Cough & Cold", "Syrup", ["60ml", "120ml"], 68.0],
  ["Montelukast", "Singulair", "Respiratory", "Tab", ["4mg", "5mg", "10mg"], 33.0],
  ["Budesonide", "Pulmicort", "Respiratory", "Inhaler", ["100mcg", "200mcg"], 420.0],
  ["Fluticasone", "Flixotide", "Respiratory", "Inhaler", ["50mcg", "125mcg", "250mcg"], 510.0],
  ["Ipratropium + Salbutamol", "Combivent", "Respiratory", "Suspension", ["2.5ml UDV"], 28.0],
  ["Salbutamol", "Asmalin", "Respiratory", "Tab", ["2mg", "4mg"], 4.5],
  ["Amlodipine", "Norvasc", "Antihypertensive", "Tab", ["2.5mg", "5mg", "10mg"], 12.0],
  ["Metoprolol", "Betaloc", "Antihypertensive", "Tab", ["50mg", "100mg"], 8.5],
  ["Atenolol", "Tenormin", "Antihypertensive", "Tab", ["25mg", "50mg", "100mg"], 7.0],
  ["Captopril", "Capoten", "Antihypertensive", "Tab", ["25mg", "50mg"], 5.5],
  ["Enalapril", "Renitec", "Antihypertensive", "Tab", ["5mg", "10mg", "20mg"], 9.0],
  ["Telmisartan", "Micardis", "Antihypertensive", "Tab", ["40mg", "80mg"], 27.0],
  ["Valsartan", "Diovan", "Antihypertensive", "Tab", ["80mg", "160mg"], 31.0],
  ["Carvedilol", "Dilatrend", "Cardiovascular", "Tab", ["6.25mg", "12.5mg", "25mg"], 18.0],
  ["Clopidogrel", "Plavix", "Cardiovascular", "Tab", ["75mg"], 46.0],
  ["Atorvastatin", "Lipitor", "Cardiovascular", "Tab", ["10mg", "20mg", "40mg", "80mg"], 24.0],
  ["Rosuvastatin", "Crestor", "Cardiovascular", "Tab", ["5mg", "10mg", "20mg", "40mg"], 29.0],
  ["Simvastatin", "Zocor", "Cardiovascular", "Tab", ["10mg", "20mg", "40mg"], 14.0],
  ["Isosorbide mononitrate", "Imdur", "Cardiovascular", "Tab", ["30mg", "60mg"], 21.0],
  ["Digoxin", "Lanoxin", "Cardiovascular", "Tab", ["0.25mg"], 9.0],
  ["Furosemide", "Lasix", "Diuretic", "Tab", ["20mg", "40mg"], 6.5],
  ["Spironolactone", "Aldactone", "Diuretic", "Tab", ["25mg", "50mg", "100mg"], 12.0],
  ["Gliclazide", "Diamicron MR", "Antidiabetic", "Tab", ["30mg", "60mg", "80mg"], 17.0],
  ["Glimepiride", "Amaryl", "Antidiabetic", "Tab", ["1mg", "2mg", "4mg"], 19.0],
  ["Sitagliptin", "Januvia", "Antidiabetic", "Tab", ["25mg", "50mg", "100mg"], 48.0],
  ["Famotidine", "Pepcid", "Antacid", "Tab", ["10mg", "20mg", "40mg"], 9.0],
  ["Esomeprazole", "Nexium", "Antacid", "Tab", ["20mg", "40mg"], 34.0],
  ["Pantoprazole", "Pantoloc", "Antacid", "Tab", ["20mg", "40mg"], 28.0],
  ["Lansoprazole", "Prevacid", "Antacid", "Cap", ["15mg", "30mg"], 26.0],
  ["Domperidone", "Motilium", "Gastrointestinal", "Tab", ["10mg"], 14.0],
  ["Hyoscine-N-butylbromide", "Buscopan", "Gastrointestinal", "Tab", ["10mg", "20mg"], 13.0],
  ["Lactulose", "Duphalac", "Gastrointestinal", "Syrup", ["120ml", "200ml"], 185.0],
  ["Bisacodyl", "Dulcolax", "Gastrointestinal", "Tab", ["5mg", "10mg"], 8.0],
  ["Silymarin", "Liveraide", "Gastrointestinal", "Cap", ["140mg"], 16.0],
  ["Racecadotril", "Hidrasec", "Antidiarrheal", "Cap", ["100mg"], 35.0],
  ["Vitamin B1+B6+B12", "Neurobion", "Vitamin", "Tab", ["—", "Forte"], 15.0],
  ["Ferrous sulfate + Vit B", "Sangobion", "Vitamin", "Cap", ["—"], 8.0],
  ["Vitamin E", "Myra E", "Vitamin", "Cap", ["400IU"], 9.0],
  ["Calcium + Vitamin D3", "Caltrate Plus", "Vitamin", "Tab", ["600mg"], 13.0],
  ["Cholecalciferol", "Forti-D", "Vitamin", "Cap", ["800IU"], 7.5],
  ["Zinc", "Immuzinc", "Vitamin", "Tab", ["10mg", "20mg"], 6.0],
  ["Sodium ascorbate", "FERN-C", "Vitamin", "Cap", ["500mg"], 4.75],
  ["Allopurinol", "Zyloprim", "Antigout", "Tab", ["100mg", "300mg"], 9.0],
  ["Colchicine", "Goutnil", "Antigout", "Tab", ["0.5mg"], 12.0],
  ["Prednisone", "Orasone", "Steroid", "Tab", ["5mg", "10mg", "20mg"], 8.0],
  ["Methylprednisolone", "Medrol", "Steroid", "Tab", ["4mg", "8mg", "16mg"], 22.0],
  ["Dexamethasone", "Decadron", "Steroid", "Tab", ["0.5mg", "4mg"], 9.0],
  ["Ketoconazole", "Nizoral", "Antifungal", "Tab", ["200mg"], 27.0],
  ["Terbinafine", "Lamisil", "Antifungal", "Cream", ["1% 10g"], 265.0],
  ["Clotrimazole", "Canesten", "Dermatology", "Cream", ["1% 10g", "1% 20g"], 145.0],
  ["Mupirocin", "Bactroban", "Dermatology", "Cream", ["2% 5g", "2% 15g"], 320.0],
  ["Betamethasone", "Diprosone", "Dermatology", "Cream", ["0.05% 10g"], 210.0],
  ["Acyclovir", "Zovirax", "Antiviral", "Tab", ["200mg", "400mg", "800mg"], 24.0],
  ["Oseltamivir", "Tamiflu", "Antiviral", "Cap", ["75mg"], 95.0],
  ["Gabapentin", "Neurontin", "Neurology", "Cap", ["100mg", "300mg", "400mg"], 26.0],
  ["Pregabalin", "Lyrica", "Neurology", "Cap", ["50mg", "75mg", "150mg"], 38.0],
  ["Amitriptyline", "Tryptanol", "Neurology", "Tab", ["10mg", "25mg"], 7.0],
  ["Sertraline", "Zoloft", "Neurology", "Tab", ["50mg", "100mg"], 42.0],
  ["Escitalopram", "Lexapro", "Neurology", "Tab", ["10mg", "20mg"], 48.0],
  ["Betahistine", "Serc", "Neurology", "Tab", ["8mg", "16mg", "24mg"], 19.0],
  ["Levothyroxine", "Euthyrox", "Thyroid", "Tab", ["25mcg", "50mcg", "100mcg"], 11.0],
  ["Tobramycin", "Tobrex", "Ophthalmic", "Drops", ["0.3% 5ml"], 380.0],
];

/** Mockup batches for the first twelve products: [sku, branch key, batch no, qty, expiry]. */
const CORE_BATCHES: [string, BranchKey, string, number, string][] = [
  ["PS-1001", "central", "B25-011", 120, "2026-11-15"],
  ["PS-1001", "central", "B26-042", 200, "2027-03-01"],
  ["PS-1001", "b1", "B25-011", 60, "2026-11-15"],
  ["PS-1001", "b1", "B26-042", 120, "2027-03-01"],
  ["PS-1001", "b2", "B26-042", 96, "2027-03-01"],
  ["PS-1002", "central", "B26-018", 210, "2027-01-15"],
  ["PS-1002", "b1", "B26-018", 45, "2027-01-15"],
  ["PS-1002", "b2", "B26-018", 120, "2027-01-15"],
  ["PS-1003", "central", "B25-093", 70, "2026-10-20"],
  ["PS-1003", "central", "B26-007", 80, "2026-11-30"],
  ["PS-1003", "b1", "B26-007", 60, "2026-11-30"],
  ["PS-1003", "b2", "B25-093", 8, "2026-10-20"],
  ["PS-1004", "central", "B26-101", 240, "2027-06-20"],
  ["PS-1004", "b1", "B26-101", 110, "2027-06-20"],
  ["PS-1004", "b2", "B26-101", 75, "2027-06-20"],
  ["PS-1005", "central", "B26-055", 90, "2026-12-10"],
  ["PS-1005", "b1", "B26-055", 12, "2026-12-10"],
  ["PS-1005", "b2", "B26-055", 40, "2026-12-10"],
  ["PS-1006", "central", "B26-120", 500, "2028-02-01"],
  ["PS-1006", "b1", "B26-120", 260, "2028-02-01"],
  ["PS-1006", "b2", "B26-120", 300, "2028-02-01"],
  ["PS-1007", "central", "B26-088", 180, "2027-09-12"],
  ["PS-1007", "b1", "B26-088", 88, "2027-09-12"],
  ["PS-1007", "b2", "B26-088", 64, "2027-09-12"],
  ["PS-1008", "central", "B26-031", 130, "2027-04-05"],
  ["PS-1008", "b1", "B26-031", 30, "2027-04-05"],
  ["PS-1009", "central", "B26-064", 260, "2027-08-22"],
  ["PS-1009", "b1", "B26-064", 140, "2027-08-22"],
  ["PS-1009", "b2", "B26-064", 90, "2027-08-22"],
  ["PS-1010", "central", "B25-140", 15, "2026-10-01"],
  ["PS-1010", "central", "B26-022", 25, "2027-05-18"],
  ["PS-1010", "b1", "B25-140", 6, "2026-10-01"],
  ["PS-1010", "b2", "B26-022", 14, "2027-05-18"],
  ["PS-1011", "central", "B26-077", 170, "2027-02-14"],
  ["PS-1011", "b1", "B26-077", 72, "2027-02-14"],
  ["PS-1011", "b2", "B26-077", 55, "2027-02-14"],
  ["PS-1012", "central", "B25-116", 80, "2026-12-28"],
  ["PS-1012", "central", "B26-039", 120, "2027-07-10"],
  ["PS-1012", "b2", "B26-039", 66, "2027-07-10"],
  ["PS-1001", "b3", "B26-042", 80, "2027-03-01"],
  ["PS-1004", "b3", "B26-101", 50, "2027-06-20"],
  ["PS-1006", "b3", "B26-120", 150, "2028-02-01"],
  ["PS-1009", "b3", "B26-064", 60, "2027-08-22"],
  ["PS-1003", "b3", "B25-093", 10, "2026-10-20"],
  ["PS-1011", "b3", "B26-077", 35, "2027-02-14"],
];

type BranchKey = "central" | "b1" | "b2" | "b3";

const BRANCHES: (Omit<BranchRow, "id"> & { key: BranchKey })[] = [
  {
    key: "central",
    name: "Esperanza Buhangin",
    code: "ESP",
    isCentral: true,
    address: "Esperanza St., Buhangin",
    city: "Davao City",
    phone: "09175550101",
    email: "esperanza@stewardpharmacy.ph",
    opensAt: "07:00",
    closesAt: "21:00",
    openDays: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    key: "b1",
    name: "NCCC Market",
    code: "NCC",
    isCentral: false,
    address: "NCCC Market, Ground floor",
    city: "Davao City",
    phone: "09175550102",
    email: null,
    opensAt: "08:00",
    closesAt: "20:00",
    openDays: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    key: "b2",
    name: "Communal Buhangin",
    code: "COM",
    isCentral: false,
    address: "Communal Rd., Buhangin",
    city: "Davao City",
    phone: "09175550103",
    email: null,
    opensAt: "08:00",
    closesAt: "19:00",
    openDays: [1, 2, 3, 4, 5, 6],
  },
  {
    key: "b3",
    name: "Tibungco",
    code: "TIB",
    isCentral: false,
    address: "National Highway, Tibungco",
    city: "Davao City",
    phone: "09175550104",
    email: null,
    opensAt: "08:00",
    closesAt: "18:00",
    openDays: [1, 2, 3, 4, 5, 6],
  },
];

const USERS: (Omit<UserRow, "id" | "branchId"> & { branch: BranchKey })[] = [
  {
    fullName: "Richard Boquia",
    username: "admin",
    demoPassword: "admin",
    role: "admin",
    position: null,
    branch: "central",
    phone: "09175550100",
    email: "richard@stewardpharmacy.ph",
    address: null,
    prcLicenseNo: null,
    active: true,
  },
  {
    fullName: "Jo Santos",
    username: "cashier1",
    demoPassword: "pos",
    role: "staff",
    position: "cashier",
    branch: "b1",
    phone: "09185550211",
    email: null,
    address: "Buhangin, Davao City",
    prcLicenseNo: null,
    active: true,
  },
  {
    fullName: "Maria Dela Cruz",
    username: "mdelacruz",
    demoPassword: "pos",
    role: "staff",
    position: "pharmacist",
    branch: "central",
    phone: "09185550212",
    email: null,
    address: null,
    prcLicenseNo: "0012345",
    active: true,
  },
  {
    fullName: "Ramon Aquino",
    username: "raquino",
    demoPassword: "pos",
    role: "staff",
    position: "pharmacy_assistant",
    branch: "b2",
    phone: "09185550213",
    email: null,
    address: null,
    prcLicenseNo: null,
    active: true,
  },
  {
    fullName: "Liza Mendoza",
    username: "lmendoza",
    demoPassword: "pos",
    role: "staff",
    position: "cashier",
    branch: "b3",
    phone: "09185550214",
    email: null,
    address: null,
    prcLicenseNo: null,
    active: false,
  },
];

const CASHIER_BY_BRANCH: Record<BranchKey, string> = {
  central: "mdelacruz",
  b1: "cashier1",
  b2: "raquino",
  b3: "lmendoza",
};

export const DEMO_SETTINGS: SettingsRow = {
  lowStockThreshold: 20,
  receiptPrefix: "OR",
  vatRateBp: 1200,
  vatMode: "inclusive",
};

const toCentavos = (pesos: number) => Math.round(pesos * 100);

// ---------------------------------------------------------------------------
// Builder

export function buildMockupDataset(now: Date = new Date()): MockupDataset {
  const nowMs = now.getTime();
  // A fixed base time keeps ids for branches, users, products and discounts the same on every
  // build, so a stored session or a link to a product survives a reload.
  const nextId = idFactory(7, ID_BASE_MS);
  const today = manilaToday(now);
  const isoAgo = (ms: number) => new Date(nowMs - ms).toISOString();

  // Branches, users, devices.
  const branchByKey = {} as Record<BranchKey, BranchRow>;
  const branches = BRANCHES.map(({ key, ...rest }) => {
    const row: BranchRow = { id: nextId(), ...rest };
    branchByKey[key] = row;
    return row;
  });
  const userByUsername = new Map<string, UserRow>();
  const users = USERS.map(({ branch, ...rest }) => {
    const row: UserRow = { id: nextId(), ...rest, branchId: branchByKey[branch].id };
    userByUsername.set(row.username, row);
    return row;
  });
  const admin = userByUsername.get("admin");
  if (!admin) throw new Error("missing admin");
  const devices: DeviceRow[] = branches.map((branch) => ({
    id: nextId(),
    branchId: branch.id,
    label: "Counter 1",
    receiptSeries: "01",
    printWidth: 58,
  }));
  const deviceByBranch = new Map(devices.map((device) => [device.branchId, device]));

  // Products and batches, reproducing the mockup's random sequence exactly.
  const products: ProductRow[] = [];
  const productBySku = new Map<string, ProductRow>();
  const addProduct = (
    sku: string,
    genericName: string,
    brand: string,
    strength: string,
    form: string,
    category: string,
    price: number,
  ) => {
    const row: ProductRow = {
      id: nextId(),
      sku,
      genericName,
      brand,
      strength: strength === "—" ? "" : strength,
      form,
      category,
      priceCentavos: toCentavos(price),
      isTaxable: true,
      active: true,
    };
    products.push(row);
    productBySku.set(sku, row);
  };
  for (const [sku, generic, brand, strength, form, category, price] of CORE_PRODUCTS) {
    addProduct(sku, generic, brand, strength, form, category, price);
  }
  let skuNumber = 1013;
  for (const [generic, brand, category, form, strengths, price] of CATALOG) {
    strengths.forEach((strength, index) => {
      const branded = Number((price * (1 + index * 0.55)).toFixed(2));
      addProduct(`PS-${skuNumber++}`, generic, brand, strength, form, category, branded);
      if (price < 50) {
        addProduct(
          `PS-${skuNumber++}`,
          generic,
          "RiteMed",
          strength,
          form,
          category,
          Number((branded * 0.55).toFixed(2)),
        );
      }
    });
  }

  interface PlannedBatch {
    row: BatchRow;
    finalQty: number;
    soldQty: number;
    transferredOutQty: number;
    transferredInQty: number;
  }
  const planned: PlannedBatch[] = [];
  const planBatch = (
    sku: string,
    branch: BranchKey,
    batchNo: string,
    qty: number,
    expiryDate: string,
  ) => {
    const product = productBySku.get(sku);
    if (!product) throw new Error(`unknown sku ${sku}`);
    planned.push({
      row: {
        id: nextId(),
        productId: product.id,
        branchId: branchByKey[branch].id,
        batchNo,
        expiryDate,
        // Received 40 to 60 days ago, before any generated sale; ties broken by order.
        receivedAt: isoAgo(40 * DAY + (planned.length % 480) * 3 * MINUTE),
      },
      finalQty: qty,
      soldQty: 0,
      transferredOutQty: 0,
      transferredInQty: 0,
    });
  };
  for (const [sku, branch, batchNo, qty, expiry] of CORE_BATCHES)
    planBatch(sku, branch, batchNo, qty, expiry);

  const mockRng = mulberry32(42);
  const ri = (a: number, b: number) => a + Math.floor(mockRng() * (b - a + 1));
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(mockRng() * items.length)];
    if (item === undefined) throw new Error("empty pick");
    return item;
  };
  const isoIn = (days: number) => addDaysToDate(today, days);
  for (const product of products.slice(12)) {
    const big = product.priceCentavos >= 10_000;
    const batchNo = () => `B${pick(["25", "26"])}-${String(ri(100, 999))}`;
    const expiry = () => isoIn(mockRng() < 0.15 ? ri(20, 85) : ri(120, 700));
    planBatch(product.sku, "central", batchNo(), big ? ri(8, 60) : ri(80, 420), expiry());
    if (mockRng() < 0.3)
      planBatch(product.sku, "central", batchNo(), big ? ri(5, 30) : ri(40, 200), expiry());
    for (const branch of ["b1", "b2", "b3"] as const) {
      if (mockRng() < 0.15) continue;
      const roll = mockRng();
      const qty = roll < 0.07 ? 0 : roll < 0.28 ? ri(1, 19) : big ? ri(2, 28) : ri(20, 260);
      planBatch(product.sku, branch, batchNo(), qty, expiry());
    }
  }

  // Discounts and settings.
  const discounts: DiscountRow[] = [
    {
      id: nextId(),
      name: "Senior / PWD",
      mode: "percent",
      value: 2000,
      formula: null,
      capCentavos: null,
      minSpendCentavos: null,
      isVatExempt: true,
      active: true,
    },
    {
      id: nextId(),
      name: "Employee",
      mode: "percent",
      value: 1000,
      formula: null,
      capCentavos: null,
      minSpendCentavos: null,
      isVatExempt: false,
      active: true,
    },
  ];
  const seniorPwd = discounts[0];
  if (!seniorPwd) throw new Error("missing discount");
  const settings = { ...DEMO_SETTINGS };

  // Sales: a month of receipts across branches, generated with a separate random
  // sequence so the mockup quantities above stay identical.
  const salesRng = mulberry32(2026);
  const sri = (a: number, b: number) => a + Math.floor(salesRng() * (b - a + 1));
  const spick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(salesRng() * items.length)];
    if (item === undefined) throw new Error("empty pick");
    return item;
  };
  const batchesByBranchProduct = new Map<string, PlannedBatch[]>();
  for (const batch of planned) {
    const key = `${batch.row.branchId}|${batch.row.productId}`;
    const list = batchesByBranchProduct.get(key) ?? [];
    list.push(batch);
    batchesByBranchProduct.set(key, list);
  }
  const carried = new Map<string, ProductRow[]>();
  for (const branch of branches) {
    carried.set(
      branch.id,
      products.filter((product) => batchesByBranchProduct.has(`${branch.id}|${product.id}`)),
    );
  }

  const minutesAgo: number[] = [];
  for (let i = 0; i < 168; i++) minutesAgo.push(sri(12 * 60, 30 * 24 * 60));
  for (let i = 0; i < 16; i++) minutesAgo.push(sri(10, 11 * 60));
  // Move each sale into store hours (8 AM to 8 PM Manila), keeping it in the past.
  const saleTimes = minutesAgo
    .map((ago) => {
      const raw = nowMs - ago * MINUTE;
      const minuteOfDay = (((Math.floor(raw / MINUTE) + 8 * 60) % 1440) + 1440) % 1440;
      const target = 8 * 60 + (minuteOfDay % (12 * 60));
      const shifted = raw + (target - minuteOfDay) * MINUTE;
      return shifted > nowMs ? raw : shifted;
    })
    .sort((a, b) => a - b); // oldest first

  const receiptSequence = new Map<string, number>();
  const sales: SaleRow[] = [];
  for (const soldAtMs of saleTimes) {
    const branchKey = spick<BranchKey>(["central", "central", "b1", "b1", "b2", "b3"]);
    const branch = branchByKey[branchKey];
    const soldDate = new Date(soldAtMs).toISOString().slice(0, 10);
    const options = carried.get(branch.id) ?? [];
    const lineCount = sri(1, 5);
    const chosen = new Map<string, { product: ProductRow; qty: number; batch: PlannedBatch }>();
    for (let k = 0; k < lineCount; k++) {
      const product = spick(options);
      if (chosen.has(product.id)) continue;
      const candidates = (batchesByBranchProduct.get(`${branch.id}|${product.id}`) ?? [])
        .filter((batch) => batch.row.expiryDate > soldDate)
        .sort((a, b) => a.row.expiryDate.localeCompare(b.row.expiryDate));
      const batch = candidates[0];
      if (!batch) continue;
      chosen.set(product.id, {
        product,
        qty: product.priceCentavos >= 10_000 ? sri(1, 2) : sri(1, 12),
        batch,
      });
    }
    if (chosen.size === 0) continue;
    const discounted = salesRng() < 0.16;
    const lines = [...chosen.values()];
    const totals = computeTotals(
      lines.map(({ product, qty }) => ({
        qty,
        unitPriceCentavos: product.priceCentavos,
        isTaxable: product.isTaxable,
      })),
      discounted ? seniorPwd : null,
      settings,
    );
    const gcash = salesRng() < 0.3;
    const sequence = (receiptSequence.get(branch.id) ?? 0) + 1;
    receiptSequence.set(branch.id, sequence);
    const device = deviceByBranch.get(branch.id);
    const cashier = userByUsername.get(CASHIER_BY_BRANCH[branchKey]);
    if (!device || !cashier) throw new Error("missing device or cashier");
    const saleId = nextId(soldAtMs);
    const cashReceived = gcash ? null : (quickCashAmounts(totals.total)[0] ?? totals.total);
    const sale: SaleRow = {
      id: saleId,
      receiptNo: formatReceiptNo({
        prefix: settings.receiptPrefix,
        branchCode: branch.code,
        series: device.receiptSeries,
        sequence,
      }),
      branchId: branch.id,
      deviceId: device.id,
      cashierUserId: cashier.id,
      soldAt: new Date(soldAtMs).toISOString(),
      subtotal: totals.subtotal,
      discount: totals.discount,
      vat: totals.vat,
      vatable: totals.vatable,
      nonVat: totals.nonVat,
      vatExemptRemoved: totals.vatExemptRemoved,
      total: totals.total,
      itemCount: totals.itemCount,
      paymentMethod: gcash ? "gcash" : "cash",
      cashReceived,
      change: cashReceived === null ? null : cashReceived - totals.total,
      gcashRef: gcash
        ? String(1_000_000_000_000 + Math.floor(salesRng() * 8_999_999_999_999))
        : null,
      discountId: discounted ? seniorPwd.id : null,
      discountLabel: discounted ? `${seniorPwd.name} 20%` : null,
      isVatExemptSale: totals.isVatExemptSale,
      status: "completed",
      lines: lines.map(({ product, qty, batch }, index) => {
        batch.soldQty += qty;
        return {
          id: nextId(soldAtMs),
          saleId,
          productId: product.id,
          qty,
          unitPriceCentavos: product.priceCentavos,
          isTaxable: product.isTaxable,
          lineTotalCentavos: totals.lineTotals[index] ?? 0,
          batches: [{ batchId: batch.row.id, qty }],
        };
      }),
    };
    sales.push(sale);
  }

  // Stock requests from the mockup.
  const central = branchByKey.central;
  const sellableAtCentral = (productId: string) =>
    (batchesByBranchProduct.get(`${central.id}|${productId}`) ?? [])
      .filter((batch) => batch.row.expiryDate > today)
      .reduce((sum, batch) => sum + batch.finalQty, 0);
  const requests: StockRequestRow[] = [];
  const requestRng = mulberry32(1043);
  const rri = (a: number, b: number) => a + Math.floor(requestRng() * (b - a + 1));
  const by = (branch: BranchKey) => {
    const user = userByUsername.get(CASHIER_BY_BRANCH[branch]);
    if (!user) throw new Error("missing user");
    return user;
  };
  const randomItems = (count: number) => {
    const seen = new Set<string>();
    const items: StockRequestRow["items"] = [];
    while (items.length < count) {
      const product = products[rri(0, products.length - 1)];
      if (!product || seen.has(product.id)) continue;
      seen.add(product.id);
      items.push({ productId: product.id, qtyRequested: rri(2, 30) * 10, qtyAllocated: null });
    }
    return items;
  };
  const productId = (sku: string) => productBySku.get(sku)?.id ?? "";

  const addRequest = (
    sequence: number,
    branch: BranchKey,
    hoursAgo: number,
    priority: RequestPriority,
    status: RequestStatus,
    note: string,
    items: StockRequestRow["items"],
  ) => {
    const createdAt = isoAgo(hoursAgo * HOUR);
    const requester = by(branch);
    const id = nextId(nowMs - hoursAgo * HOUR);
    const events: StockRequestRow["events"] = [
      { id: nextId(), kind: "created", actorUserId: requester.id, note: "", createdAt },
    ];
    if (status !== "pending") {
      const decidedAt = isoAgo(Math.max(1, hoursAgo - rri(2, 20)) * HOUR);
      const decision = status === "declined" ? "declined" : "approved";
      events.push({
        id: nextId(),
        kind: decision,
        actorUserId: admin.id,
        note: "",
        createdAt: decidedAt,
      });
      if (decision === "approved") {
        for (const item of items)
          item.qtyAllocated = Math.min(item.qtyRequested, sellableAtCentral(item.productId));
      }
      if (status === "fulfilled") {
        events.push({
          id: nextId(),
          kind: "fulfilled",
          actorUserId: admin.id,
          note: "",
          createdAt: isoAgo(Math.max(1, hoursAgo - 24) * HOUR),
        });
      }
    }
    requests.push({
      id,
      requestNo: `REQ-${sequence}`,
      branchId: branchByKey[branch].id,
      requestedByUserId: requester.id,
      priority,
      note,
      status,
      createdAt,
      items,
      events,
    });
  };

  addRequest(
    1043,
    "b1",
    3,
    "urgent",
    "pending",
    "Ibuprofen and Amoxicillin down to a day of cover. Clinic next door referring patients.",
    [
      { productId: productId("PS-1002"), qtyRequested: 120, qtyAllocated: null },
      { productId: productId("PS-1003"), qtyRequested: 80, qtyAllocated: null },
      { productId: productId("PS-1005"), qtyRequested: 60, qtyAllocated: null },
    ],
  );
  addRequest(
    1042,
    "b3",
    9,
    "normal",
    "pending",
    "Amoxicillin batch B25-093 expires in October, only 10 left.",
    [
      { productId: productId("PS-1003"), qtyRequested: 100, qtyAllocated: null },
      { productId: productId("PS-1011"), qtyRequested: 60, qtyAllocated: null },
    ],
  );
  const generated: [BranchKey, RequestStatus, RequestPriority, number][] = [
    ["b2", "pending", "urgent", 26],
    ["b1", "pending", "normal", 31],
    ["b3", "pending", "low", 47],
    ["b2", "approved", "normal", 55],
    ["b1", "approved", "urgent", 70],
    ["b3", "approved", "normal", 96],
    ["b1", "fulfilled", "normal", 130],
    ["b2", "fulfilled", "low", 170],
    ["b3", "fulfilled", "normal", 210],
    ["b1", "fulfilled", "urgent", 260],
    ["b2", "declined", "low", 300],
    ["b3", "declined", "normal", 340],
  ];
  generated.forEach(([branch, status, priority, hoursAgo], index) => {
    // Fulfilled requests move real stock, so they only use products whose batch
    // numbers exist at both central and the branch (the mockup's core products).
    const items =
      status === "fulfilled" ? fulfillableItems(branchByKey[branch].id) : randomItems(rri(1, 5));
    addRequest(1041 - index, branch, hoursAgo, priority, status, "", items);
  });

  function fulfillableItems(branchId: string): StockRequestRow["items"] {
    const items: StockRequestRow["items"] = [];
    for (const [sku] of CORE_PRODUCTS) {
      const id = productId(sku);
      const atBranch = (batchesByBranchProduct.get(`${branchId}|${id}`) ?? []).filter(
        (b) => b.finalQty >= 20,
      );
      const atCentral = batchesByBranchProduct.get(`${central.id}|${id}`) ?? [];
      const match = atBranch.find((b) =>
        atCentral.some((c) => c.row.batchNo === b.row.batchNo && c.row.expiryDate > today),
      );
      if (match && items.length < 2)
        items.push({ productId: id, qtyRequested: 20, qtyAllocated: null });
    }
    return items;
  }

  // Ledger movements: receipts, transfers for fulfilled requests, and sales.
  const movements: MovementRow[] = [];
  for (const request of requests.filter((r) => r.status === "fulfilled")) {
    const fulfilled = request.events.find((event) => event.kind === "fulfilled");
    if (!fulfilled) continue;
    for (const item of request.items) {
      const qty = item.qtyAllocated ?? 0;
      if (qty <= 0) continue;
      const target = (
        batchesByBranchProduct.get(`${request.branchId}|${item.productId}`) ?? []
      ).find((b) =>
        (batchesByBranchProduct.get(`${central.id}|${item.productId}`) ?? []).some(
          (c) => c.row.batchNo === b.row.batchNo,
        ),
      );
      const source = (batchesByBranchProduct.get(`${central.id}|${item.productId}`) ?? []).find(
        (c) => c.row.batchNo === target?.row.batchNo,
      );
      if (!target || !source) continue;
      source.transferredOutQty += qty;
      target.transferredInQty += qty;
      movements.push(
        {
          id: nextId(),
          batchId: source.row.id,
          qty: -qty,
          kind: "transfer_out",
          refType: "stock_request",
          refId: request.id,
          createdByUserId: admin.id,
          createdAt: fulfilled.createdAt,
        },
        {
          id: nextId(),
          batchId: target.row.id,
          qty,
          kind: "transfer_in",
          refType: "stock_request",
          refId: request.id,
          createdByUserId: admin.id,
          createdAt: fulfilled.createdAt,
        },
      );
    }
  }
  for (const batch of planned) {
    const received =
      batch.finalQty + batch.soldQty + batch.transferredOutQty - batch.transferredInQty;
    if (received !== 0) {
      movements.push({
        id: nextId(),
        batchId: batch.row.id,
        qty: received,
        kind: "receive",
        refType: "receipt",
        refId: null,
        createdByUserId: admin.id,
        createdAt: batch.row.receivedAt,
      });
    }
  }
  for (const sale of sales) {
    for (const line of sale.lines) {
      for (const allocation of line.batches) {
        movements.push({
          id: nextId(),
          batchId: allocation.batchId,
          qty: -allocation.qty,
          kind: "sale",
          refType: "sale",
          refId: sale.id,
          createdByUserId: sale.cashierUserId,
          createdAt: sale.soldAt,
        });
      }
    }
  }
  movements.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    generatedAt: now.toISOString(),
    settings,
    branches,
    users,
    devices,
    products,
    batches: planned.map((batch) => batch.row),
    movements,
    discounts,
    sales: sales.reverse(),
    requests,
    nextRequestSequence: 1044,
    nextReceiptSequence: Object.fromEntries(
      devices.map((device) => [device.id, (receiptSequence.get(device.branchId) ?? 0) + 1]),
    ),
  };
}

/** The mockup's quantity for a batch, for tests: final on hand per (sku, branch code, batch no). */
export function mockupQuantities(dataset: MockupDataset): Map<string, number> {
  const onHand = new Map<string, number>();
  for (const movement of dataset.movements)
    onHand.set(movement.batchId, (onHand.get(movement.batchId) ?? 0) + movement.qty);
  const product = new Map(dataset.products.map((p) => [p.id, p]));
  const branch = new Map(dataset.branches.map((b) => [b.id, b]));
  const result = new Map<string, number>();
  for (const batch of dataset.batches) {
    result.set(
      `${product.get(batch.productId)?.sku ?? ""}|${branch.get(batch.branchId)?.code ?? ""}|${batch.batchNo}`,
      onHand.get(batch.id) ?? 0,
    );
  }
  return result;
}

export const MOCKUP_CORE_BATCHES = CORE_BATCHES.map(([sku, branch, batchNo, qty]) => ({
  sku,
  branchCode: BRANCHES.find((b) => b.key === branch)?.code ?? "",
  batchNo,
  qty,
}));

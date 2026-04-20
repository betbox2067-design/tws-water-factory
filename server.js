const express = require("express");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET =
  process.env.JWT_SECRET || "tws-water-factory-secure-key-2024";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Database Setup ───────────────────────────────────────────────────────────
const db = new Database(process.env.DB_PATH || path.join(__dirname, "tws.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raw_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  min_quantity REAL DEFAULT 0,
  cost_per_unit REAL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS material_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  quantity REAL NOT NULL,
  note TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (material_id) REFERENCES raw_materials(id)
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  size_ml INTEGER,
  unit TEXT DEFAULT 'ขวด',
  price REAL DEFAULT 0,
  cost REAL DEFAULT 0,
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS production_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  quantity_planned INTEGER NOT NULL,
  quantity_produced INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_by INTEGER,
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  type TEXT DEFAULT 'retail',
  credit_limit REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL,
  order_date DATE NOT NULL,
  due_date DATE,
  status TEXT DEFAULT 'pending',
  total_amount REAL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS sales_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES sales_orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  driver_name TEXT,
  vehicle_number TEXT,
  delivery_date DATE,
  delivered_at DATETIME,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES sales_orders(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  payment_date DATE NOT NULL,
  method TEXT DEFAULT 'cash',
  reference TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES sales_orders(id)
);

CREATE TABLE IF NOT EXISTS water_quality_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_number TEXT,
  production_order_id INTEGER,
  ph REAL,
  tds REAL,
  turbidity REAL,
  chlorine REAL,
  bacteria_count REAL,
  color_value REAL,
  odor TEXT DEFAULT 'ปกติ',
  taste TEXT DEFAULT 'ปกติ',
  result TEXT DEFAULT 'pending',
  tester TEXT,
  test_date DATE NOT NULL,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (production_order_id) REFERENCES production_orders(id)
);

CREATE TABLE IF NOT EXISTS product_bom (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  material_id INTEGER NOT NULL,
  quantity_per_unit REAL NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (material_id) REFERENCES raw_materials(id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL,
  expense_date DATE NOT NULL,
  receipt_ref TEXT,
  vendor TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_number TEXT UNIQUE NOT NULL,
  supplier_id INTEGER NOT NULL,
  order_date DATE NOT NULL,
  expected_date DATE,
  status TEXT DEFAULT 'draft',
  total_amount REAL DEFAULT 0,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL,
  material_id INTEGER NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (material_id) REFERENCES raw_materials(id)
);

CREATE TABLE IF NOT EXISTS equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  model TEXT,
  location TEXT,
  purchase_date DATE,
  status TEXT DEFAULT 'active',
  last_maintenance DATE,
  next_maintenance DATE,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS maintenance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id INTEGER NOT NULL,
  maintenance_type TEXT NOT NULL,
  description TEXT,
  cost REAL DEFAULT 0,
  performed_by TEXT,
  performed_date DATE NOT NULL,
  next_due DATE,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id)
);

CREATE TABLE IF NOT EXISTS container_deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  container_type TEXT DEFAULT 'ถัง 19L',
  quantity_out INTEGER DEFAULT 0,
  quantity_returned INTEGER DEFAULT 0,
  deposit_amount REAL DEFAULT 0,
  transaction_date DATE NOT NULL,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,
  product_id INTEGER,
  batch_number TEXT,
  quantity INTEGER NOT NULL,
  reason TEXT NOT NULL,
  return_date DATE NOT NULL,
  status TEXT DEFAULT 'pending',
  action_taken TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES sales_orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS delivery_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_name TEXT NOT NULL,
  driver_name TEXT,
  vehicle_number TEXT,
  delivery_date DATE NOT NULL,
  status TEXT DEFAULT 'planned',
  total_orders INTEGER DEFAULT 0,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delivery_route_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  sequence_number INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  FOREIGN KEY (route_id) REFERENCES delivery_routes(id),
  FOREIGN KEY (order_id) REFERENCES sales_orders(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  user_name TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// ─── Seed Data ────────────────────────────────────────────────────────────────
// Add new columns to existing tables
try { db.exec("ALTER TABLE production_orders ADD COLUMN batch_number TEXT"); } catch {}
try { db.exec("ALTER TABLE production_orders ADD COLUMN expiry_date DATE"); } catch {}

const adminExists = db
  .prepare("SELECT id FROM users WHERE username = ?")
  .get("admin");
if (!adminExists) {
  const insertUser = db.prepare(
    "INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)",
  );
  insertUser.run(
    "admin",
    bcrypt.hashSync("admin123", 10),
    "ผู้ดูแลระบบ",
    "admin",
  );
  insertUser.run(
    "manager",
    bcrypt.hashSync("manager123", 10),
    "ผู้จัดการ",
    "manager",
  );
  insertUser.run("staff", bcrypt.hashSync("staff123", 10), "พนักงาน", "staff");

  const insertProduct = db.prepare(
    "INSERT INTO products (code,name,size_ml,unit,price,cost,stock,min_stock) VALUES (?,?,?,?,?,?,?,?)",
  );
  insertProduct.run("P001", "น้ำดื่มตะวันแดง 350ml", 350, "ขวด", 6, 3, 200, 50);
  insertProduct.run("P002", "น้ำดื่มตะวันแดง 600ml", 600, "ขวด", 8, 4, 150, 50);
  insertProduct.run(
    "P003",
    "น้ำดื่มตะวันแดง 1.5L",
    1500,
    "ขวด",
    12,
    6,
    100,
    30,
  );
  insertProduct.run("P004", "น้ำดื่มตะวันแดง 5L", 5000, "ขวด", 25, 15, 50, 20);
  insertProduct.run(
    "P005",
    "น้ำดื่มตะวันแดง ถัง 19L",
    19000,
    "ถัง",
    40,
    25,
    30,
    10,
  );

  const insertMat = db.prepare(
    "INSERT INTO raw_materials (code,name,unit,quantity,min_quantity,cost_per_unit) VALUES (?,?,?,?,?,?)",
  );
  insertMat.run("M001", "ขวด PET 350ml", "ใบ", 2000, 500, 0.8);
  insertMat.run("M002", "ขวด PET 600ml", "ใบ", 1500, 500, 1.2);
  insertMat.run("M003", "ขวด PET 1.5L", "ใบ", 1000, 300, 1.8);
  insertMat.run("M004", "ขวด PET 5L", "ใบ", 500, 200, 5.0);
  insertMat.run("M005", "ถัง PP 19L", "ใบ", 200, 100, 80.0);
  insertMat.run("M006", "ฝาขวดน้ำ", "ใบ", 5000, 1000, 0.3);
  insertMat.run("M007", "ฉลาก 350ml", "ใบ", 2000, 500, 0.2);
  insertMat.run("M008", "ฉลาก 600ml", "ใบ", 1500, 500, 0.25);
  insertMat.run("M009", "ฉลาก 1.5L", "ใบ", 1000, 300, 0.35);
  insertMat.run("M010", "สารกรอง RO", "ชุด", 5, 2, 500.0);
  insertMat.run("M011", "คาร์บอนกรอง", "กก.", 20, 5, 50.0);
  insertMat.run("M012", "ซีลฝาถัง", "ใบ", 500, 100, 1.5);

  const insertCust = db.prepare(
    "INSERT INTO customers (code,name,phone,address,type,credit_limit) VALUES (?,?,?,?,?,?)",
  );
  insertCust.run(
    "C001",
    "ร้านค้า นายสมชาย ใจดี",
    "0812345678",
    "123 ถ.ราษฎร์บูรณะ กรุงเทพฯ",
    "retail",
    5000,
  );
  insertCust.run(
    "C002",
    "ซุปเปอร์มาร์เก็ต ABC",
    "0898765432",
    "456 ถ.สุขุมวิท กรุงเทพฯ",
    "wholesale",
    50000,
  );
  insertCust.run(
    "C003",
    "บริษัท XYZ Corporation จำกัด",
    "0223456789",
    "789 ถ.พระราม 4 กรุงเทพฯ",
    "corporate",
    100000,
  );
  insertCust.run(
    "C004",
    "ตัวแทนจำหน่ายภาคเหนือ",
    "0534567890",
    "321 ถ.นิมมาน เชียงใหม่",
    "distributor",
    200000,
  );

  // Seed BOM (Bill of Materials)
  const insertBom = db.prepare("INSERT INTO product_bom (product_id, material_id, quantity_per_unit) VALUES (?,?,?)");
  insertBom.run(1, 1, 1);   // P001 (350ml) → ขวด PET 350ml x1
  insertBom.run(1, 6, 1);   // P001 → ฝาขวด x1
  insertBom.run(1, 7, 1);   // P001 → ฉลาก 350ml x1
  insertBom.run(2, 2, 1);   // P002 (600ml) → ขวด PET 600ml x1
  insertBom.run(2, 6, 1);   // P002 → ฝาขวด x1
  insertBom.run(2, 8, 1);   // P002 → ฉลาก 600ml x1
  insertBom.run(3, 3, 1);   // P003 (1.5L) → ขวด PET 1.5L x1
  insertBom.run(3, 6, 1);   // P003 → ฝาขวด x1
  insertBom.run(3, 9, 1);   // P003 → ฉลาก 1.5L x1
  insertBom.run(4, 4, 1);   // P004 (5L) → ขวด PET 5L x1
  insertBom.run(4, 6, 1);   // P004 → ฝาขวด x1
  insertBom.run(5, 5, 1);   // P005 (19L) → ถัง PP 19L x1
  insertBom.run(5, 12, 1);  // P005 → ซีลฝาถัง x1

  // Seed Suppliers
  const insertSup = db.prepare("INSERT INTO suppliers (code,name,contact_person,phone,email,address) VALUES (?,?,?,?,?,?)");
  insertSup.run("SUP001", "บริษัท ขวดพลาสติก จำกัด", "นายสมศักดิ์", "0811111111", "bottle@supplier.com", "กรุงเทพฯ");
  insertSup.run("SUP002", "บริษัท ฝาจีบ จำกัด", "นายวิชัย", "0822222222", "cap@supplier.com", "สมุทรปราการ");
  insertSup.run("SUP003", "บริษัท ฉลากพิมพ์ จำกัด", "นางสมจิต", "0833333333", "label@supplier.com", "นนทบุรี");
  insertSup.run("SUP004", "บริษัท สารกรอง จำกัด", "นายประเสริฐ", "0844444444", "filter@supplier.com", "ปทุมธานี");

  // Seed Equipment
  const insertEq = db.prepare("INSERT INTO equipment (code,name,type,model,location,status) VALUES (?,?,?,?,?,?)");
  insertEq.run("EQ001", "เครื่องกรอง RO หลัก", "กรอง", "RO-5000", "โซนกรองน้ำ", "active");
  insertEq.run("EQ002", "เครื่อง UV ฆ่าเชื้อ", "ฆ่าเชื้อ", "UV-3000", "โซนฆ่าเชื้อ", "active");
  insertEq.run("EQ003", "เครื่องบรรจุ 350-600ml", "บรรจุ", "FL-AUTO-1", "สายผลิต 1", "active");
  insertEq.run("EQ004", "เครื่องบรรจุ 1.5-5L", "บรรจุ", "FL-AUTO-2", "สายผลิต 2", "active");
  insertEq.run("EQ005", "เครื่องบรรจุถัง 19L", "บรรจุ", "JUG-FILL-1", "สายผลิต 3", "active");
  insertEq.run("EQ006", "เครื่องปิดฝาอัตโนมัติ", "ปิดฝา", "CAP-AUTO-1", "สายผลิต 1", "active");
  insertEq.run("EQ007", "เครื่องติดฉลาก", "ติดฉลาก", "LBL-AUTO-1", "สายผลิต 1", "active");
  insertEq.run("EQ008", "ปั๊มน้ำหลัก", "ปั๊ม", "PUMP-500", "โซนน้ำดิบ", "active");
}

// Audit log helper
function logAudit(userId, userName, action, entity, entityId, details) {
  db.prepare("INSERT INTO audit_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?,?,?,?,?)").run(userId, userName, action, entity, entityId, details);
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────
const auth =
  (roles = []) =>
  (req, res, next) => {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "ไม่ได้เข้าสู่ระบบ" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: "ไม่มีสิทธิ์เข้าถึง" });
      }
      next();
    } catch {
      res.status(401).json({ error: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" });
    }
  };

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
  const user = db
    .prepare("SELECT * FROM users WHERE username = ? AND active = 1")
    .get(username);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
  const token = jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: "12h" },
  );
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    },
  });
});

app.get("/api/auth/me", auth(), (req, res) => res.json(req.user));

// ─── Dashboard ────────────────────────────────────────────────────────────────
app.get("/api/dashboard", auth(), (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const thisMonth = today.substring(0, 7);

  const todaySales = db
    .prepare(
      "SELECT COALESCE(SUM(total_amount),0) as v FROM sales_orders WHERE order_date=? AND status!='cancelled'",
    )
    .get(today).v;
  const monthSales = db
    .prepare(
      "SELECT COALESCE(SUM(total_amount),0) as v FROM sales_orders WHERE strftime('%Y-%m',order_date)=? AND status!='cancelled'",
    )
    .get(thisMonth).v;
  const pendingOrders = db
    .prepare(
      "SELECT COUNT(*) as v FROM sales_orders WHERE status IN ('pending','confirmed')",
    )
    .get().v;
  const totalCustomers = db
    .prepare("SELECT COUNT(*) as v FROM customers WHERE active=1")
    .get().v;
  const totalProducts = db
    .prepare("SELECT COUNT(*) as v FROM products WHERE active=1")
    .get().v;
  const lowStock = db
    .prepare(
      "SELECT COUNT(*) as v FROM products WHERE stock<=min_stock AND active=1",
    )
    .get().v;
  const pendingProd = db
    .prepare(
      "SELECT COUNT(*) as v FROM production_orders WHERE status IN ('pending','in_progress')",
    )
    .get().v;
  const lowMaterials = db
    .prepare(
      "SELECT COUNT(*) as v FROM raw_materials WHERE quantity<=min_quantity",
    )
    .get().v;
  const unpaidAmount = db
    .prepare(
      "SELECT COALESCE(SUM(total_amount-paid_amount),0) as v FROM sales_orders WHERE status NOT IN ('paid','cancelled')",
    )
    .get().v;

  const salesChart = db
    .prepare(
      `
    SELECT order_date as date, COALESCE(SUM(total_amount),0) as total
    FROM sales_orders WHERE order_date>=date('now','-6 days') AND status!='cancelled'
    GROUP BY order_date ORDER BY order_date
  `,
    )
    .all();

  const topProducts = db
    .prepare(
      `
    SELECT p.name, SUM(si.quantity) as qty, SUM(si.subtotal) as total
    FROM sales_items si
    JOIN sales_orders so ON si.order_id=so.id
    JOIN products p ON si.product_id=p.id
    WHERE strftime('%Y-%m',so.order_date)=? AND so.status!='cancelled'
    GROUP BY si.product_id ORDER BY qty DESC LIMIT 5
  `,
    )
    .all(thisMonth);

  const recentOrders = db
    .prepare(
      `
    SELECT so.id, so.order_number, c.name as customer_name, so.total_amount, so.status, so.order_date
    FROM sales_orders so JOIN customers c ON so.customer_id=c.id
    ORDER BY so.created_at DESC LIMIT 5
  `,
    )
    .all();

  res.json({
    todaySales,
    monthSales,
    pendingOrders,
    totalCustomers,
    totalProducts,
    lowStock,
    pendingProd,
    lowMaterials,
    unpaidAmount,
    salesChart,
    topProducts,
    recentOrders,
  });
});

// ─── Raw Materials ────────────────────────────────────────────────────────────
app.get("/api/materials", auth(), (req, res) => {
  res.json(db.prepare("SELECT * FROM raw_materials ORDER BY code").all());
});

app.post("/api/materials", auth(["admin", "manager"]), (req, res) => {
  const { code, name, unit, quantity, min_quantity, cost_per_unit } = req.body;
  if (!code || !name || !unit)
    return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
  try {
    const r = db
      .prepare(
        "INSERT INTO raw_materials (code,name,unit,quantity,min_quantity,cost_per_unit) VALUES (?,?,?,?,?,?)",
      )
      .run(
        code,
        name,
        unit,
        quantity || 0,
        min_quantity || 0,
        cost_per_unit || 0,
      );
    res.json({ id: r.lastInsertRowid, message: "เพิ่มวัตถุดิบสำเร็จ" });
  } catch {
    res.status(400).json({ error: "รหัสวัตถุดิบซ้ำ" });
  }
});

app.put("/api/materials/:id", auth(["admin", "manager"]), (req, res) => {
  const { name, unit, min_quantity, cost_per_unit } = req.body;
  db.prepare(
    "UPDATE raw_materials SET name=?,unit=?,min_quantity=?,cost_per_unit=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
  ).run(name, unit, min_quantity, cost_per_unit, req.params.id);
  res.json({ message: "แก้ไขสำเร็จ" });
});

app.delete("/api/materials/:id", auth(["admin"]), (req, res) => {
  db.prepare("DELETE FROM raw_materials WHERE id=?").run(req.params.id);
  res.json({ message: "ลบสำเร็จ" });
});

app.post("/api/materials/:id/adjust", auth(), (req, res) => {
  const { type, quantity, note } = req.body;
  if (!quantity || quantity <= 0)
    return res.status(400).json({ error: "จำนวนไม่ถูกต้อง" });
  const mat = db
    .prepare("SELECT * FROM raw_materials WHERE id=?")
    .get(req.params.id);
  if (!mat) return res.status(404).json({ error: "ไม่พบวัตถุดิบ" });
  const newQty =
    type === "in" ? mat.quantity + quantity : mat.quantity - quantity;
  if (newQty < 0) return res.status(400).json({ error: "สต็อกไม่เพียงพอ" });
  db.prepare(
    "UPDATE raw_materials SET quantity=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
  ).run(newQty, mat.id);
  db.prepare(
    "INSERT INTO material_logs (material_id,type,quantity,note,created_by) VALUES (?,?,?,?,?)",
  ).run(mat.id, type, quantity, note, req.user.id);
  res.json({ message: "ปรับสต็อกสำเร็จ", newQuantity: newQty });
});

app.get("/api/materials/:id/logs", auth(), (req, res) => {
  const logs = db
    .prepare(
      `
    SELECT ml.*, u.name as created_by_name
    FROM material_logs ml LEFT JOIN users u ON ml.created_by=u.id
    WHERE ml.material_id=? ORDER BY ml.created_at DESC LIMIT 100
  `,
    )
    .all(req.params.id);
  res.json(logs);
});

// ─── Products ─────────────────────────────────────────────────────────────────
app.get("/api/products", auth(), (req, res) => {
  res.json(
    db.prepare("SELECT * FROM products WHERE active=1 ORDER BY code").all(),
  );
});

app.post("/api/products", auth(["admin", "manager"]), (req, res) => {
  const { code, name, size_ml, unit, price, cost, stock, min_stock } = req.body;
  if (!code || !name)
    return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
  try {
    const r = db
      .prepare(
        "INSERT INTO products (code,name,size_ml,unit,price,cost,stock,min_stock) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        code,
        name,
        size_ml || 0,
        unit || "ขวด",
        price || 0,
        cost || 0,
        stock || 0,
        min_stock || 0,
      );
    res.json({ id: r.lastInsertRowid, message: "เพิ่มสินค้าสำเร็จ" });
  } catch {
    res.status(400).json({ error: "รหัสสินค้าซ้ำ" });
  }
});

app.put("/api/products/:id", auth(["admin", "manager"]), (req, res) => {
  const { name, size_ml, unit, price, cost, min_stock } = req.body;
  db.prepare(
    "UPDATE products SET name=?,size_ml=?,unit=?,price=?,cost=?,min_stock=? WHERE id=?",
  ).run(name, size_ml, unit, price, cost, min_stock, req.params.id);
  res.json({ message: "แก้ไขสำเร็จ" });
});

app.delete("/api/products/:id", auth(["admin"]), (req, res) => {
  db.prepare("UPDATE products SET active=0 WHERE id=?").run(req.params.id);
  res.json({ message: "ลบสินค้าสำเร็จ" });
});

// ─── Production ───────────────────────────────────────────────────────────────
app.get("/api/production", auth(), (req, res) => {
  const rows = db
    .prepare(
      `
    SELECT po.*, p.name as product_name, p.unit, u.name as created_by_name
    FROM production_orders po
    JOIN products p ON po.product_id=p.id
    LEFT JOIN users u ON po.created_by=u.id
    ORDER BY po.created_at DESC
  `,
    )
    .all();
  res.json(rows);
});

app.post("/api/production", auth(), (req, res) => {
  const { product_id, quantity_planned, notes } = req.body;
  if (!product_id || !quantity_planned)
    return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
  const today = new Date().toISOString().split('T')[0].replace(/-/g,'');
  const cnt = db.prepare("SELECT COUNT(*) as c FROM production_orders WHERE DATE(created_at)=DATE('now')").get().c;
  const batch_number = `B${today}-${String(cnt+1).padStart(3,'0')}`;
  const expiry_date = new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0];
  const r = db
    .prepare(
      "INSERT INTO production_orders (product_id,quantity_planned,notes,created_by,batch_number,expiry_date) VALUES (?,?,?,?,?,?)",
    )
    .run(product_id, quantity_planned, notes, req.user.id, batch_number, expiry_date);
  logAudit(req.user.id, req.user.name, 'create', 'production', r.lastInsertRowid, `Batch: ${batch_number}`);
  res.json({ id: r.lastInsertRowid, batch_number, message: "สร้างใบสั่งผลิตสำเร็จ" });
});

app.put("/api/production/:id", auth(["admin", "manager"]), (req, res) => {
  const { status, quantity_produced } = req.body;
  const order = db
    .prepare("SELECT * FROM production_orders WHERE id=?")
    .get(req.params.id);
  if (!order) return res.status(404).json({ error: "ไม่พบใบสั่งผลิต" });

  const updateProd = db.transaction(() => {
    let q = "UPDATE production_orders SET status=?";
    const params = [status];
    if (status === "in_progress" && !order.started_at) {
      q += ",started_at=CURRENT_TIMESTAMP";
    }
    if (status === "completed") {
      const produced = quantity_produced || order.quantity_planned;
      q += ",completed_at=CURRENT_TIMESTAMP,quantity_produced=?";
      params.push(produced);
      db.prepare("UPDATE products SET stock=stock+? WHERE id=?").run(
        produced,
        order.product_id,
      );
      // BOM: auto-deduct raw materials
      const bom = db.prepare("SELECT * FROM product_bom WHERE product_id=?").all(order.product_id);
      bom.forEach(b => {
        const deductQty = b.quantity_per_unit * produced;
        db.prepare("UPDATE raw_materials SET quantity=MAX(0,quantity-?),updated_at=CURRENT_TIMESTAMP WHERE id=?").run(deductQty, b.material_id);
        db.prepare("INSERT INTO material_logs (material_id,type,quantity,note,created_by) VALUES (?,?,?,?,?)").run(b.material_id, 'out', deductQty, `ผลิต Batch: ${order.batch_number || 'N/A'} x${produced}`, req.user.id);
      });
    }
    q += " WHERE id=?";
    params.push(req.params.id);
    db.prepare(q).run(...params);
  });
  updateProd();
  res.json({ message: "อัปเดตสถานะสำเร็จ" });
});

app.delete("/api/production/:id", auth(["admin"]), (req, res) => {
  db.prepare("UPDATE production_orders SET status='cancelled' WHERE id=?").run(
    req.params.id,
  );
  res.json({ message: "ยกเลิกใบสั่งผลิตสำเร็จ" });
});

// ─── Customers ────────────────────────────────────────────────────────────────
app.get("/api/customers", auth(), (req, res) => {
  res.json(
    db.prepare("SELECT * FROM customers WHERE active=1 ORDER BY code").all(),
  );
});

app.post("/api/customers", auth(["admin", "manager", "staff"]), (req, res) => {
  const { code, name, phone, address, type, credit_limit } = req.body;
  if (!code || !name)
    return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
  try {
    const r = db
      .prepare(
        "INSERT INTO customers (code,name,phone,address,type,credit_limit) VALUES (?,?,?,?,?,?)",
      )
      .run(code, name, phone, address, type || "retail", credit_limit || 0);
    res.json({ id: r.lastInsertRowid, message: "เพิ่มลูกค้าสำเร็จ" });
  } catch {
    res.status(400).json({ error: "รหัสลูกค้าซ้ำ" });
  }
});

app.put(
  "/api/customers/:id",
  auth(["admin", "manager", "staff"]),
  (req, res) => {
    const { name, phone, address, type, credit_limit } = req.body;
    db.prepare(
      "UPDATE customers SET name=?,phone=?,address=?,type=?,credit_limit=? WHERE id=?",
    ).run(name, phone, address, type, credit_limit, req.params.id);
    res.json({ message: "แก้ไขสำเร็จ" });
  },
);

app.delete("/api/customers/:id", auth(["admin"]), (req, res) => {
  db.prepare("UPDATE customers SET active=0 WHERE id=?").run(req.params.id);
  res.json({ message: "ลบลูกค้าสำเร็จ" });
});

// ─── Sales ────────────────────────────────────────────────────────────────────
app.get("/api/sales", auth(), (req, res) => {
  const { status, from, to, customer_id } = req.query;
  let q = `
    SELECT so.*, c.name as customer_name, c.phone as customer_phone, u.name as created_by_name
    FROM sales_orders so JOIN customers c ON so.customer_id=c.id
    LEFT JOIN users u ON so.created_by=u.id WHERE 1=1
  `;
  const p = [];
  if (status) {
    q += " AND so.status=?";
    p.push(status);
  }
  if (from) {
    q += " AND so.order_date>=?";
    p.push(from);
  }
  if (to) {
    q += " AND so.order_date<=?";
    p.push(to);
  }
  if (customer_id) {
    q += " AND so.customer_id=?";
    p.push(customer_id);
  }
  q += " ORDER BY so.created_at DESC";
  res.json(db.prepare(q).all(...p));
});

app.get("/api/sales/:id", auth(), (req, res) => {
  const order = db
    .prepare(
      `
    SELECT so.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address
    FROM sales_orders so JOIN customers c ON so.customer_id=c.id WHERE so.id=?
  `,
    )
    .get(req.params.id);
  if (!order) return res.status(404).json({ error: "ไม่พบใบสั่งซื้อ" });
  const items = db
    .prepare(
      "SELECT si.*,p.name as product_name,p.unit FROM sales_items si JOIN products p ON si.product_id=p.id WHERE si.order_id=?",
    )
    .all(req.params.id);
  const payments = db
    .prepare(
      "SELECT p.*,u.name as by_name FROM payments p LEFT JOIN users u ON p.created_by=u.id WHERE p.order_id=? ORDER BY p.payment_date",
    )
    .all(req.params.id);
  const delivery = db
    .prepare("SELECT * FROM deliveries WHERE order_id=?")
    .get(req.params.id);
  res.json({ ...order, items, payments, delivery });
});

app.post("/api/sales", auth(), (req, res) => {
  const { customer_id, order_date, due_date, items, discount, notes } =
    req.body;
  if (!customer_id || !order_date || !items?.length)
    return res.status(400).json({ error: "ข้อมูลไม่ครบ" });

  // Check credit limit
  const customer = db.prepare("SELECT * FROM customers WHERE id=?").get(customer_id);
  if (customer && customer.credit_limit > 0) {
    const outstanding = db.prepare("SELECT COALESCE(SUM(total_amount-paid_amount),0) as v FROM sales_orders WHERE customer_id=? AND status NOT IN ('paid','cancelled')").get(customer_id).v;
    const subtotals_check = items.map(i => i.quantity * i.unit_price);
    const newTotal = subtotals_check.reduce((a,b)=>a+b, 0) - (discount || 0);
    if (outstanding + newTotal > customer.credit_limit) {
      return res.status(400).json({ error: `เกินวงเงินเครดิต (วงเงิน ${customer.credit_limit.toLocaleString()} / ค้างชำระ ${outstanding.toLocaleString()})` });
    }
  }

  // Validate quantities
  for (const item of items) {
    if (!item.quantity || item.quantity <= 0)
      return res.status(400).json({ error: "จำนวนสินค้าต้องมากกว่า 0" });
    if (!item.unit_price || item.unit_price < 0)
      return res.status(400).json({ error: "ราคาสินค้าไม่ถูกต้อง" });
    const prod = db
      .prepare("SELECT stock, name FROM products WHERE id=?")
      .get(item.product_id);
    if (!prod) return res.status(400).json({ error: "ไม่พบสินค้า" });
    if (prod.stock < item.quantity)
      return res
        .status(400)
        .json({
          error: `สินค้า "${prod.name}" สต็อกไม่พอ (คงเหลือ ${prod.stock})`,
        });
  }

  const cnt = db.prepare("SELECT COUNT(*) as c FROM sales_orders").get().c;
  const order_number = "SO" + String(cnt + 1).padStart(5, "0");
  const subtotals = items.map((i) => i.quantity * i.unit_price);
  const total = subtotals.reduce((a, b) => a + b, 0) - (discount || 0);

  const create = db.transaction(() => {
    const r = db
      .prepare(
        "INSERT INTO sales_orders (order_number,customer_id,order_date,due_date,total_amount,discount,notes,created_by) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        order_number,
        customer_id,
        order_date,
        due_date,
        total,
        discount || 0,
        notes,
        req.user.id,
      );
    const stmt = db.prepare(
      "INSERT INTO sales_items (order_id,product_id,quantity,unit_price,subtotal) VALUES (?,?,?,?,?)",
    );
    items.forEach((item, i) =>
      stmt.run(
        r.lastInsertRowid,
        item.product_id,
        item.quantity,
        item.unit_price,
        subtotals[i],
      ),
    );
    return r.lastInsertRowid;
  });
  const id = create();
  res.json({ id, order_number, message: "สร้างใบสั่งซื้อสำเร็จ" });
});

app.put("/api/sales/:id/status", auth(), (req, res) => {
  const { status } = req.body;
  const order = db
    .prepare("SELECT * FROM sales_orders WHERE id=?")
    .get(req.params.id);
  if (!order) return res.status(404).json({ error: "ไม่พบใบสั่งซื้อ" });

  const update = db.transaction(() => {
    db.prepare("UPDATE sales_orders SET status=? WHERE id=?").run(
      status,
      req.params.id,
    );
    if (
      status === "delivered" &&
      order.status !== "delivered" &&
      order.status !== "paid"
    ) {
      db.prepare("SELECT * FROM sales_items WHERE order_id=?")
        .all(req.params.id)
        .forEach((item) =>
          db
            .prepare("UPDATE products SET stock=stock-? WHERE id=?")
            .run(item.quantity, item.product_id),
        );
    }
  });
  update();
  res.json({ message: "อัปเดตสถานะสำเร็จ" });
});

app.delete("/api/sales/:id", auth(["admin", "manager"]), (req, res) => {
  db.prepare("UPDATE sales_orders SET status='cancelled' WHERE id=?").run(
    req.params.id,
  );
  res.json({ message: "ยกเลิกใบสั่งซื้อสำเร็จ" });
});

// ─── Payments ─────────────────────────────────────────────────────────────────
app.post("/api/payments", auth(), (req, res) => {
  const { order_id, amount, payment_date, method, reference, notes } = req.body;
  if (!order_id || !amount || !payment_date)
    return res.status(400).json({ error: "ข้อมูลไม่ครบ" });
  const order = db
    .prepare("SELECT * FROM sales_orders WHERE id=?")
    .get(order_id);
  if (!order) return res.status(404).json({ error: "ไม่พบใบสั่งซื้อ" });

  // Check overpayment
  const currentPaid = db
    .prepare(
      "SELECT COALESCE(SUM(amount),0) as v FROM payments WHERE order_id=?",
    )
    .get(order_id).v;
  const remaining = order.total_amount - currentPaid;
  if (amount > remaining)
    return res
      .status(400)
      .json({ error: `ยอดชำระเกิน (ค้างชำระ ${remaining.toFixed(2)} บาท)` });

  const pay = db.transaction(() => {
    db.prepare(
      "INSERT INTO payments (order_id,amount,payment_date,method,reference,notes,created_by) VALUES (?,?,?,?,?,?,?)",
    ).run(
      order_id,
      amount,
      payment_date,
      method || "cash",
      reference,
      notes,
      req.user.id,
    );
    const totalPaid = db
      .prepare(
        "SELECT COALESCE(SUM(amount),0) as v FROM payments WHERE order_id=?",
      )
      .get(order_id).v;
    const newStatus = totalPaid >= order.total_amount ? "paid" : "confirmed";
    db.prepare("UPDATE sales_orders SET paid_amount=?,status=? WHERE id=?").run(
      totalPaid,
      newStatus,
      order_id,
    );
    // Update customer balance (credit)
    db.prepare(
      "UPDATE customers SET balance=balance+? WHERE id=? AND type!=?",
    ).run(amount, order.customer_id, "retail");
  });
  pay();
  res.json({ message: "บันทึกการชำระเงินสำเร็จ" });
});

// ─── Deliveries ───────────────────────────────────────────────────────────────
app.get("/api/deliveries", auth(), (req, res) => {
  const rows = db
    .prepare(
      `
    SELECT d.*, so.order_number, so.total_amount, c.name as customer_name, c.address
    FROM deliveries d
    JOIN sales_orders so ON d.order_id=so.id
    JOIN customers c ON so.customer_id=c.id
    ORDER BY d.delivery_date DESC, d.created_at DESC
  `,
    )
    .all();
  res.json(rows);
});

app.post("/api/deliveries", auth(), (req, res) => {
  const { order_id, driver_name, vehicle_number, delivery_date, notes } =
    req.body;
  if (!order_id) return res.status(400).json({ error: "กรุณาเลือกใบสั่งซื้อ" });
  const existing = db
    .prepare("SELECT id FROM deliveries WHERE order_id=?")
    .get(order_id);
  if (existing)
    return res.status(400).json({ error: "ใบสั่งซื้อนี้มีใบส่งของแล้ว" });
  const r = db
    .prepare(
      "INSERT INTO deliveries (order_id,driver_name,vehicle_number,delivery_date,notes) VALUES (?,?,?,?,?)",
    )
    .run(order_id, driver_name, vehicle_number, delivery_date, notes);
  db.prepare(
    "UPDATE sales_orders SET status='confirmed' WHERE id=? AND status='pending'",
  ).run(order_id);
  res.json({ id: r.lastInsertRowid, message: "สร้างใบส่งของสำเร็จ" });
});

app.put("/api/deliveries/:id", auth(), (req, res) => {
  const { status, driver_name, vehicle_number, delivery_date, notes } =
    req.body;
  const del = db
    .prepare("SELECT * FROM deliveries WHERE id=?")
    .get(req.params.id);
  if (!del) return res.status(404).json({ error: "ไม่พบใบส่งของ" });

  const updateDel = db.transaction(() => {
    db.prepare(
      "UPDATE deliveries SET status=?,driver_name=?,vehicle_number=?,delivery_date=?,notes=? WHERE id=?",
    ).run(
      status,
      driver_name,
      vehicle_number,
      delivery_date,
      notes,
      req.params.id,
    );
    if (status === "delivered") {
      db.prepare(
        "UPDATE deliveries SET delivered_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(req.params.id);
      const order = db
        .prepare("SELECT * FROM sales_orders WHERE id=?")
        .get(del.order_id);
      if (order && !["delivered", "paid"].includes(order.status)) {
        db.prepare("SELECT * FROM sales_items WHERE order_id=?")
          .all(del.order_id)
          .forEach((item) =>
            db
              .prepare("UPDATE products SET stock=stock-? WHERE id=?")
              .run(item.quantity, item.product_id),
          );
        db.prepare("UPDATE sales_orders SET status='delivered' WHERE id=?").run(
          del.order_id,
        );
      }
    }
  });
  updateDel();
  res.json({ message: "อัปเดตสำเร็จ" });
});

// ─── Reports ──────────────────────────────────────────────────────────────────
app.get("/api/reports/sales", auth(), (req, res) => {
  const from =
    req.query.from ||
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0];
  const to = req.query.to || new Date().toISOString().split("T")[0];

  const summary = db
    .prepare(
      `
    SELECT COUNT(*) as orders, COALESCE(SUM(total_amount),0) as revenue,
           COALESCE(SUM(paid_amount),0) as paid, COALESCE(SUM(total_amount-paid_amount),0) as unpaid
    FROM sales_orders WHERE order_date BETWEEN ? AND ? AND status!='cancelled'
  `,
    )
    .get(from, to);

  const byDay = db
    .prepare(
      `
    SELECT order_date as date, COUNT(*) as orders, COALESCE(SUM(total_amount),0) as revenue
    FROM sales_orders WHERE order_date BETWEEN ? AND ? AND status!='cancelled'
    GROUP BY order_date ORDER BY order_date
  `,
    )
    .all(from, to);

  const byProduct = db
    .prepare(
      `
    SELECT p.code, p.name, SUM(si.quantity) as quantity, SUM(si.subtotal) as revenue
    FROM sales_items si JOIN sales_orders so ON si.order_id=so.id JOIN products p ON si.product_id=p.id
    WHERE so.order_date BETWEEN ? AND ? AND so.status!='cancelled'
    GROUP BY si.product_id ORDER BY revenue DESC
  `,
    )
    .all(from, to);

  const byCustomer = db
    .prepare(
      `
    SELECT c.code, c.name, COUNT(so.id) as orders, SUM(so.total_amount) as revenue
    FROM sales_orders so JOIN customers c ON so.customer_id=c.id
    WHERE so.order_date BETWEEN ? AND ? AND so.status!='cancelled'
    GROUP BY so.customer_id ORDER BY revenue DESC LIMIT 10
  `,
    )
    .all(from, to);

  res.json({ summary, byDay, byProduct, byCustomer, from, to });
});

app.get("/api/reports/inventory", auth(), (req, res) => {
  const products = db
    .prepare("SELECT * FROM products WHERE active=1 ORDER BY code")
    .all();
  const materials = db
    .prepare("SELECT * FROM raw_materials ORDER BY code")
    .all();
  const productValue = products.reduce((s, p) => s + p.stock * p.cost, 0);
  const materialValue = materials.reduce(
    (s, m) => s + m.quantity * m.cost_per_unit,
    0,
  );
  res.json({ products, materials, productValue, materialValue });
});

app.get("/api/reports/production", auth(), (req, res) => {
  const from =
    req.query.from ||
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0];
  const to = req.query.to || new Date().toISOString().split("T")[0];

  const orders = db
    .prepare(
      `
    SELECT po.*, p.name as product_name, p.unit, u.name as by_name
    FROM production_orders po JOIN products p ON po.product_id=p.id
    LEFT JOIN users u ON po.created_by=u.id
    WHERE DATE(po.created_at) BETWEEN ? AND ? ORDER BY po.created_at DESC
  `,
    )
    .all(from, to);

  const summary = db
    .prepare(
      `
    SELECT COUNT(*) as total, SUM(quantity_planned) as planned, SUM(quantity_produced) as produced,
           SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) as cancelled
    FROM production_orders WHERE DATE(created_at) BETWEEN ? AND ?
  `,
    )
    .get(from, to);

  res.json({ orders, summary, from, to });
});

// ─── Users ────────────────────────────────────────────────────────────────────
app.get("/api/users", auth(["admin"]), (req, res) => {
  res.json(
    db
      .prepare(
        "SELECT id,username,name,role,active,created_at FROM users ORDER BY id",
      )
      .all(),
  );
});

app.post("/api/users", auth(["admin"]), (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name)
    return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
  if (password.length < 6)
    return res
      .status(400)
      .json({ error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" });
  try {
    const r = db
      .prepare(
        "INSERT INTO users (username,password,name,role) VALUES (?,?,?,?)",
      )
      .run(username, bcrypt.hashSync(password, 10), name, role || "staff");
    res.json({ id: r.lastInsertRowid, message: "เพิ่มผู้ใช้สำเร็จ" });
  } catch {
    res.status(400).json({ error: "ชื่อผู้ใช้ซ้ำ" });
  }
});

app.put("/api/users/:id", auth(["admin"]), (req, res) => {
  const { name, role, active, password } = req.body;
  if (password) {
    db.prepare(
      "UPDATE users SET name=?,role=?,active=?,password=? WHERE id=?",
    ).run(name, role, active, bcrypt.hashSync(password, 10), req.params.id);
  } else {
    db.prepare("UPDATE users SET name=?,role=?,active=? WHERE id=?").run(
      name,
      role,
      active,
      req.params.id,
    );
  }
  res.json({ message: "แก้ไขสำเร็จ" });
});

app.delete("/api/users/:id", auth(["admin"]), (req, res) => {
  const u = db
    .prepare("SELECT username FROM users WHERE id=?")
    .get(req.params.id);
  if (!u) return res.status(404).json({ error: "ไม่พบผู้ใช้" });
  if (u.username === "admin")
    return res.status(400).json({ error: "ไม่สามารถลบ admin ได้" });
  db.prepare("DELETE FROM users WHERE id=?").run(req.params.id);
  res.json({ message: "ลบผู้ใช้สำเร็จ" });
});

// ─── Notifications ────────────────────────────────────────────────────────────
app.get("/api/notifications", auth(), (req, res) => {
  const alerts = [];
  const lowProds = db
    .prepare(
      "SELECT name, stock, min_stock FROM products WHERE stock <= min_stock AND active=1 ORDER BY stock ASC LIMIT 10",
    )
    .all();
  lowProds.forEach((p) =>
    alerts.push({
      type: p.stock === 0 ? "danger" : "warning",
      icon: "droplet-half",
      msg:
        p.stock === 0
          ? `สินค้า "${p.name}" หมดสต็อก`
          : `สินค้า "${p.name}" สต็อกต่ำ (${p.stock}/${p.min_stock})`,
      category: "stock",
    }),
  );
  const lowMats = db
    .prepare(
      "SELECT name, quantity, min_quantity FROM raw_materials WHERE quantity <= min_quantity ORDER BY quantity ASC LIMIT 10",
    )
    .all();
  lowMats.forEach((m) =>
    alerts.push({
      type: m.quantity === 0 ? "danger" : "warning",
      icon: "boxes",
      msg:
        m.quantity === 0
          ? `วัตถุดิบ "${m.name}" หมด`
          : `วัตถุดิบ "${m.name}" ใกล้หมด (${m.quantity}/${m.min_quantity})`,
      category: "stock",
    }),
  );
  const overdue = db
    .prepare(
      "SELECT s.order_number, c.name as customer FROM sales_orders s JOIN customers c ON s.customer_id=c.id WHERE s.status NOT IN ('paid','cancelled') AND s.due_date < date('now') AND s.due_date IS NOT NULL ORDER BY s.due_date ASC LIMIT 10",
    )
    .all();
  overdue.forEach((o) =>
    alerts.push({
      type: "danger",
      icon: "exclamation-circle-fill",
      msg: `ใบ ${o.order_number} (${o.customer}) เกินกำหนดชำระ`,
      category: "payment",
    }),
  );
  const pendProd = db
    .prepare(
      "SELECT COUNT(*) as cnt FROM production_orders WHERE status='pending'",
    )
    .get();
  if (pendProd.cnt > 0)
    alerts.push({
      type: "info",
      icon: "gear-wide-connected",
      msg: `ใบสั่งผลิตรอดำเนินการ ${pendProd.cnt} รายการ`,
      category: "production",
    });
  // Maintenance alerts
  const dueMaint = db.prepare("SELECT e.name FROM equipment e WHERE e.next_maintenance IS NOT NULL AND e.next_maintenance <= date('now','+7 days') AND e.status='active'").all();
  dueMaint.forEach(m => alerts.push({ type: 'warning', icon: 'wrench-adjustable', msg: `เครื่อง "${m.name}" ถึงกำหนดซ่อมบำรุง`, category: 'maintenance' }));
  // Container deposit alerts
  const outDeposits = db.prepare("SELECT c.name, COALESCE(SUM(cd.quantity_out),0)-COALESCE(SUM(cd.quantity_returned),0) as outstanding FROM container_deposits cd JOIN customers c ON cd.customer_id=c.id GROUP BY cd.customer_id HAVING outstanding>5 ORDER BY outstanding DESC LIMIT 5").all();
  outDeposits.forEach(d => alerts.push({ type: 'info', icon: 'archive', msg: `${d.name} ค้างถัง ${d.outstanding} ใบ`, category: 'deposit' }));
  res.json({ count: alerts.length, alerts });
});

// ─── Profit Report ────────────────────────────────────────────────────────────
app.get("/api/reports/profit", auth(), (req, res) => {
  const from =
    req.query.from ||
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0];
  const to = req.query.to || new Date().toISOString().split("T")[0];
  const byProduct = db
    .prepare(
      `
    SELECT p.code, p.name, SUM(si.quantity) as qty,
           SUM(si.subtotal) as revenue, SUM(si.quantity * p.cost) as cost,
           SUM(si.subtotal - si.quantity * p.cost) as profit
    FROM sales_items si JOIN sales_orders so ON si.order_id=so.id JOIN products p ON si.product_id=p.id
    WHERE so.order_date BETWEEN ? AND ? AND so.status NOT IN ('cancelled')
    GROUP BY p.id ORDER BY profit DESC
  `,
    )
    .all(from, to);
  const total = byProduct.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      cost: acc.cost + r.cost,
      profit: acc.profit + r.profit,
    }),
    { revenue: 0, cost: 0, profit: 0 },
  );
  res.json({ byProduct, total, from, to });
});

// ─── Global Search ────────────────────────────────────────────────────────────
app.get("/api/search", auth(), (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q || q.length < 1)
    return res.json({ customers: [], products: [], orders: [] });
  const like = `%${q}%`;
  const customers = db
    .prepare(
      "SELECT id, code, name, phone, type FROM customers WHERE (name LIKE ? OR code LIKE ? OR phone LIKE ?) AND active=1 LIMIT 5",
    )
    .all(like, like, like);
  const products = db
    .prepare(
      "SELECT id, code, name, stock, unit, price FROM products WHERE (name LIKE ? OR code LIKE ?) AND active=1 LIMIT 5",
    )
    .all(like, like);
  const orders = db
    .prepare(
      "SELECT s.id, s.order_number, s.total_amount, s.status, s.order_date, c.name as customer_name FROM sales_orders s JOIN customers c ON s.customer_id=c.id WHERE (s.order_number LIKE ? OR c.name LIKE ?) ORDER BY s.created_at DESC LIMIT 5",
    )
    .all(like, like);
  res.json({ customers, products, orders });
});

// ─── Activity Feed ────────────────────────────────────────────────────────────
app.get("/api/dashboard/activity", auth(), (req, res) => {
  const sales = db
    .prepare(
      "SELECT 'sale' as type, s.order_number as ref, c.name as detail, s.total_amount as amount, s.status, s.created_at FROM sales_orders s JOIN customers c ON s.customer_id=c.id ORDER BY s.created_at DESC LIMIT 5",
    )
    .all();
  const logs = db
    .prepare(
      "SELECT 'material' as type, m.name as ref, CASE ml.type WHEN 'in' THEN 'รับเข้า' ELSE 'เบิกออก' END as detail, ml.quantity as amount, null as status, ml.created_at FROM material_logs ml JOIN raw_materials m ON ml.material_id=m.id ORDER BY ml.created_at DESC LIMIT 4",
    )
    .all();
  const production = db
    .prepare(
      "SELECT 'production' as type, p.name as ref, po.status as detail, po.quantity_planned as amount, po.status, po.created_at FROM production_orders po JOIN products p ON po.product_id=p.id ORDER BY po.created_at DESC LIMIT 4",
    )
    .all();
  const all = [...sales, ...logs, ...production]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 12);
  res.json(all);
});

// ─── Change Own Password ──────────────────────────────────────────────────────
app.put("/api/users/me/password", auth(), (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
  if (new_password.length < 6)
    return res
      .status(400)
      .json({ error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" });
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password))
    return res.status(400).json({ error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" });
  db.prepare("UPDATE users SET password=? WHERE id=?").run(
    bcrypt.hashSync(new_password, 10),
    req.user.id,
  );
  res.json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" });
});

// ─── Water Quality / QC ───────────────────────────────────────────────────────
app.get("/api/qc", auth(), (req, res) => {
  const rows = db.prepare(`
    SELECT qt.*, po.batch_number, p.name as product_name, u.name as created_by_name
    FROM water_quality_tests qt
    LEFT JOIN production_orders po ON qt.production_order_id=po.id
    LEFT JOIN products p ON po.product_id=p.id
    LEFT JOIN users u ON qt.created_by=u.id
    ORDER BY qt.created_at DESC
  `).all();
  res.json(rows);
});

app.post("/api/qc", auth(), (req, res) => {
  const { batch_number, production_order_id, ph, tds, turbidity, chlorine, bacteria_count, color_value, odor, taste, result, tester, test_date, notes } = req.body;
  if (!test_date) return res.status(400).json({ error: "กรุณาระบุวันที่ทดสอบ" });
  const r = db.prepare("INSERT INTO water_quality_tests (batch_number,production_order_id,ph,tds,turbidity,chlorine,bacteria_count,color_value,odor,taste,result,tester,test_date,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(batch_number, production_order_id||null, ph||null, tds||null, turbidity||null, chlorine||null, bacteria_count||null, color_value||null, odor||'ปกติ', taste||'ปกติ', result||'pending', tester, test_date, notes, req.user.id);
  logAudit(req.user.id, req.user.name, 'create', 'qc', r.lastInsertRowid, `QC test batch ${batch_number}`);
  res.json({ id: r.lastInsertRowid, message: "บันทึกผลตรวจสำเร็จ" });
});

app.put("/api/qc/:id", auth(["admin","manager"]), (req, res) => {
  const { ph, tds, turbidity, chlorine, bacteria_count, color_value, odor, taste, result, tester, notes } = req.body;
  db.prepare("UPDATE water_quality_tests SET ph=?,tds=?,turbidity=?,chlorine=?,bacteria_count=?,color_value=?,odor=?,taste=?,result=?,tester=?,notes=? WHERE id=?").run(ph, tds, turbidity, chlorine, bacteria_count, color_value, odor, taste, result, tester, notes, req.params.id);
  res.json({ message: "แก้ไขผลตรวจสำเร็จ" });
});

app.delete("/api/qc/:id", auth(["admin"]), (req, res) => {
  db.prepare("DELETE FROM water_quality_tests WHERE id=?").run(req.params.id);
  res.json({ message: "ลบผลตรวจสำเร็จ" });
});

// ─── BOM (Bill of Materials) ──────────────────────────────────────────────────
app.get("/api/bom/:productId", auth(), (req, res) => {
  const rows = db.prepare(`
    SELECT pb.*, rm.name as material_name, rm.unit, rm.cost_per_unit, rm.quantity as stock
    FROM product_bom pb JOIN raw_materials rm ON pb.material_id=rm.id
    WHERE pb.product_id=?
  `).all(req.params.productId);
  res.json(rows);
});

app.post("/api/bom", auth(["admin","manager"]), (req, res) => {
  const { product_id, material_id, quantity_per_unit } = req.body;
  if (!product_id || !material_id || !quantity_per_unit) return res.status(400).json({ error: "ข้อมูลไม่ครบ" });
  const existing = db.prepare("SELECT id FROM product_bom WHERE product_id=? AND material_id=?").get(product_id, material_id);
  if (existing) return res.status(400).json({ error: "มีวัตถุดิบนี้ใน BOM แล้ว" });
  const r = db.prepare("INSERT INTO product_bom (product_id,material_id,quantity_per_unit) VALUES (?,?,?)").run(product_id, material_id, quantity_per_unit);
  res.json({ id: r.lastInsertRowid, message: "เพิ่มสูตรผลิตสำเร็จ" });
});

app.delete("/api/bom/:id", auth(["admin","manager"]), (req, res) => {
  db.prepare("DELETE FROM product_bom WHERE id=?").run(req.params.id);
  res.json({ message: "ลบรายการ BOM สำเร็จ" });
});

// ─── Expenses ─────────────────────────────────────────────────────────────────
app.get("/api/expenses", auth(), (req, res) => {
  const { from, to, category } = req.query;
  let q = "SELECT e.*, u.name as created_by_name FROM expenses e LEFT JOIN users u ON e.created_by=u.id WHERE 1=1";
  const p = [];
  if (from) { q += " AND e.expense_date>=?"; p.push(from); }
  if (to) { q += " AND e.expense_date<=?"; p.push(to); }
  if (category) { q += " AND e.category=?"; p.push(category); }
  q += " ORDER BY e.expense_date DESC, e.created_at DESC";
  res.json(db.prepare(q).all(...p));
});

app.post("/api/expenses", auth(["admin","manager"]), (req, res) => {
  const { category, description, amount, expense_date, receipt_ref, vendor } = req.body;
  if (!category || !amount || !expense_date) return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
  if (amount <= 0) return res.status(400).json({ error: "จำนวนเงินต้องมากกว่า 0" });
  const r = db.prepare("INSERT INTO expenses (category,description,amount,expense_date,receipt_ref,vendor,created_by) VALUES (?,?,?,?,?,?,?)").run(category, description, amount, expense_date, receipt_ref, vendor, req.user.id);
  logAudit(req.user.id, req.user.name, 'create', 'expense', r.lastInsertRowid, `${category}: ${amount} บาท`);
  res.json({ id: r.lastInsertRowid, message: "บันทึกค่าใช้จ่ายสำเร็จ" });
});

app.put("/api/expenses/:id", auth(["admin","manager"]), (req, res) => {
  const { category, description, amount, expense_date, receipt_ref, vendor } = req.body;
  db.prepare("UPDATE expenses SET category=?,description=?,amount=?,expense_date=?,receipt_ref=?,vendor=? WHERE id=?").run(category, description, amount, expense_date, receipt_ref, vendor, req.params.id);
  res.json({ message: "แก้ไขค่าใช้จ่ายสำเร็จ" });
});

app.delete("/api/expenses/:id", auth(["admin"]), (req, res) => {
  db.prepare("DELETE FROM expenses WHERE id=?").run(req.params.id);
  res.json({ message: "ลบค่าใช้จ่ายสำเร็จ" });
});

app.get("/api/expenses/summary", auth(), (req, res) => {
  const from = req.query.from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const to = req.query.to || new Date().toISOString().split('T')[0];
  const byCategory = db.prepare("SELECT category, SUM(amount) as total, COUNT(*) as count FROM expenses WHERE expense_date BETWEEN ? AND ? GROUP BY category ORDER BY total DESC").all(from, to);
  const total = db.prepare("SELECT COALESCE(SUM(amount),0) as v FROM expenses WHERE expense_date BETWEEN ? AND ?").get(from, to).v;
  const byMonth = db.prepare("SELECT strftime('%Y-%m', expense_date) as month, SUM(amount) as total FROM expenses WHERE expense_date BETWEEN ? AND ? GROUP BY month ORDER BY month").all(from, to);
  res.json({ byCategory, total, byMonth, from, to });
});

// ─── Suppliers ────────────────────────────────────────────────────────────────
app.get("/api/suppliers", auth(), (req, res) => {
  res.json(db.prepare("SELECT * FROM suppliers WHERE active=1 ORDER BY code").all());
});

app.post("/api/suppliers", auth(["admin","manager"]), (req, res) => {
  const { code, name, contact_person, phone, email, address, notes } = req.body;
  if (!code || !name) return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
  try {
    const r = db.prepare("INSERT INTO suppliers (code,name,contact_person,phone,email,address,notes) VALUES (?,?,?,?,?,?,?)").run(code, name, contact_person, phone, email, address, notes);
    res.json({ id: r.lastInsertRowid, message: "เพิ่มซัพพลายเออร์สำเร็จ" });
  } catch { res.status(400).json({ error: "รหัสซัพพลายเออร์ซ้ำ" }); }
});

app.put("/api/suppliers/:id", auth(["admin","manager"]), (req, res) => {
  const { name, contact_person, phone, email, address, notes } = req.body;
  db.prepare("UPDATE suppliers SET name=?,contact_person=?,phone=?,email=?,address=?,notes=? WHERE id=?").run(name, contact_person, phone, email, address, notes, req.params.id);
  res.json({ message: "แก้ไขซัพพลายเออร์สำเร็จ" });
});

app.delete("/api/suppliers/:id", auth(["admin"]), (req, res) => {
  db.prepare("UPDATE suppliers SET active=0 WHERE id=?").run(req.params.id);
  res.json({ message: "ลบซัพพลายเออร์สำเร็จ" });
});

// ─── Purchase Orders ──────────────────────────────────────────────────────────
app.get("/api/purchase-orders", auth(), (req, res) => {
  const rows = db.prepare(`
    SELECT po.*, s.name as supplier_name, u.name as created_by_name
    FROM purchase_orders po
    JOIN suppliers s ON po.supplier_id=s.id
    LEFT JOIN users u ON po.created_by=u.id
    ORDER BY po.created_at DESC
  `).all();
  res.json(rows);
});

app.get("/api/purchase-orders/:id", auth(), (req, res) => {
  const po = db.prepare("SELECT po.*, s.name as supplier_name FROM purchase_orders po JOIN suppliers s ON po.supplier_id=s.id WHERE po.id=?").get(req.params.id);
  if (!po) return res.status(404).json({ error: "ไม่พบใบสั่งซื้อ" });
  const items = db.prepare("SELECT pi.*, rm.name as material_name, rm.unit FROM purchase_items pi JOIN raw_materials rm ON pi.material_id=rm.id WHERE pi.po_id=?").all(req.params.id);
  res.json({ ...po, items });
});

app.post("/api/purchase-orders", auth(["admin","manager"]), (req, res) => {
  const { supplier_id, order_date, expected_date, items, notes } = req.body;
  if (!supplier_id || !order_date || !items?.length) return res.status(400).json({ error: "ข้อมูลไม่ครบ" });
  const cnt = db.prepare("SELECT COUNT(*) as c FROM purchase_orders").get().c;
  const po_number = "PO" + String(cnt+1).padStart(5,"0");
  const subtotals = items.map(i => i.quantity * i.unit_price);
  const total = subtotals.reduce((a,b)=>a+b, 0);
  const create = db.transaction(() => {
    const r = db.prepare("INSERT INTO purchase_orders (po_number,supplier_id,order_date,expected_date,total_amount,notes,created_by) VALUES (?,?,?,?,?,?,?)").run(po_number, supplier_id, order_date, expected_date, total, notes, req.user.id);
    const stmt = db.prepare("INSERT INTO purchase_items (po_id,material_id,quantity,unit_price,subtotal) VALUES (?,?,?,?,?)");
    items.forEach((item,i) => stmt.run(r.lastInsertRowid, item.material_id, item.quantity, item.unit_price, subtotals[i]));
    return r.lastInsertRowid;
  });
  const id = create();
  logAudit(req.user.id, req.user.name, 'create', 'purchase_order', id, `PO: ${po_number}`);
  res.json({ id, po_number, message: "สร้างใบสั่งซื้อสำเร็จ" });
});

app.put("/api/purchase-orders/:id/status", auth(["admin","manager"]), (req, res) => {
  const { status } = req.body;
  const po = db.prepare("SELECT * FROM purchase_orders WHERE id=?").get(req.params.id);
  if (!po) return res.status(404).json({ error: "ไม่พบใบสั่งซื้อ" });
  const update = db.transaction(() => {
    db.prepare("UPDATE purchase_orders SET status=? WHERE id=?").run(status, req.params.id);
    if (status === 'received') {
      const items = db.prepare("SELECT * FROM purchase_items WHERE po_id=?").all(req.params.id);
      items.forEach(item => {
        db.prepare("UPDATE raw_materials SET quantity=quantity+?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(item.quantity, item.material_id);
        db.prepare("INSERT INTO material_logs (material_id,type,quantity,note,created_by) VALUES (?,?,?,?,?)").run(item.material_id, 'in', item.quantity, `รับจาก PO: ${po.po_number}`, req.user.id);
      });
    }
  });
  update();
  res.json({ message: "อัปเดตสถานะสำเร็จ" });
});

// ─── Equipment & Maintenance ──────────────────────────────────────────────────
app.get("/api/equipment", auth(), (req, res) => {
  const rows = db.prepare("SELECT * FROM equipment ORDER BY code").all();
  rows.forEach(eq => {
    eq.maintenance_count = db.prepare("SELECT COUNT(*) as c FROM maintenance_logs WHERE equipment_id=?").get(eq.id).c;
    eq.last_log = db.prepare("SELECT * FROM maintenance_logs WHERE equipment_id=? ORDER BY performed_date DESC LIMIT 1").get(eq.id);
  });
  res.json(rows);
});

app.post("/api/equipment", auth(["admin","manager"]), (req, res) => {
  const { code, name, type, model, location, purchase_date, notes } = req.body;
  if (!code || !name) return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
  try {
    const r = db.prepare("INSERT INTO equipment (code,name,type,model,location,purchase_date,notes) VALUES (?,?,?,?,?,?,?)").run(code, name, type, model, location, purchase_date, notes);
    res.json({ id: r.lastInsertRowid, message: "เพิ่มอุปกรณ์สำเร็จ" });
  } catch { res.status(400).json({ error: "รหัสอุปกรณ์ซ้ำ" }); }
});

app.put("/api/equipment/:id", auth(["admin","manager"]), (req, res) => {
  const { name, type, model, location, status, notes } = req.body;
  db.prepare("UPDATE equipment SET name=?,type=?,model=?,location=?,status=?,notes=? WHERE id=?").run(name, type, model, location, status, notes, req.params.id);
  res.json({ message: "แก้ไขอุปกรณ์สำเร็จ" });
});

app.delete("/api/equipment/:id", auth(["admin"]), (req, res) => {
  db.prepare("DELETE FROM equipment WHERE id=?").run(req.params.id);
  db.prepare("DELETE FROM maintenance_logs WHERE equipment_id=?").run(req.params.id);
  res.json({ message: "ลบอุปกรณ์สำเร็จ" });
});

app.get("/api/equipment/:id/maintenance", auth(), (req, res) => {
  const logs = db.prepare("SELECT ml.*, u.name as created_by_name FROM maintenance_logs ml LEFT JOIN users u ON ml.created_by=u.id WHERE ml.equipment_id=? ORDER BY ml.performed_date DESC").all(req.params.id);
  res.json(logs);
});

app.post("/api/maintenance", auth(), (req, res) => {
  const { equipment_id, maintenance_type, description, cost, performed_by, performed_date, next_due, notes } = req.body;
  if (!equipment_id || !maintenance_type || !performed_date) return res.status(400).json({ error: "ข้อมูลไม่ครบ" });
  const r = db.prepare("INSERT INTO maintenance_logs (equipment_id,maintenance_type,description,cost,performed_by,performed_date,next_due,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?)").run(equipment_id, maintenance_type, description, cost||0, performed_by, performed_date, next_due, notes, req.user.id);
  db.prepare("UPDATE equipment SET last_maintenance=?,next_maintenance=? WHERE id=?").run(performed_date, next_due, equipment_id);
  logAudit(req.user.id, req.user.name, 'create', 'maintenance', r.lastInsertRowid, `ซ่อมบำรุง: ${maintenance_type}`);
  res.json({ id: r.lastInsertRowid, message: "บันทึกการซ่อมบำรุงสำเร็จ" });
});

// ─── Container Deposits (ถังมัดจำ) ────────────────────────────────────────────
app.get("/api/deposits", auth(), (req, res) => {
  const rows = db.prepare(`
    SELECT cd.*, c.name as customer_name, c.phone as customer_phone, u.name as created_by_name
    FROM container_deposits cd
    JOIN customers c ON cd.customer_id=c.id
    LEFT JOIN users u ON cd.created_by=u.id
    ORDER BY cd.created_at DESC
  `).all();
  res.json(rows);
});

app.get("/api/deposits/summary", auth(), (req, res) => {
  const byCustomer = db.prepare(`
    SELECT c.id, c.name, c.phone,
      COALESCE(SUM(cd.quantity_out),0) as total_out,
      COALESCE(SUM(cd.quantity_returned),0) as total_returned,
      COALESCE(SUM(cd.quantity_out),0) - COALESCE(SUM(cd.quantity_returned),0) as outstanding,
      COALESCE(SUM(cd.deposit_amount),0) as total_deposit
    FROM container_deposits cd JOIN customers c ON cd.customer_id=c.id
    GROUP BY cd.customer_id ORDER BY outstanding DESC
  `).all();
  const totalOut = byCustomer.reduce((s,r)=>s+r.total_out,0);
  const totalReturned = byCustomer.reduce((s,r)=>s+r.total_returned,0);
  res.json({ byCustomer, totalOut, totalReturned, outstanding: totalOut-totalReturned });
});

app.post("/api/deposits", auth(), (req, res) => {
  const { customer_id, container_type, quantity_out, quantity_returned, deposit_amount, transaction_date, notes } = req.body;
  if (!customer_id || !transaction_date) return res.status(400).json({ error: "ข้อมูลไม่ครบ" });
  const r = db.prepare("INSERT INTO container_deposits (customer_id,container_type,quantity_out,quantity_returned,deposit_amount,transaction_date,notes,created_by) VALUES (?,?,?,?,?,?,?,?)").run(customer_id, container_type||'ถัง 19L', quantity_out||0, quantity_returned||0, deposit_amount||0, transaction_date, notes, req.user.id);
  res.json({ id: r.lastInsertRowid, message: "บันทึกถังมัดจำสำเร็จ" });
});

// ─── Returns (คืนสินค้า/ของเสีย) ──────────────────────────────────────────────
app.get("/api/returns", auth(), (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, p.name as product_name, so.order_number, u.name as created_by_name
    FROM returns r
    LEFT JOIN products p ON r.product_id=p.id
    LEFT JOIN sales_orders so ON r.order_id=so.id
    LEFT JOIN users u ON r.created_by=u.id
    ORDER BY r.created_at DESC
  `).all();
  res.json(rows);
});

app.post("/api/returns", auth(), (req, res) => {
  const { order_id, product_id, batch_number, quantity, reason, return_date, notes } = req.body;
  if (!product_id || !quantity || !reason || !return_date) return res.status(400).json({ error: "ข้อมูลไม่ครบ" });
  const r = db.prepare("INSERT INTO returns (order_id,product_id,batch_number,quantity,reason,return_date,notes,created_by) VALUES (?,?,?,?,?,?,?,?)").run(order_id||null, product_id, batch_number, quantity, reason, return_date, notes, req.user.id);
  logAudit(req.user.id, req.user.name, 'create', 'return', r.lastInsertRowid, `คืนสินค้า: ${quantity} ชิ้น`);
  res.json({ id: r.lastInsertRowid, message: "บันทึกการคืนสินค้าสำเร็จ" });
});

app.put("/api/returns/:id", auth(["admin","manager"]), (req, res) => {
  const { status, action_taken } = req.body;
  db.prepare("UPDATE returns SET status=?,action_taken=? WHERE id=?").run(status, action_taken, req.params.id);
  if (status === 'approved') {
    const ret = db.prepare("SELECT * FROM returns WHERE id=?").get(req.params.id);
    if (ret) db.prepare("UPDATE products SET stock=stock+? WHERE id=?").run(ret.quantity, ret.product_id);
  }
  res.json({ message: "อัปเดตสำเร็จ" });
});

// ─── Delivery Routes ──────────────────────────────────────────────────────────
app.get("/api/delivery-routes", auth(), (req, res) => {
  const rows = db.prepare(`
    SELECT dr.*, u.name as created_by_name,
      (SELECT COUNT(*) FROM delivery_route_orders WHERE route_id=dr.id) as order_count
    FROM delivery_routes dr
    LEFT JOIN users u ON dr.created_by=u.id
    ORDER BY dr.delivery_date DESC
  `).all();
  res.json(rows);
});

app.get("/api/delivery-routes/:id", auth(), (req, res) => {
  const route = db.prepare("SELECT * FROM delivery_routes WHERE id=?").get(req.params.id);
  if (!route) return res.status(404).json({ error: "ไม่พบเส้นทาง" });
  const orders = db.prepare(`
    SELECT dro.*, so.order_number, so.total_amount, so.status as order_status,
      c.name as customer_name, c.address, c.phone
    FROM delivery_route_orders dro
    JOIN sales_orders so ON dro.order_id=so.id
    JOIN customers c ON so.customer_id=c.id
    WHERE dro.route_id=? ORDER BY dro.sequence_number
  `).all(req.params.id);
  res.json({ ...route, orders });
});

app.post("/api/delivery-routes", auth(), (req, res) => {
  const { route_name, driver_name, vehicle_number, delivery_date, order_ids, notes } = req.body;
  if (!route_name || !delivery_date) return res.status(400).json({ error: "ข้อมูลไม่ครบ" });
  const create = db.transaction(() => {
    const r = db.prepare("INSERT INTO delivery_routes (route_name,driver_name,vehicle_number,delivery_date,total_orders,notes,created_by) VALUES (?,?,?,?,?,?,?)").run(route_name, driver_name, vehicle_number, delivery_date, (order_ids||[]).length, notes, req.user.id);
    if (order_ids?.length) {
      const stmt = db.prepare("INSERT INTO delivery_route_orders (route_id,order_id,sequence_number) VALUES (?,?,?)");
      order_ids.forEach((oid, i) => stmt.run(r.lastInsertRowid, oid, i+1));
    }
    return r.lastInsertRowid;
  });
  const id = create();
  res.json({ id, message: "สร้างเส้นทางจัดส่งสำเร็จ" });
});

app.put("/api/delivery-routes/:id/status", auth(), (req, res) => {
  const { status } = req.body;
  db.prepare("UPDATE delivery_routes SET status=? WHERE id=?").run(status, req.params.id);
  res.json({ message: "อัปเดตสถานะสำเร็จ" });
});

// ─── Audit Logs ───────────────────────────────────────────────────────────────
app.get("/api/audit-logs", auth(["admin"]), (req, res) => {
  const rows = db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200").all();
  res.json(rows);
});

// ─── App Settings (DB-backed) ─────────────────────────────────────────────────
app.get("/api/settings", auth(), (req, res) => {
  const rows = db.prepare("SELECT * FROM app_settings").all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  res.json(settings);
});

app.put("/api/settings", auth(["admin"]), (req, res) => {
  const entries = Object.entries(req.body);
  const upsert = db.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP");
  entries.forEach(([k,v]) => upsert.run(k, v));
  res.json({ message: "บันทึกการตั้งค่าสำเร็จ" });
});

// ─── Enhanced Reports ─────────────────────────────────────────────────────────
app.get("/api/reports/expenses", auth(), (req, res) => {
  const from = req.query.from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const to = req.query.to || new Date().toISOString().split('T')[0];
  const byCategory = db.prepare("SELECT category, SUM(amount) as total, COUNT(*) as count FROM expenses WHERE expense_date BETWEEN ? AND ? GROUP BY category ORDER BY total DESC").all(from, to);
  const total = db.prepare("SELECT COALESCE(SUM(amount),0) as v FROM expenses WHERE expense_date BETWEEN ? AND ?").get(from, to).v;
  res.json({ byCategory, total, from, to });
});

app.get("/api/reports/credit", auth(), (req, res) => {
  const customers = db.prepare(`
    SELECT c.code, c.name, c.phone, c.credit_limit, c.balance,
      COALESCE(SUM(CASE WHEN so.status NOT IN ('paid','cancelled') THEN so.total_amount-so.paid_amount ELSE 0 END),0) as outstanding
    FROM customers c LEFT JOIN sales_orders so ON c.id=so.customer_id
    WHERE c.active=1 GROUP BY c.id ORDER BY outstanding DESC
  `).all();
  const aging = db.prepare(`
    SELECT c.name,
      SUM(CASE WHEN julianday('now')-julianday(so.due_date) BETWEEN 0 AND 30 THEN so.total_amount-so.paid_amount ELSE 0 END) as d30,
      SUM(CASE WHEN julianday('now')-julianday(so.due_date) BETWEEN 31 AND 60 THEN so.total_amount-so.paid_amount ELSE 0 END) as d60,
      SUM(CASE WHEN julianday('now')-julianday(so.due_date) BETWEEN 61 AND 90 THEN so.total_amount-so.paid_amount ELSE 0 END) as d90,
      SUM(CASE WHEN julianday('now')-julianday(so.due_date) > 90 THEN so.total_amount-so.paid_amount ELSE 0 END) as d90plus
    FROM sales_orders so JOIN customers c ON so.customer_id=c.id
    WHERE so.status NOT IN ('paid','cancelled') AND so.due_date IS NOT NULL
    GROUP BY c.id ORDER BY d90plus DESC
  `).all();
  res.json({ customers, aging });
});

app.get("/api/reports/qc", auth(), (req, res) => {
  const from = req.query.from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const to = req.query.to || new Date().toISOString().split('T')[0];
  const tests = db.prepare("SELECT * FROM water_quality_tests WHERE test_date BETWEEN ? AND ? ORDER BY test_date DESC").all(from, to);
  const summary = db.prepare("SELECT result, COUNT(*) as count FROM water_quality_tests WHERE test_date BETWEEN ? AND ? GROUP BY result").all(from, to);
  const avgValues = db.prepare("SELECT AVG(ph) as avg_ph, AVG(tds) as avg_tds, AVG(turbidity) as avg_turbidity FROM water_quality_tests WHERE test_date BETWEEN ? AND ?").get(from, to);
  res.json({ tests, summary, avgValues, from, to });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api"))
    res.sendFile(path.join(__dirname, "public", "index.html"));
  else res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`\n� น้ำดื่ม ตะวันแดง TWS`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`👤 admin/admin123 | manager/manager123 | staff/staff123\n`);
});

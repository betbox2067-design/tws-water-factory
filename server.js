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
`);

// ─── Seed Data ────────────────────────────────────────────────────────────────
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
  const r = db
    .prepare(
      "INSERT INTO production_orders (product_id,quantity_planned,notes,created_by) VALUES (?,?,?,?)",
    )
    .run(product_id, quantity_planned, notes, req.user.id);
  res.json({ id: r.lastInsertRowid, message: "สร้างใบสั่งผลิตสำเร็จ" });
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

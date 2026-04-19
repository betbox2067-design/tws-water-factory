/* ═══════════════════════════════════════════════════════════
   TWS Water Factory Management System - Frontend JavaScript
═══════════════════════════════════════════════════════════ */

"use strict";

// ─── State ───────────────────────────────────────────────
let currentUser = null;
let allMaterials = [];
let allProducts = [];
let allCustomers = [];
let saleItemCount = 0;
let currentSaleDetailId = null;
let dashCharts = {};
let reportCharts = {};

// ─── API Helper ──────────────────────────────────────────
const api = {
  async call(method, url, data) {
    const token = localStorage.getItem("tws_token");
    const opts = { method, headers: { "Content-Type": "application/json" } };
    if (token) opts.headers["Authorization"] = "Bearer " + token;
    if (data) opts.body = JSON.stringify(data);
    const res = await fetch(url, opts);
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) {
      doLogout();
      throw new Error("Session หมดอายุ");
    }
    if (!res.ok) throw new Error(json.error || "เกิดข้อผิดพลาด");
    return json;
  },
  get: (url) => api.call("GET", url),
  post: (url, d) => api.call("POST", url, d),
  put: (url, d) => api.call("PUT", url, d),
  delete: (url) => api.call("DELETE", url),
};

// ─── Toast ───────────────────────────────────────────────
function toast(msg, type = "success") {
  const el = document.getElementById("toast");
  const txt = document.getElementById("toast-msg");
  txt.textContent = msg;
  el.className = `toast align-items-center text-bg-${type} border-0`;
  new bootstrap.Toast(el, { delay: 3500 }).show();
}

// ─── Formatters ──────────────────────────────────────────
const fmt = {
  currency: (n) =>
    "฿" +
    Number(n || 0).toLocaleString("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  number: (n) => Number(n || 0).toLocaleString("th-TH"),
  date: (s) => {
    if (!s) return "-";
    try {
      return new Date(s).toLocaleDateString("th-TH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return s;
    }
  },
  today: () => new Date().toISOString().split("T")[0],
  monthStart: () =>
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0],
};

// ─── Status Labels ───────────────────────────────────────
function statusBadge(status) {
  const map = {
    pending: ["status-pending", "รอยืนยัน"],
    confirmed: ["status-confirmed", "ยืนยันแล้ว"],
    in_progress: ["status-in_progress", "กำลังผลิต"],
    delivered: ["status-delivered", "จัดส่งแล้ว"],
    paid: ["status-paid", "ชำระแล้ว"],
    cancelled: ["status-cancelled", "ยกเลิก"],
    completed: ["status-completed", "เสร็จแล้ว"],
    in_transit: ["status-in_transit", "กำลังส่ง"],
    failed: ["status-failed", "ไม่สำเร็จ"],
  };
  const [cls, label] = map[status] || ["status-pending", status];
  return `<span class="badge-status ${cls}">${label}</span>`;
}

function custTypeLabel(t) {
  return (
    {
      retail: "ขายปลีก",
      wholesale: "ขายส่ง",
      corporate: "บริษัท",
      distributor: "ตัวแทน",
    }[t] || t
  );
}

function roleLabel(r) {
  return (
    { admin: "ผู้ดูแลระบบ", manager: "ผู้จัดการ", staff: "พนักงาน" }[r] || r
  );
}

function roleBadgeClass(r) {
  return (
    {
      admin: "bg-danger",
      manager: "bg-warning text-dark",
      staff: "bg-secondary",
    }[r] || "bg-secondary"
  );
}

// ─── Auth ────────────────────────────────────────────────
document.getElementById("toggle-password").addEventListener("click", () => {
  const inp = document.getElementById("login-password");
  const ico = document.querySelector("#toggle-password i");
  inp.type = inp.type === "password" ? "text" : "password";
  ico.className =
    inp.type === "password" ? "bi bi-eye-fill" : "bi bi-eye-slash-fill";
});

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("login-btn");
  const errEl = document.getElementById("login-error");
  btn.disabled = true;
  btn.innerHTML =
    '<span class="spinner-border spinner-border-sm me-2"></span>กำลังเข้าสู่ระบบ...';
  errEl.classList.add("d-none");
  try {
    const { token, user } = await api.post("/api/auth/login", {
      username: document.getElementById("login-username").value.trim(),
      password: document.getElementById("login-password").value,
    });
    localStorage.setItem("tws_token", token);
    currentUser = user;
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("d-none");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-2"></i>เข้าสู่ระบบ';
  }
});

document.getElementById("logout-btn").addEventListener("click", doLogout);

function doLogout() {
  localStorage.removeItem("tws_token");
  currentUser = null;
  document.getElementById("app-screen").style.display = "none";
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("login-username").value = "";
  document.getElementById("login-password").value = "";
}

async function checkAuth() {
  const token = localStorage.getItem("tws_token");
  if (!token) {
    document.getElementById("login-screen").style.display = "flex";
    return;
  }
  try {
    currentUser = await api.get("/api/auth/me");
    showApp();
  } catch {
    document.getElementById("login-screen").style.display = "flex";
  }
}

function showApp() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "flex";
  document.getElementById("user-name").textContent = currentUser.name;
  const rb = document.getElementById("user-role-badge");
  rb.textContent = roleLabel(currentUser.role);
  rb.className = "user-role badge " + roleBadgeClass(currentUser.role);

  // Hide admin/manager-only items
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.style.display = currentUser.role === "admin" ? "" : "none";
  });
  document.querySelectorAll(".manager-only").forEach((el) => {
    el.style.display = ["admin", "manager"].includes(currentUser.role)
      ? ""
      : "none";
  });

  navigate("dashboard");
  startClock();
  loadNotifications();
  // Auto-refresh dashboard every 5 minutes
  setInterval(() => {
    if (document.getElementById("page-dashboard").classList.contains("d-none"))
      return;
    dashboard.load();
  }, 300000);
}

// ─── Clock ───────────────────────────────────────────────
function startClock() {
  const el = document.getElementById("current-datetime");
  const tick = () => {
    el.textContent = new Date().toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };
  tick();
  setInterval(tick, 30000);
}

// ─── Navigation ──────────────────────────────────────────
const pageTitles = {
  dashboard: "แดชบอร์ด",
  materials: "วัตถุดิบ",
  products: "สินค้า",
  production: "การผลิต",
  customers: "ลูกค้า",
  sales: "การขาย",
  delivery: "การจัดส่ง",
  reports: "รายงาน",
  users: "จัดการผู้ใช้งาน",
  settings: "ตั้งค่าระบบ",
};

function navigate(page) {
  document.querySelectorAll(".page").forEach((p) => p.classList.add("d-none"));
  const target = document.getElementById("page-" + page);
  if (target) target.classList.remove("d-none");

  document.querySelectorAll(".sidebar-nav .nav-link").forEach((a) => {
    a.classList.toggle("active", a.dataset.page === page);
  });

  // Sync bottom nav
  document.querySelectorAll(".bottom-nav-item").forEach((a) => {
    a.classList.toggle("active", a.dataset.page === page);
  });

  document.getElementById("page-title").textContent = pageTitles[page] || page;

  // Load data
  const loaders = {
    dashboard,
    materials,
    products,
    production,
    customers,
    sales,
    delivery,
    reports,
    users,
    settings: { load: loadSettingsPage },
  };
  if (loaders[page]) loaders[page].load?.();

  // Staggered entrance animations
  requestAnimationFrame(() => {
    if (target) {
      const animItems = [
        ...target.querySelectorAll(
          ".stat-card, .quick-action, .card, .kanban-col, .page-header",
        ),
      ];
      animItems.forEach((el) => el.classList.remove("animate"));
      animItems.forEach((el, i) => {
        setTimeout(() => el.classList.add("animate"), i * 60);
      });
    }
  });
}

document.querySelectorAll(".sidebar-nav .nav-link").forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    navigate(a.dataset.page);
    closeMobileSidebar();
  });
});

function isMobile() {
  return window.innerWidth <= 768;
}

function closeMobileSidebar() {
  if (isMobile()) {
    document.getElementById("sidebar").classList.remove("mobile-open");
    document.getElementById("sidebar-backdrop").classList.remove("show");
  }
}

document.getElementById("sidebar-toggle").addEventListener("click", () => {
  const sb = document.getElementById("sidebar");
  const bd = document.getElementById("sidebar-backdrop");
  if (isMobile()) {
    sb.classList.toggle("mobile-open");
    bd.classList.toggle("show");
  } else {
    sb.classList.toggle("collapsed");
  }
});

document
  .getElementById("sidebar-backdrop")
  .addEventListener("click", closeMobileSidebar);

// ─── Bottom Nav ──────────────────────────────────────────
document.querySelectorAll(".bottom-nav-item").forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    navigate(a.dataset.page);
  });
});

// ─── DASHBOARD ───────────────────────────────────────────
const dashboard = {
  async load() {
    try {
      const d = await api.get("/api/dashboard");
      document.getElementById("stat-today-sales").textContent = fmt.currency(
        d.todaySales,
      );
      document.getElementById("stat-month-sales").textContent = fmt.currency(
        d.monthSales,
      );
      document.getElementById("stat-pending-orders").textContent = fmt.number(
        d.pendingOrders,
      );
      document.getElementById("stat-unpaid").textContent = fmt.currency(
        d.unpaidAmount,
      );
      document.getElementById("stat-customers").textContent = fmt.number(
        d.totalCustomers,
      );
      document.getElementById("stat-products").textContent = fmt.number(
        d.totalProducts,
      );
      document.getElementById("stat-production").textContent = fmt.number(
        d.pendingProd,
      );
      document.getElementById("stat-low-materials").textContent = fmt.number(
        d.lowMaterials,
      );

      this.renderSalesChart(d.salesChart);
      this.renderTopProducts(d.topProducts);
      this.renderRecentOrders(d.recentOrders);
    } catch (err) {
      toast(err.message, "danger");
    }
  },

  renderSalesChart(data) {
    const labels = [];
    const values = [];
    // Fill last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      labels.push(
        d.toLocaleDateString("th-TH", { month: "short", day: "numeric" }),
      );
      const found = data.find((r) => r.date === key);
      values.push(found ? found.total : 0);
    }
    if (dashCharts.sales) dashCharts.sales.destroy();
    const ctx = document.getElementById("chart-sales").getContext("2d");
    dashCharts.sales = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "ยอดขาย (บาท)",
            data: values,
            backgroundColor: "rgba(21,101,192,0.8)",
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => "฿" + v.toLocaleString() },
          },
        },
      },
    });
  },

  renderTopProducts(data) {
    if (dashCharts.top) dashCharts.top.destroy();
    const ctx = document.getElementById("chart-top-products").getContext("2d");
    dashCharts.top = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: data.map((d) =>
          d.name.replace("น้ำดื่ม TWS ", "").replace("น้ำดื่ม ", ""),
        ),
        datasets: [
          {
            data: data.map((d) => d.qty),
            backgroundColor: [
              "#1565c0",
              "#00acc1",
              "#43a047",
              "#fb8c00",
              "#8e24aa",
            ],
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 11 } } },
        },
      },
    });
  },

  renderRecentOrders(rows) {
    const tbody = document.getElementById("recent-orders-tbody");
    if (!rows?.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted">ยังไม่มีรายการ</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td><a href="#" class="text-primary fw-semibold" onclick="showSaleDetail(${r.id || 0})">${r.order_number}</a></td>
        <td>${r.customer_name}</td>
        <td>${fmt.date(r.order_date)}</td>
        <td class="text-end">${fmt.currency(r.total_amount)}</td>
        <td>${statusBadge(r.status)}</td>
      </tr>`,
      )
      .join("");
  },
};

// ─── MATERIALS ───────────────────────────────────────────
const materials = {
  async load() {
    try {
      allMaterials = await api.get("/api/materials");
      this.render(allMaterials);
    } catch (err) {
      toast(err.message, "danger");
    }
  },

  render(data) {
    const grid = document.getElementById("materials-grid");

    // Update summary counts
    const total = data.length;
    const okCount = data.filter((m) => m.quantity > m.min_quantity).length;
    const lowCount = data.filter(
      (m) => m.quantity <= m.min_quantity && m.quantity > 0,
    ).length;
    const outCount = data.filter((m) => m.quantity === 0).length;
    document.getElementById("mat-total-count").textContent = total;
    document.getElementById("mat-ok-count").textContent = okCount;
    document.getElementById("mat-low-count").textContent = lowCount;
    document.getElementById("mat-out-count").textContent = outCount;

    if (!data.length) {
      grid.innerHTML =
        '<div class="mat-empty"><i class="bi bi-inbox"></i><span>ไม่มีข้อมูลวัตถุดิบ</span></div>';
      return;
    }

    const canEdit = ["admin", "manager"].includes(currentUser?.role);

    // Material icon map based on keywords
    const getIcon = (name, code) => {
      const n = (name || "").toLowerCase();
      if (n.includes("ขวด")) return "bi-cup-straw";
      if (n.includes("ฝา")) return "bi-circle";
      if (n.includes("ฉลาก")) return "bi-tag";
      if (n.includes("ถัง")) return "bi-bucket";
      if (n.includes("สารกรอง") || n.includes("กรอง")) return "bi-funnel";
      if (n.includes("คาร์บอน")) return "bi-diamond-half";
      if (n.includes("ซีล")) return "bi-shield-check";
      return "bi-box-seam";
    };

    grid.innerHTML = data
      .map((m, idx) => {
        const isLow = m.quantity <= m.min_quantity && m.quantity > 0;
        const isEmpty = m.quantity === 0;
        const status = isEmpty ? "empty" : isLow ? "low" : "ok";
        const statusText = isEmpty ? "หมดสต็อก" : isLow ? "สต็อกต่ำ" : "ปกติ";
        const icon = getIcon(m.name, m.code);

        // Stock percentage (cap at 100%, use min_quantity*2 as max reference)
        const maxRef = Math.max(m.min_quantity * 2, 1);
        const pct = Math.min(100, Math.round((m.quantity / maxRef) * 100));

        return `<div class="mat-card status-${status}" style="animation: fadeSlideUp 400ms ${idx * 60}ms both">
        <div class="mat-card-visual">
          <div class="mat-card-icon"><i class="bi ${icon}"></i></div>
          <div class="mat-card-badge">${statusText}</div>
        </div>
        <div class="mat-card-body">
          <div class="mat-card-code">${m.code}</div>
          <div class="mat-card-name" title="${m.name}">${m.name}</div>
          <div class="mat-stock-row">
            <span class="mat-stock-label">คงเหลือ</span>
            <span class="mat-stock-value">${fmt.number(m.quantity)} ${m.unit}</span>
          </div>
          <div class="mat-stock-bar"><div class="mat-stock-fill" style="width:${pct}%"></div></div>
          <div class="mat-card-info">
            <div class="mat-info-item">
              <span class="mat-info-label">ขั้นต่ำ</span>
              <span class="mat-info-value">${fmt.number(m.min_quantity)}</span>
            </div>
            <div class="mat-info-item">
              <span class="mat-info-label">หน่วย</span>
              <span class="mat-info-value">${m.unit}</span>
            </div>
            <div class="mat-info-item">
              <span class="mat-info-label">ราคา/หน่วย</span>
              <span class="mat-info-value">${fmt.currency(m.cost_per_unit)}</span>
            </div>
          </div>
        </div>
        <div class="mat-card-actions">
          <button class="btn btn-outline-success btn-sm" title="รับเข้า/เบิกออก" onclick="showAdjustModal(${m.id})"><i class="bi bi-arrow-down-up me-1"></i>ปรับสต็อก</button>
          <button class="btn btn-outline-secondary btn-sm" title="ประวัติ" onclick="showLogsModal(${m.id},'${m.name}')"><i class="bi bi-clock-history me-1"></i>ประวัติ</button>
          ${canEdit ? `<button class="btn btn-outline-primary btn-sm" onclick="showMaterialModal(${m.id})"><i class="bi bi-pencil me-1"></i>แก้ไข</button>` : ""}
        </div>
      </div>`;
      })
      .join("");
  },
};

window.filterMaterials = () => {
  const q = document.getElementById("material-search").value.toLowerCase();
  materials.render(
    allMaterials.filter(
      (m) =>
        m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q),
    ),
  );
};

// Material view toggle (grid/list)
document.querySelectorAll(".mat-view-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".mat-view-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const grid = document.getElementById("materials-grid");
    if (btn.dataset.view === "list") {
      grid.classList.add("list-view");
    } else {
      grid.classList.remove("list-view");
    }
  });
});

window.showMaterialModal = (id) => {
  const m = id ? allMaterials.find((x) => x.id === id) : null;
  document.getElementById("materialModalTitle").textContent = m
    ? "แก้ไขวัตถุดิบ"
    : "เพิ่มวัตถุดิบ";
  document.getElementById("mat-id").value = m?.id || "";
  document.getElementById("mat-code").value = m?.code || "";
  document.getElementById("mat-name").value = m?.name || "";
  document.getElementById("mat-unit").value = m?.unit || "";
  document.getElementById("mat-qty").value = m?.quantity ?? 0;
  document.getElementById("mat-min").value = m?.min_quantity ?? 0;
  document.getElementById("mat-cost").value = m?.cost_per_unit ?? 0;
  document.getElementById("mat-code").disabled = !!m;
  new bootstrap.Modal("#materialModal").show();
};

window.saveMaterial = async () => {
  const id = document.getElementById("mat-id").value;
  const data = {
    code: document.getElementById("mat-code").value.trim(),
    name: document.getElementById("mat-name").value.trim(),
    unit: document.getElementById("mat-unit").value.trim(),
    quantity: parseFloat(document.getElementById("mat-qty").value) || 0,
    min_quantity: parseFloat(document.getElementById("mat-min").value) || 0,
    cost_per_unit: parseFloat(document.getElementById("mat-cost").value) || 0,
  };
  if (!data.name || !data.unit || (!id && !data.code))
    return toast("กรุณากรอกข้อมูลให้ครบ", "warning");
  try {
    if (id) {
      await api.put("/api/materials/" + id, data);
      toast("แก้ไขสำเร็จ");
    } else {
      await api.post("/api/materials", data);
      toast("เพิ่มวัตถุดิบสำเร็จ");
    }
    bootstrap.Modal.getInstance(
      document.getElementById("materialModal"),
    )?.hide();
    materials.load();
  } catch (err) {
    toast(err.message, "danger");
  }
};

window.showAdjustModal = (id) => {
  const m = allMaterials.find((x) => x.id === id);
  if (!m) return;
  document.getElementById("adj-id").value = id;
  document.getElementById("adj-name").textContent = m.name;
  document.getElementById("adj-current").textContent =
    `คงเหลือปัจจุบัน: ${fmt.number(m.quantity)} ${m.unit}`;
  document.getElementById("adj-qty").value = "";
  document.getElementById("adj-note").value = "";
  document.getElementById("adj-type").value = "in";
  new bootstrap.Modal("#adjustModal").show();
};

window.saveAdjust = async () => {
  const id = document.getElementById("adj-id").value;
  const qty = parseFloat(document.getElementById("adj-qty").value);
  if (!qty || qty <= 0) return toast("กรุณากรอกจำนวน", "warning");
  try {
    const r = await api.post(`/api/materials/${id}/adjust`, {
      type: document.getElementById("adj-type").value,
      quantity: qty,
      note: document.getElementById("adj-note").value.trim(),
    });
    toast(r.message);
    bootstrap.Modal.getInstance(document.getElementById("adjustModal"))?.hide();
    materials.load();
  } catch (err) {
    toast(err.message, "danger");
  }
};

window.showLogsModal = async (id, name) => {
  document.getElementById("logs-title").textContent = `ประวัติ: ${name}`;
  const tbody = document.getElementById("logs-tbody");
  tbody.innerHTML =
    '<tr><td colspan="5" class="text-center"><span class="spinner-border spinner-border-sm"></span></td></tr>';
  new bootstrap.Modal("#logsModal").show();
  try {
    const logs = await api.get(`/api/materials/${id}/logs`);
    if (!logs.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted">ไม่มีประวัติ</td></tr>';
      return;
    }
    tbody.innerHTML = logs
      .map(
        (l) => `<tr>
      <td>${fmt.date(l.created_at)}</td>
      <td>${l.type === "in" ? '<span class="text-success fw-semibold">รับเข้า</span>' : '<span class="text-danger fw-semibold">เบิกออก</span>'}</td>
      <td class="text-end">${fmt.number(l.quantity)}</td>
      <td>${l.note || "-"}</td>
      <td>${l.created_by_name || "-"}</td>
    </tr>`,
      )
      .join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-danger">${err.message}</td></tr>`;
  }
};

// ─── PRODUCTS ────────────────────────────────────────────
const products = {
  async load() {
    try {
      allProducts = await api.get("/api/products");
      this.render(allProducts);
    } catch (err) {
      toast(err.message, "danger");
    }
  },

  render(data) {
    const grid = document.getElementById("products-grid");

    // Update summary counts
    const total = data.length;
    const okCount = data.filter((p) => p.stock > p.min_stock).length;
    const lowCount = data.filter(
      (p) => p.stock <= p.min_stock && p.stock > 0,
    ).length;
    const outCount = data.filter((p) => p.stock === 0).length;
    document.getElementById("prod-total-count").textContent = total;
    document.getElementById("prod-ok-count").textContent = okCount;
    document.getElementById("prod-low-count").textContent = lowCount;
    document.getElementById("prod-out-count").textContent = outCount;

    if (!data.length) {
      grid.innerHTML =
        '<div class="prod-empty"><i class="bi bi-inbox"></i><span>ไม่มีข้อมูลสินค้า</span></div>';
      return;
    }

    const canEdit = ["admin", "manager"].includes(currentUser?.role);

    // Product icon based on size
    const getIcon = (size_ml) => {
      if (size_ml >= 19000) return "bi-bucket-fill";
      if (size_ml >= 5000) return "bi-droplet-fill";
      if (size_ml >= 1500) return "bi-cup-hot-fill";
      if (size_ml >= 600) return "bi-cup-straw";
      return "bi-cup";
    };

    // Format size label
    const sizeLabel = (ml) => {
      if (!ml) return "-";
      if (ml >= 1000) return ml / 1000 + "L";
      return ml + "ml";
    };

    grid.innerHTML = data
      .map((p, idx) => {
        const isLow = p.stock <= p.min_stock && p.stock > 0;
        const isEmpty = p.stock === 0;
        const status = isEmpty ? "empty" : isLow ? "low" : "ok";
        const statusText = isEmpty ? "หมดสต็อก" : isLow ? "สต็อกต่ำ" : "ปกติ";
        const icon = getIcon(p.size_ml);
        const maxRef = Math.max(p.min_stock * 2, 1);
        const pct = Math.min(100, Math.round((p.stock / maxRef) * 100));
        const profit = p.price - p.cost;

        return `<div class="prod-card status-${status}" style="animation: fadeSlideUp 400ms ${idx * 60}ms both">
        <div class="prod-card-visual">
          <div class="prod-card-icon"><i class="bi ${icon}"></i></div>
          <div class="prod-card-badge">${statusText}</div>
          <div class="prod-card-size">${sizeLabel(p.size_ml)}</div>
        </div>
        <div class="prod-card-body">
          <div class="prod-card-code">${p.code}</div>
          <div class="prod-card-name" title="${p.name}">${p.name}</div>
          <div class="prod-price-row">
            <div class="prod-price-item">
              <span class="prod-price-label">ราคาขาย</span>
              <span class="prod-price-value sale">${fmt.currency(p.price)}</span>
            </div>
            <div class="prod-price-item">
              <span class="prod-price-label">ต้นทุน</span>
              <span class="prod-price-value cost">${fmt.currency(p.cost)}</span>
            </div>
            <div class="prod-price-item">
              <span class="prod-price-label">กำไร</span>
              <span class="prod-price-value profit">${fmt.currency(profit)}</span>
            </div>
          </div>
          <div class="prod-stock-row">
            <span class="prod-stock-label">คงเหลือ</span>
            <span class="prod-stock-value">${fmt.number(p.stock)} ${p.unit}</span>
          </div>
          <div class="prod-stock-bar"><div class="prod-stock-fill" style="width:${pct}%"></div></div>
          <div class="prod-card-info">
            <div class="prod-info-item">
              <span class="prod-info-label">ขั้นต่ำ</span>
              <span class="prod-info-value">${fmt.number(p.min_stock)}</span>
            </div>
            <div class="prod-info-item">
              <span class="prod-info-label">หน่วย</span>
              <span class="prod-info-value">${p.unit}</span>
            </div>
          </div>
        </div>
        <div class="prod-card-actions">
          ${canEdit ? `<button class="btn btn-outline-primary btn-sm" onclick="showProductModal(${p.id})"><i class="bi bi-pencil me-1"></i>แก้ไข</button>` : ""}
        </div>
      </div>`;
      })
      .join("");
  },
};

window.filterProducts = () => {
  const q = document.getElementById("product-search").value.toLowerCase();
  products.render(
    allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q),
    ),
  );
};

// Product view toggle (grid/list)
document.querySelectorAll(".prod-view-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".prod-view-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const grid = document.getElementById("products-grid");
    if (btn.dataset.view === "list") {
      grid.classList.add("list-view");
    } else {
      grid.classList.remove("list-view");
    }
  });
});

window.showProductModal = (id) => {
  const p = id ? allProducts.find((x) => x.id === id) : null;
  document.getElementById("productModalTitle").textContent = p
    ? "แก้ไขสินค้า"
    : "เพิ่มสินค้า";
  document.getElementById("prod-id").value = p?.id || "";
  document.getElementById("prod-code").value = p?.code || "";
  document.getElementById("prod-name").value = p?.name || "";
  document.getElementById("prod-size").value = p?.size_ml || "";
  document.getElementById("prod-unit").value = p?.unit || "ขวด";
  document.getElementById("prod-stock").value = p?.stock ?? 0;
  document.getElementById("prod-price").value = p?.price || 0;
  document.getElementById("prod-cost").value = p?.cost || 0;
  document.getElementById("prod-min").value = p?.min_stock ?? 0;
  document.getElementById("prod-code").disabled = !!p;
  document.getElementById("prod-stock").disabled = !!p;
  new bootstrap.Modal("#productModal").show();
};

window.saveProduct = async () => {
  const id = document.getElementById("prod-id").value;
  const data = {
    code: document.getElementById("prod-code").value.trim(),
    name: document.getElementById("prod-name").value.trim(),
    size_ml: parseInt(document.getElementById("prod-size").value) || 0,
    unit: document.getElementById("prod-unit").value.trim() || "ขวด",
    stock: parseInt(document.getElementById("prod-stock").value) || 0,
    price: parseFloat(document.getElementById("prod-price").value) || 0,
    cost: parseFloat(document.getElementById("prod-cost").value) || 0,
    min_stock: parseInt(document.getElementById("prod-min").value) || 0,
  };
  if (!data.name || (!id && !data.code))
    return toast("กรุณากรอกข้อมูลให้ครบ", "warning");
  try {
    if (id) {
      await api.put("/api/products/" + id, data);
      toast("แก้ไขสำเร็จ");
    } else {
      await api.post("/api/products", data);
      toast("เพิ่มสินค้าสำเร็จ");
    }
    bootstrap.Modal.getInstance(
      document.getElementById("productModal"),
    )?.hide();
    products.load();
  } catch (err) {
    toast(err.message, "danger");
  }
};

// ─── PRODUCTION ──────────────────────────────────────────
const production = {
  data: [],
  async load() {
    const status = document.getElementById("production-filter").value;
    try {
      let data = await api.get("/api/production");
      this.data = data;
      if (status) data = data.filter((r) => r.status === status);
      this.render(data);
    } catch (err) {
      toast(err.message, "danger");
    }
  },

  render(data) {
    const tbody = document.getElementById("production-tbody");
    if (!data.length) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="text-center text-muted py-4">ไม่มีรายการ</td></tr>';
      return;
    }
    const canManage = ["admin", "manager"].includes(currentUser?.role);
    tbody.innerHTML = data
      .map(
        (r) => `
      <tr>
        <td>${r.id}</td>
        <td class="fw-semibold">${r.product_name}</td>
        <td class="text-end">${fmt.number(r.quantity_planned)} ${r.unit}</td>
        <td class="text-end">${r.quantity_produced > 0 ? fmt.number(r.quantity_produced) : "-"}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${r.created_by_name || "-"}</td>
        <td>${fmt.date(r.created_at)}</td>
        <td>
          ${
            !["completed", "cancelled"].includes(r.status) && canManage
              ? `
          <button class="btn btn-outline-primary btn-sm" onclick="showProductionStatus(${r.id},'${r.product_name}',${r.quantity_planned},'${r.status}')">
            <i class="bi bi-arrow-right-circle"></i> สถานะ
          </button>`
              : ""
          }
        </td>
      </tr>`,
      )
      .join("");
  },
};

window.loadProduction = () => production.load();

window.showProductionModal = async () => {
  const sel = document.getElementById("prd-product");
  sel.innerHTML = '<option value="">-- เลือกสินค้า --</option>';
  if (!allProducts.length) await products.load();
  allProducts.forEach((p) => {
    sel.innerHTML += `<option value="${p.id}">${p.code} - ${p.name}</option>`;
  });
  document.getElementById("prd-qty").value = "";
  document.getElementById("prd-notes").value = "";
  new bootstrap.Modal("#productionModal").show();
};

window.saveProduction = async () => {
  const product_id = document.getElementById("prd-product").value;
  const qty = parseInt(document.getElementById("prd-qty").value);
  if (!product_id || !qty || qty < 1)
    return toast("กรุณากรอกข้อมูลให้ครบ", "warning");
  try {
    const r = await api.post("/api/production", {
      product_id,
      quantity_planned: qty,
      notes: document.getElementById("prd-notes").value,
    });
    toast(r.message);
    bootstrap.Modal.getInstance(
      document.getElementById("productionModal"),
    )?.hide();
    production.load();
  } catch (err) {
    toast(err.message, "danger");
  }
};

window.showProductionStatus = (id, name, qty, currentStatus) => {
  document.getElementById("ps-id").value = id;
  document.getElementById("ps-name").textContent = name;
  document.getElementById("ps-qty").value = qty;
  const sel = document.getElementById("ps-status");
  // filter options
  const options =
    currentStatus === "pending"
      ? ["in_progress", "cancelled"]
      : ["completed", "cancelled"];
  sel.innerHTML = options
    .map(
      (s) =>
        `<option value="${s}">${statusBadge(s).replace(/<[^>]+>/g, "")}</option>`,
    )
    .join("");
  document.getElementById("ps-qty-group").style.display = "";
  sel.addEventListener(
    "change",
    () => {
      document.getElementById("ps-qty-group").style.display =
        sel.value === "completed" ? "" : "none";
    },
    { once: false },
  );
  document.getElementById("ps-qty-group").style.display =
    sel.value === "completed" ? "" : "none";
  new bootstrap.Modal("#productionStatusModal").show();
};

window.saveProductionStatus = async () => {
  const id = document.getElementById("ps-id").value;
  const status = document.getElementById("ps-status").value;
  const qty = parseInt(document.getElementById("ps-qty").value) || undefined;
  try {
    const r = await api.put("/api/production/" + id, {
      status,
      quantity_produced: qty,
    });
    toast(r.message);
    bootstrap.Modal.getInstance(
      document.getElementById("productionStatusModal"),
    )?.hide();
    production.load();
  } catch (err) {
    toast(err.message, "danger");
  }
};

// ─── CUSTOMERS ───────────────────────────────────────────
const customers = {
  async load() {
    try {
      allCustomers = await api.get("/api/customers");
      this.render(allCustomers);
    } catch (err) {
      toast(err.message, "danger");
    }
  },

  render(data) {
    const tbody = document.getElementById("customers-tbody");
    if (!data.length) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="text-center text-muted py-4">ไม่มีลูกค้า</td></tr>';
      return;
    }
    tbody.innerHTML = data
      .map(
        (c) => `
      <tr>
        <td><code>${c.code}</code></td>
        <td class="fw-semibold">${c.name}</td>
        <td>${c.phone || "-"}</td>
        <td><span class="badge-status status-confirmed">${custTypeLabel(c.type)}</span></td>
        <td class="text-end">${fmt.currency(c.credit_limit)}</td>
        <td class="text-muted small" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.address || "-"}</td>
        <td>
          <div class="d-flex gap-1">
            <button class="btn btn-outline-primary btn-sm" onclick="showCustomerModal(${c.id})"><i class="bi bi-pencil"></i></button>
          </div>
        </td>
      </tr>`,
      )
      .join("");
  },
};

window.filterCustomers = () => {
  const q = document.getElementById("customer-search").value.toLowerCase();
  const t = document.getElementById("customer-type-filter").value;
  customers.render(
    allCustomers.filter(
      (c) =>
        (c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q) ||
          (c.phone || "").includes(q)) &&
        (!t || c.type === t),
    ),
  );
};

window.showCustomerModal = (id) => {
  const c = id ? allCustomers.find((x) => x.id === id) : null;
  document.getElementById("customerModalTitle").textContent = c
    ? "แก้ไขลูกค้า"
    : "เพิ่มลูกค้า";
  document.getElementById("cust-id").value = c?.id || "";
  document.getElementById("cust-code").value = c?.code || "";
  document.getElementById("cust-name").value = c?.name || "";
  document.getElementById("cust-phone").value = c?.phone || "";
  document.getElementById("cust-type").value = c?.type || "retail";
  document.getElementById("cust-address").value = c?.address || "";
  document.getElementById("cust-credit").value = c?.credit_limit ?? 0;
  document.getElementById("cust-code").disabled = !!c;
  new bootstrap.Modal("#customerModal").show();
};

window.saveCustomer = async () => {
  const id = document.getElementById("cust-id").value;
  const data = {
    code: document.getElementById("cust-code").value.trim(),
    name: document.getElementById("cust-name").value.trim(),
    phone: document.getElementById("cust-phone").value.trim(),
    type: document.getElementById("cust-type").value,
    address: document.getElementById("cust-address").value.trim(),
    credit_limit: parseFloat(document.getElementById("cust-credit").value) || 0,
  };
  if (!data.name || (!id && !data.code))
    return toast("กรุณากรอกข้อมูลให้ครบ", "warning");
  try {
    if (id) {
      await api.put("/api/customers/" + id, data);
      toast("แก้ไขสำเร็จ");
    } else {
      await api.post("/api/customers", data);
      toast("เพิ่มลูกค้าสำเร็จ");
    }
    bootstrap.Modal.getInstance(
      document.getElementById("customerModal"),
    )?.hide();
    customers.load();
  } catch (err) {
    toast(err.message, "danger");
  }
};

// ─── SALES ───────────────────────────────────────────────
const sales = {
  async load() {
    const from = document.getElementById("sales-from").value;
    const to = document.getElementById("sales-to").value;
    const status = document.getElementById("sales-status-filter").value;
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (status) params.set("status", status);
    try {
      const data = await api.get("/api/sales?" + params.toString());
      this.render(data);
    } catch (err) {
      toast(err.message, "danger");
    }
  },

  render(data) {
    const tbody = document.getElementById("sales-tbody");
    if (!data.length) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="text-center text-muted py-4">ไม่มีรายการ</td></tr>';
      return;
    }
    tbody.innerHTML = data
      .map(
        (r) => `
      <tr>
        <td><a href="#" class="text-primary fw-semibold" onclick="showSaleDetail(${r.id})">${r.order_number}</a></td>
        <td>${r.customer_name}</td>
        <td>${fmt.date(r.order_date)}</td>
        <td class="text-end">${fmt.currency(r.total_amount)}</td>
        <td class="text-end text-success">${fmt.currency(r.paid_amount)}</td>
        <td class="text-end ${r.total_amount > r.paid_amount ? "text-danger" : "text-muted"}">${fmt.currency(r.total_amount - r.paid_amount)}</td>
        <td>${statusBadge(r.status)}</td>
        <td>
          <div class="d-flex gap-1">
            <button class="btn btn-outline-primary btn-sm" title="รายละเอียด" onclick="showSaleDetail(${r.id})"><i class="bi bi-eye"></i></button>
            ${!["paid", "cancelled"].includes(r.status) ? `<button class="btn btn-outline-success btn-sm" title="ชำระเงิน" onclick="showPaymentModal(${r.id},${r.total_amount},${r.paid_amount})"><i class="bi bi-cash-coin"></i></button>` : ""}
            ${["pending", "confirmed"].includes(r.status) ? `<button class="btn btn-outline-secondary btn-sm" title="เปลี่ยนสถานะ" onclick="changeSaleStatus(${r.id},'${r.status}')"><i class="bi bi-arrow-right-circle"></i></button>` : ""}
            ${r.status === "pending" ? `<button class="btn btn-outline-danger btn-sm" title="ยกเลิก" onclick="cancelSale(${r.id})"><i class="bi bi-x-circle"></i></button>` : ""}
          </div>
        </td>
      </tr>`,
      )
      .join("");
  },
};

window.loadSales = () => sales.load();

window.showSaleModal = async () => {
  // Load customers & products into selectors
  if (!allCustomers.length) await customers.load();
  if (!allProducts.length) await products.load();

  const custSel = document.getElementById("sale-customer");
  custSel.innerHTML = '<option value="">-- เลือกลูกค้า --</option>';
  allCustomers.forEach((c) => {
    custSel.innerHTML += `<option value="${c.id}">${c.code} - ${c.name}</option>`;
  });

  document.getElementById("sale-date").value = fmt.today();
  document.getElementById("sale-due").value = "";
  document.getElementById("sale-discount").value = 0;
  document.getElementById("sale-notes").value = "";

  // Reset items
  saleItemCount = 0;
  const tbody = document.getElementById("sale-items-tbody");
  tbody.innerHTML =
    '<tr id="sale-empty-row"><td colspan="5" class="text-center text-muted py-3">กดเพิ่มสินค้า</td></tr>';
  calcSaleTotal();
  new bootstrap.Modal("#saleModal").show();
  addSaleItem();
};

window.addSaleItem = () => {
  const idx = saleItemCount++;
  const empty = document.getElementById("sale-empty-row");
  if (empty) empty.remove();
  const tbody = document.getElementById("sale-items-tbody");
  const row = document.createElement("tr");
  row.id = "sale-row-" + idx;
  row.innerHTML = `
    <td>
      <select class="form-select form-select-sm" id="si-prod-${idx}" onchange="fillSalePrice(${idx})">
        <option value="">-- เลือกสินค้า --</option>
        ${allProducts.map((p) => `<option value="${p.id}" data-price="${p.price}">${p.code} - ${p.name} (฿${p.price})</option>`).join("")}
      </select>
    </td>
    <td><input type="number" class="form-control form-control-sm" id="si-qty-${idx}" min="1" value="1" oninput="calcSaleRowTotal(${idx})"></td>
    <td><input type="number" class="form-control form-control-sm" id="si-price-${idx}" min="0" step="0.01" value="0" oninput="calcSaleRowTotal(${idx})"></td>
    <td><input type="text" class="form-control form-control-sm text-end bg-light" id="si-sub-${idx}" readonly value="฿0.00"></td>
    <td><button class="btn btn-outline-danger btn-sm" onclick="removeSaleItem(${idx})"><i class="bi bi-trash3"></i></button></td>`;
  tbody.appendChild(row);
};

window.fillSalePrice = (idx) => {
  const sel = document.getElementById("si-prod-" + idx);
  const price = sel.selectedOptions[0]?.dataset.price || 0;
  document.getElementById("si-price-" + idx).value = price;
  calcSaleRowTotal(idx);
};

window.calcSaleRowTotal = (idx) => {
  const qty = parseFloat(document.getElementById("si-qty-" + idx)?.value) || 0;
  const price =
    parseFloat(document.getElementById("si-price-" + idx)?.value) || 0;
  const sub = document.getElementById("si-sub-" + idx);
  if (sub) sub.value = fmt.currency(qty * price);
  calcSaleTotal();
};

window.removeSaleItem = (idx) => {
  document.getElementById("sale-row-" + idx)?.remove();
  calcSaleTotal();
};

window.calcSaleTotal = () => {
  let subtotal = 0;
  for (let i = 0; i < saleItemCount; i++) {
    const qty = parseFloat(document.getElementById("si-qty-" + i)?.value) || 0;
    const price =
      parseFloat(document.getElementById("si-price-" + i)?.value) || 0;
    subtotal += qty * price;
  }
  const discount =
    parseFloat(document.getElementById("sale-discount")?.value) || 0;
  document.getElementById("sale-subtotal").textContent = fmt.currency(subtotal);
  document.getElementById("sale-discount-display").textContent =
    fmt.currency(discount);
  document.getElementById("sale-total").textContent = fmt.currency(
    subtotal - discount,
  );
};

window.saveSale = async () => {
  const customer_id = document.getElementById("sale-customer").value;
  const order_date = document.getElementById("sale-date").value;
  if (!customer_id || !order_date)
    return toast("กรุณาเลือกลูกค้าและวันที่", "warning");

  const items = [];
  for (let i = 0; i < saleItemCount; i++) {
    const prodEl = document.getElementById("si-prod-" + i);
    const qtyEl = document.getElementById("si-qty-" + i);
    const priceEl = document.getElementById("si-price-" + i);
    if (!prodEl || !prodEl.value) continue;
    items.push({
      product_id: parseInt(prodEl.value),
      quantity: parseInt(qtyEl.value) || 1,
      unit_price: parseFloat(priceEl.value) || 0,
    });
  }
  if (!items.length)
    return toast("กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ", "warning");

  try {
    const r = await api.post("/api/sales", {
      customer_id,
      order_date,
      due_date: document.getElementById("sale-due").value || null,
      discount: parseFloat(document.getElementById("sale-discount").value) || 0,
      notes: document.getElementById("sale-notes").value.trim(),
      items,
    });
    toast(r.message);
    bootstrap.Modal.getInstance(document.getElementById("saleModal"))?.hide();
    sales.load();
  } catch (err) {
    toast(err.message, "danger");
  }
};

window.showSaleDetail = async (id) => {
  currentSaleDetailId = id;
  document.getElementById("sale-detail-body").innerHTML =
    '<div class="text-center p-4"><span class="spinner-border"></span></div>';
  new bootstrap.Modal("#saleDetailModal").show();
  try {
    const d = await api.get("/api/sales/" + id);
    document.getElementById("detail-order-num").textContent = d.order_number;
    document.getElementById("btn-add-payment").style.display = [
      "paid",
      "cancelled",
    ].includes(d.status)
      ? "none"
      : "";

    const itemsHtml = d.items
      .map(
        (i) => `
      <tr><td>${i.product_name}</td><td class="text-end">${fmt.number(i.quantity)} ${i.unit}</td>
      <td class="text-end">${fmt.currency(i.unit_price)}</td><td class="text-end">${fmt.currency(i.subtotal)}</td></tr>
    `,
      )
      .join("");

    const paymentsHtml = d.payments.length
      ? d.payments
          .map(
            (p) => `
      <tr><td>${fmt.date(p.payment_date)}</td><td>${p.method === "cash" ? "เงินสด" : p.method === "transfer" ? "โอนเงิน" : p.method === "check" ? "เช็ค" : "เครดิต"}</td>
      <td class="text-end text-success fw-semibold">${fmt.currency(p.amount)}</td><td>${p.reference || "-"}</td><td>${p.by_name || "-"}</td></tr>
    `,
          )
          .join("")
      : '<tr><td colspan="5" class="text-muted text-center">ยังไม่มีการชำระ</td></tr>';

    const delivery = d.delivery
      ? `
      <div class="mt-3 p-3 bg-light rounded">
        <strong><i class="bi bi-truck me-1"></i>การจัดส่ง</strong><br>
        คนขับ: ${d.delivery.driver_name || "-"} | ทะเบียน: ${d.delivery.vehicle_number || "-"} | 
        วันจัดส่ง: ${fmt.date(d.delivery.delivery_date)} | สถานะ: ${statusBadge(d.delivery.status)}
      </div>`
      : "";

    document.getElementById("sale-detail-body").innerHTML = `
      <div class="row g-3 mb-3">
        <div class="col-md-6">
          <p class="mb-1"><strong>ลูกค้า:</strong> ${d.customer_name}</p>
          <p class="mb-1"><strong>โทร:</strong> ${d.customer_phone || "-"}</p>
          <p class="mb-1"><strong>ที่อยู่:</strong> ${d.customer_address || "-"}</p>
        </div>
        <div class="col-md-6">
          <p class="mb-1"><strong>วันที่:</strong> ${fmt.date(d.order_date)}</p>
          <p class="mb-1"><strong>กำหนดชำระ:</strong> ${d.due_date ? fmt.date(d.due_date) : "-"}</p>
          <p class="mb-1"><strong>สถานะ:</strong> ${statusBadge(d.status)}</p>
        </div>
      </div>
      <h6>รายการสินค้า</h6>
      <div class="table-responsive mb-3">
        <table class="table table-bordered table-sm">
          <thead class="table-light"><tr><th>สินค้า</th><th class="text-end">จำนวน</th><th class="text-end">ราคา/หน่วย</th><th class="text-end">ยอดรวม</th></tr></thead>
          <tbody>${itemsHtml}</tbody>
          <tfoot class="table-light fw-bold">
            <tr><td colspan="3" class="text-end">ส่วนลด:</td><td class="text-end text-danger">- ${fmt.currency(d.discount)}</td></tr>
            <tr><td colspan="3" class="text-end fs-6">ยอดรวมสุทธิ:</td><td class="text-end fs-6 text-primary">${fmt.currency(d.total_amount)}</td></tr>
            <tr><td colspan="3" class="text-end">ชำระแล้ว:</td><td class="text-end text-success">${fmt.currency(d.paid_amount)}</td></tr>
            <tr><td colspan="3" class="text-end">คงค้าง:</td><td class="text-end ${d.total_amount > d.paid_amount ? "text-danger" : "text-muted"}">${fmt.currency(d.total_amount - d.paid_amount)}</td></tr>
          </tfoot>
        </table>
      </div>
      <h6>ประวัติการชำระเงิน</h6>
      <div class="table-responsive">
        <table class="table table-sm table-bordered">
          <thead class="table-light"><tr><th>วันที่</th><th>วิธี</th><th class="text-end">จำนวน</th><th>อ้างอิง</th><th>บันทึกโดย</th></tr></thead>
          <tbody>${paymentsHtml}</tbody>
        </table>
      </div>
      ${delivery}
      ${d.notes ? `<p class="mt-2 text-muted small"><strong>หมายเหตุ:</strong> ${d.notes}</p>` : ""}
    `;
  } catch (err) {
    document.getElementById("sale-detail-body").innerHTML =
      `<p class="text-danger">${err.message}</p>`;
  }
};

window.showPaymentFromDetail = () => {
  bootstrap.Modal.getInstance(
    document.getElementById("saleDetailModal"),
  )?.hide();
  // Re-fetch current sale to get latest amounts
  api.get("/api/sales/" + currentSaleDetailId).then((d) => {
    showPaymentModal(d.id, d.total_amount, d.paid_amount);
  });
};

window.showPaymentModal = (orderId, total, paid) => {
  document.getElementById("pay-order-id").value = orderId;
  document.getElementById("pay-info").textContent =
    `ยอดรวม ${fmt.currency(total)} | ชำระแล้ว ${fmt.currency(paid)} | คงค้าง ${fmt.currency(total - paid)}`;
  document.getElementById("pay-amount").value = Math.max(
    0,
    total - paid,
  ).toFixed(2);
  document.getElementById("pay-date").value = fmt.today();
  document.getElementById("pay-method").value = "cash";
  document.getElementById("pay-ref").value = "";
  document.getElementById("pay-notes").value = "";
  new bootstrap.Modal("#paymentModal").show();
};

window.savePayment = async () => {
  const order_id = document.getElementById("pay-order-id").value;
  const amount = parseFloat(document.getElementById("pay-amount").value);
  const payment_date = document.getElementById("pay-date").value;
  if (!amount || amount <= 0 || !payment_date)
    return toast("กรุณากรอกจำนวนเงินและวันที่", "warning");
  try {
    const r = await api.post("/api/payments", {
      order_id,
      amount,
      payment_date,
      method: document.getElementById("pay-method").value,
      reference: document.getElementById("pay-ref").value.trim(),
      notes: document.getElementById("pay-notes").value.trim(),
    });
    toast(r.message);
    bootstrap.Modal.getInstance(
      document.getElementById("paymentModal"),
    )?.hide();
    sales.load();
  } catch (err) {
    toast(err.message, "danger");
  }
};

window.changeSaleStatus = async (id, currentStatus) => {
  const next = {
    pending: "confirmed",
    confirmed: "delivered",
    delivered: "paid",
  }[currentStatus];
  if (!next) return;
  const label = {
    confirmed: "ยืนยันแล้ว",
    delivered: "จัดส่งแล้ว",
    paid: "ชำระแล้ว",
  }[next];
  if (!confirm(`เปลี่ยนสถานะเป็น "${label}" ?`)) return;
  try {
    await api.put("/api/sales/" + id + "/status", { status: next });
    toast("อัปเดตสถานะสำเร็จ");
    sales.load();
  } catch (err) {
    toast(err.message, "danger");
  }
};

window.cancelSale = async (id) => {
  if (!confirm("ยกเลิกใบสั่งซื้อนี้?")) return;
  try {
    await api.delete("/api/sales/" + id);
    toast("ยกเลิกสำเร็จ", "warning");
    sales.load();
  } catch (err) {
    toast(err.message, "danger");
  }
};

// ─── DELIVERY ────────────────────────────────────────────
const delivery = {
  async load() {
    try {
      const data = await api.get("/api/deliveries");
      this.render(data);
    } catch (err) {
      toast(err.message, "danger");
    }
  },

  render(data) {
    const tbody = document.getElementById("delivery-tbody");
    if (!data.length) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="text-center text-muted py-4">ไม่มีรายการจัดส่ง</td></tr>';
      return;
    }
    tbody.innerHTML = data
      .map(
        (d) => `
      <tr>
        <td><span class="fw-semibold">${d.order_number}</span></td>
        <td>${d.customer_name}</td>
        <td class="text-muted small" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.address || "-"}</td>
        <td>${d.driver_name || "-"}</td>
        <td>${d.vehicle_number || "-"}</td>
        <td>${d.delivery_date ? fmt.date(d.delivery_date) : "-"}</td>
        <td>${statusBadge(d.status)}</td>
        <td>
          ${
            !["delivered", "failed"].includes(d.status)
              ? `
          <button class="btn btn-outline-primary btn-sm" onclick="showDeliveryUpdateModal(${d.id},'${d.status || "pending"}','${d.driver_name || ""}','${d.vehicle_number || ""}','${d.delivery_date || ""}','${(d.notes || "").replace(/'/g, "&apos;")}')">
            <i class="bi bi-pencil"></i>
          </button>`
              : ""
          }
        </td>
      </tr>`,
      )
      .join("");
  },
};

window.showDeliveryModal = async () => {
  if (!allCustomers.length) await customers.load();
  // Load pending/confirmed orders without delivery
  const orders = await api.get("/api/sales?status=pending");
  const orders2 = await api.get("/api/sales?status=confirmed");
  const all = [...orders, ...orders2];
  const deliveries = await api.get("/api/deliveries");
  const deliveredIds = new Set(deliveries.map((d) => d.order_id));
  const available = all.filter((o) => !deliveredIds.has(o.id));

  const sel = document.getElementById("del-order");
  sel.innerHTML = '<option value="">-- เลือกใบสั่งซื้อ --</option>';
  available.forEach((o) => {
    sel.innerHTML += `<option value="${o.id}">${o.order_number} - ${o.customer_name} (${fmt.currency(o.total_amount)})</option>`;
  });

  document.getElementById("del-driver").value = "";
  document.getElementById("del-vehicle").value = "";
  document.getElementById("del-date").value = fmt.today();
  document.getElementById("del-notes").value = "";
  new bootstrap.Modal("#deliveryModal").show();
};

window.saveDelivery = async () => {
  const order_id = document.getElementById("del-order").value;
  if (!order_id) return toast("กรุณาเลือกใบสั่งซื้อ", "warning");
  try {
    const r = await api.post("/api/deliveries", {
      order_id,
      driver_name: document.getElementById("del-driver").value.trim(),
      vehicle_number: document.getElementById("del-vehicle").value.trim(),
      delivery_date: document.getElementById("del-date").value,
      notes: document.getElementById("del-notes").value.trim(),
    });
    toast(r.message);
    bootstrap.Modal.getInstance(
      document.getElementById("deliveryModal"),
    )?.hide();
    delivery.load();
  } catch (err) {
    toast(err.message, "danger");
  }
};

window.showDeliveryUpdateModal = (id, status, driver, vehicle, date, notes) => {
  document.getElementById("dup-id").value = id;
  document.getElementById("dup-status").value = status;
  document.getElementById("dup-driver").value = driver;
  document.getElementById("dup-vehicle").value = vehicle;
  document.getElementById("dup-date").value = date;
  document.getElementById("dup-notes").value = notes;
  new bootstrap.Modal("#deliveryUpdateModal").show();
};

window.saveDeliveryUpdate = async () => {
  const id = document.getElementById("dup-id").value;
  try {
    const r = await api.put("/api/deliveries/" + id, {
      status: document.getElementById("dup-status").value,
      driver_name: document.getElementById("dup-driver").value.trim(),
      vehicle_number: document.getElementById("dup-vehicle").value.trim(),
      delivery_date: document.getElementById("dup-date").value,
      notes: document.getElementById("dup-notes").value.trim(),
    });
    toast(r.message);
    bootstrap.Modal.getInstance(
      document.getElementById("deliveryUpdateModal"),
    )?.hide();
    delivery.load();
  } catch (err) {
    toast(err.message, "danger");
  }
};

// ─── REPORTS ─────────────────────────────────────────────
const reports = {
  currentTab: "sales",
  load() {
    if (this.currentTab === "sales") this.loadSales();
    else if (this.currentTab === "inventory") this.loadInventory();
    else if (this.currentTab === "production") this.loadProduction();
  },

  async loadSales() {
    const from =
      document.getElementById("rpt-sales-from").value || fmt.monthStart();
    const to = document.getElementById("rpt-sales-to").value || fmt.today();
    try {
      const d = await api.get(`/api/reports/sales?from=${from}&to=${to}`);
      document.getElementById("rpt-total-orders").textContent = fmt.number(
        d.summary.orders,
      );
      document.getElementById("rpt-revenue").textContent = fmt.currency(
        d.summary.revenue,
      );
      document.getElementById("rpt-paid").textContent = fmt.currency(
        d.summary.paid,
      );
      document.getElementById("rpt-unpaid").textContent = fmt.currency(
        d.summary.unpaid,
      );

      // Sales chart
      if (reportCharts.sales) reportCharts.sales.destroy();
      const ctx = document.getElementById("rpt-sales-chart").getContext("2d");
      reportCharts.sales = new Chart(ctx, {
        type: "line",
        data: {
          labels: d.byDay.map((r) => fmt.date(r.date)),
          datasets: [
            {
              label: "ยอดขาย",
              data: d.byDay.map((r) => r.revenue),
              borderColor: "#1565c0",
              backgroundColor: "rgba(21,101,192,0.1)",
              fill: true,
              tension: 0.4,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: (v) => "฿" + v.toLocaleString() },
            },
          },
        },
      });

      // Product chart
      if (reportCharts.product) reportCharts.product.destroy();
      const ctx2 = document
        .getElementById("rpt-product-chart")
        .getContext("2d");
      reportCharts.product = new Chart(ctx2, {
        type: "bar",
        data: {
          labels: d.byProduct
            .slice(0, 5)
            .map((r) => r.name.replace("น้ำดื่ม TWS ", "")),
          datasets: [
            {
              label: "ยอดขาย",
              data: d.byProduct.slice(0, 5).map((r) => r.revenue),
              backgroundColor: [
                "#1565c0",
                "#00acc1",
                "#43a047",
                "#fb8c00",
                "#8e24aa",
              ],
              borderRadius: 6,
            },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          plugins: { legend: { display: false } },
        },
      });

      // Tables
      document.getElementById("rpt-product-tbody").innerHTML =
        d.byProduct
          .map(
            (r) =>
              `<tr><td>${r.name}</td><td class="text-end">${fmt.number(r.quantity)}</td><td class="text-end">${fmt.currency(r.revenue)}</td></tr>`,
          )
          .join("") ||
        '<tr><td colspan="3" class="text-center text-muted">ไม่มีข้อมูล</td></tr>';

      document.getElementById("rpt-customer-tbody").innerHTML =
        d.byCustomer
          .map(
            (r) =>
              `<tr><td>${r.name}</td><td class="text-end">${r.orders}</td><td class="text-end">${fmt.currency(r.revenue)}</td></tr>`,
          )
          .join("") ||
        '<tr><td colspan="3" class="text-center text-muted">ไม่มีข้อมูล</td></tr>';
    } catch (err) {
      toast(err.message, "danger");
    }
  },

  async loadInventory() {
    try {
      const d = await api.get("/api/reports/inventory");
      document.getElementById("inv-product-count").textContent =
        d.products.length;
      document.getElementById("inv-product-value").textContent = fmt.currency(
        d.productValue,
      );
      document.getElementById("inv-material-count").textContent =
        d.materials.length;
      document.getElementById("inv-material-value").textContent = fmt.currency(
        d.materialValue,
      );

      document.getElementById("inv-low-products-tbody").innerHTML =
        d.products
          .filter((p) => p.stock <= p.min_stock)
          .map(
            (p) =>
              `<tr><td>${p.name}</td><td class="text-end ${p.stock === 0 ? "text-danger fw-bold" : "text-warning fw-semibold"}">${fmt.number(p.stock)}</td><td class="text-end text-muted">${fmt.number(p.min_stock)}</td></tr>`,
          )
          .join("") ||
        '<tr><td colspan="3" class="text-center text-success"><i class="bi bi-check-circle me-1"></i>สต็อกปกติทุกรายการ</td></tr>';

      document.getElementById("inv-low-materials-tbody").innerHTML =
        d.materials
          .filter((m) => m.quantity <= m.min_quantity)
          .map(
            (m) =>
              `<tr><td>${m.name}</td><td class="text-end ${m.quantity === 0 ? "text-danger fw-bold" : "text-warning fw-semibold"}">${fmt.number(m.quantity)}</td><td class="text-end text-muted">${fmt.number(m.min_quantity)}</td></tr>`,
          )
          .join("") ||
        '<tr><td colspan="3" class="text-center text-success"><i class="bi bi-check-circle me-1"></i>วัตถุดิบปกติทุกรายการ</td></tr>';

      document.getElementById("inv-products-tbody").innerHTML = d.products
        .map(
          (p) =>
            `<tr><td><code>${p.code}</code></td><td>${p.name}</td><td class="text-end">${fmt.number(p.stock)} ${p.unit}</td><td class="text-end">${fmt.currency(p.cost)}</td><td class="text-end fw-semibold">${fmt.currency(p.stock * p.cost)}</td></tr>`,
        )
        .join("");
    } catch (err) {
      toast(err.message, "danger");
    }
  },

  async loadProduction() {
    const from =
      document.getElementById("rpt-prod-from").value || fmt.monthStart();
    const to = document.getElementById("rpt-prod-to").value || fmt.today();
    try {
      const d = await api.get(`/api/reports/production?from=${from}&to=${to}`);
      document.getElementById("prod-total").textContent = fmt.number(
        d.summary?.total || 0,
      );
      document.getElementById("prod-completed").textContent = fmt.number(
        d.summary?.completed || 0,
      );
      document.getElementById("prod-planned").textContent = fmt.number(
        d.summary?.planned || 0,
      );
      document.getElementById("prod-produced").textContent = fmt.number(
        d.summary?.produced || 0,
      );
      document.getElementById("rpt-prod-tbody").innerHTML =
        d.orders
          .map(
            (r) =>
              `<tr><td>${r.id}</td><td>${r.product_name}</td><td class="text-end">${fmt.number(r.quantity_planned)}</td><td class="text-end">${r.quantity_produced > 0 ? fmt.number(r.quantity_produced) : "-"}</td><td>${statusBadge(r.status)}</td><td>${fmt.date(r.created_at)}</td></tr>`,
          )
          .join("") ||
        '<tr><td colspan="6" class="text-center text-muted">ไม่มีข้อมูล</td></tr>';
    } catch (err) {
      toast(err.message, "danger");
    }
  },
};

window.loadReportSales = () => reports.loadSales();
window.loadReportProduction = () => reports.loadProduction();

// ─── PROFIT REPORT ────────────────────────────────────────────────────────────
let profitChart = null;

window.loadReportProfit = async () => {
  const from = document.getElementById("rpt-profit-from").value;
  const to = document.getElementById("rpt-profit-to").value;
  try {
    const d = await api.get(`/api/reports/profit?from=${from}&to=${to}`);
    document.getElementById("profit-revenue").textContent = fmt.currency(
      d.total.revenue,
    );
    document.getElementById("profit-cost").textContent = fmt.currency(
      d.total.cost,
    );
    document.getElementById("profit-gross").textContent = fmt.currency(
      d.total.profit,
    );
    const margin =
      d.total.revenue > 0
        ? ((d.total.profit / d.total.revenue) * 100).toFixed(1)
        : 0;
    document.getElementById("profit-margin").textContent = margin + "%";

    // Table
    document.getElementById("rpt-profit-tbody").innerHTML =
      d.byProduct
        .map((r) => {
          const m =
            r.revenue > 0 ? ((r.profit / r.revenue) * 100).toFixed(1) : 0;
          const cls = r.profit >= 0 ? "text-profit" : "text-loss";
          return `<tr>
          <td>${r.name}</td>
          <td class="text-end">${fmt.number(r.qty)}</td>
          <td class="text-end">${fmt.currency(r.revenue)}</td>
          <td class="text-end">${fmt.currency(r.cost)}</td>
          <td class="text-end ${cls}">${fmt.currency(r.profit)}</td>
          <td class="text-end"><span class="badge ${r.profit >= 0 ? "bg-profit" : "bg-loss"}">${m}%</span></td>
        </tr>`;
        })
        .join("") ||
      '<tr><td colspan="6" class="text-center text-muted">ไม่มีข้อมูล</td></tr>';

    // Chart
    if (profitChart) profitChart.destroy();
    const ctx = document.getElementById("rpt-profit-chart").getContext("2d");
    profitChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["ต้นทุน", "กำไร"],
        datasets: [
          {
            data: [d.total.cost, d.total.profit > 0 ? d.total.profit : 0],
            backgroundColor: ["#fbbf24", "#22c55e"],
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom" } },
      },
    });
  } catch (err) {
    toast(err.message, "danger");
  }
};

// Hook into reports.load
const _origReportsLoad = reports.load.bind(reports);
reports.load = function () {
  if (this.currentTab === "profit") {
    loadReportProfit();
    return;
  }
  _origReportsLoad();
};

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
async function loadNotifications() {
  try {
    const d = await api.get("/api/notifications");
    const badge = document.getElementById("notif-count");
    const list = document.getElementById("notif-list");
    if (d.count > 0) {
      badge.textContent = d.count > 9 ? "9+" : d.count;
      badge.style.display = "flex";
    } else {
      badge.style.display = "none";
    }
    if (d.alerts.length === 0) {
      list.innerHTML =
        '<div class="notif-empty"><i class="bi bi-check-circle me-1"></i>ไม่มีการแจ้งเตือน</div>';
      return;
    }
    list.innerHTML = d.alerts
      .map(
        (a) => `
      <div class="notif-item">
        <div class="notif-icon ${a.type}"><i class="bi bi-${a.icon}"></i></div>
        <div>${a.msg}</div>
      </div>`,
      )
      .join("");
  } catch {}
}

window.toggleNotif = () => {
  const dd = document.getElementById("notif-dropdown");
  dd.classList.toggle("open");
  if (dd.classList.contains("open")) loadNotifications();
};

document.addEventListener("click", (e) => {
  if (!e.target.closest(".notif-wrap")) {
    document.getElementById("notif-dropdown").classList.remove("open");
  }
});

// ─── GLOBAL SEARCH ───────────────────────────────────────────────────────────
let _searchTimer = null;

window.openSearch = () => {
  document.getElementById("search-overlay").classList.add("open");
  document.getElementById("search-modal").classList.add("open");
  document.getElementById("search-input").focus();
  document.getElementById("search-input").value = "";
  document.getElementById("search-results").innerHTML =
    '<div class="search-empty">พิมพ์เพื่อค้นหา...</div>';
};

window.closeSearch = () => {
  document.getElementById("search-overlay").classList.remove("open");
  document.getElementById("search-modal").classList.remove("open");
};

window.doSearch = () => {
  clearTimeout(_searchTimer);
  const q = document.getElementById("search-input").value.trim();
  if (!q) {
    document.getElementById("search-results").innerHTML =
      '<div class="search-empty">พิมพ์เพื่อค้นหา...</div>';
    return;
  }
  _searchTimer = setTimeout(async () => {
    try {
      const d = await api.get("/api/search?q=" + encodeURIComponent(q));
      const total = d.customers.length + d.products.length + d.orders.length;
      if (total === 0) {
        document.getElementById("search-results").innerHTML =
          '<div class="search-empty">ไม่พบผลลัพธ์</div>';
        return;
      }
      let html = "";
      if (d.customers.length) {
        html += '<div class="search-group-label">ลูกค้า</div>';
        html += d.customers
          .map(
            (c) => `
          <div class="search-item" onclick="closeSearch();navigate('customers')">
            <div class="search-item-icon"><i class="bi bi-person-fill"></i></div>
            <div class="search-item-main">
              <div class="search-item-title">${c.name}</div>
              <div class="search-item-sub">${c.code} · ${c.phone || "-"}</div>
            </div>
            <span class="badge bg-secondary search-item-badge">${custTypeLabel(c.type)}</span>
          </div>`,
          )
          .join("");
      }
      if (d.products.length) {
        html += '<div class="search-group-label">สินค้า</div>';
        html += d.products
          .map(
            (p) => `
          <div class="search-item" onclick="closeSearch();navigate('products')">
            <div class="search-item-icon" style="background:#ede9fe;color:#7c3aed"><i class="bi bi-droplet-half"></i></div>
            <div class="search-item-main">
              <div class="search-item-title">${p.name}</div>
              <div class="search-item-sub">${p.code} · สต็อก: ${fmt.number(p.stock)} ${p.unit}</div>
            </div>
            <span class="search-item-badge">${fmt.currency(p.price)}</span>
          </div>`,
          )
          .join("");
      }
      if (d.orders.length) {
        html += '<div class="search-group-label">ใบสั่งซื้อ</div>';
        html += d.orders
          .map(
            (o) => `
          <div class="search-item" onclick="closeSearch();navigate('sales')">
            <div class="search-item-icon" style="background:#dcfce7;color:#16a34a"><i class="bi bi-receipt"></i></div>
            <div class="search-item-main">
              <div class="search-item-title">${o.order_number}</div>
              <div class="search-item-sub">${o.customer_name} · ${fmt.date(o.order_date)}</div>
            </div>
            <span class="search-item-badge">${fmt.currency(o.total_amount)}</span>
          </div>`,
          )
          .join("");
      }
      document.getElementById("search-results").innerHTML = html;
    } catch {}
  }, 280);
};

// Keyboard shortcut / to open search, ESC to close
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeSearch();
    return;
  }
  const tag = document.activeElement?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
  if (e.key === "/") {
    e.preventDefault();
    openSearch();
    return;
  }
  // Page shortcuts
  const shortcuts = {
    d: "dashboard",
    m: "materials",
    p: "production",
    s: "sales",
    c: "customers",
    r: "reports",
    u: "users",
  };
  if (!e.ctrlKey && !e.metaKey && !e.altKey && shortcuts[e.key.toLowerCase()]) {
    navigate(shortcuts[e.key.toLowerCase()]);
  }
});

// ─── PRINT INVOICE ───────────────────────────────────────────────────────────
window.printInvoice = () => {
  const bodyEl = document.getElementById("sale-detail-body");
  const orderNum = document.getElementById("detail-order-num").textContent;
  const co = JSON.parse(localStorage.getItem("tws_company") || "{}");
  const companyName = co.name || "TWS Water Factory";
  const companyAddr = co.address || "";
  const companyPhone = co.phone || "";

  const printEl = document.getElementById("print-area");
  printEl.style.display = "block";
  printEl.innerHTML = `
    <div class="print-header">
      <h2>${companyName.toUpperCase()}</h2>
      ${companyAddr ? `<p>${companyAddr}</p>` : ""}
      ${companyPhone ? `<p>โทร: ${companyPhone}</p>` : ""}
      <p style="margin-top:8px;font-weight:700;font-size:15px">ใบกำกับภาษี/ใบเสร็จรับเงิน</p>
      <p>${orderNum}</p>
    </div>
    ${bodyEl.innerHTML}
    <div class="print-footer">พิมพ์เมื่อ ${new Date().toLocaleString("th-TH")} · ขอบคุณที่ใช้บริการ</div>`;
  window.print();
  setTimeout(() => {
    printEl.style.display = "none";
    printEl.innerHTML = "";
  }, 1000);
};

// ─── EXPORT CSV ──────────────────────────────────────────────────────────────
window.exportCSV = (type) => {
  let rows = [],
    filename = "export.csv";
  if (type === "sales") {
    const tbody = document.getElementById("rpt-product-tbody");
    if (!tbody) return;
    rows = [["สินค้า", "จำนวน", "ยอดขาย"]];
    tbody.querySelectorAll("tr").forEach((tr) => {
      const cells = tr.querySelectorAll("td");
      if (cells.length >= 3)
        rows.push([
          cells[0].textContent.trim(),
          cells[1].textContent.trim(),
          cells[2].textContent.trim(),
        ]);
    });
    filename = "sales_report.csv";
  } else if (type === "profit") {
    const tbody = document.getElementById("rpt-profit-tbody");
    if (!tbody) return;
    rows = [["สินค้า", "จำนวน", "รายได้", "ต้นทุน", "กำไร", "มาร์จิ้น"]];
    tbody.querySelectorAll("tr").forEach((tr) => {
      const cells = tr.querySelectorAll("td");
      if (cells.length >= 6)
        rows.push(Array.from(cells).map((c) => c.textContent.trim()));
    });
    filename = "profit_report.csv";
  }
  if (rows.length <= 1) return toast("ไม่มีข้อมูลให้ export", "warning");
  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast("ดาวน์โหลด CSV สำเร็จ");
};

// ─── KANBAN BOARD (PRODUCTION) ───────────────────────────────────────────────
let _prodKanbanData = [];

window.setProdView = (view) => {
  const isKanban = view === "kanban";
  document
    .getElementById("prod-table-view")
    .classList.toggle("d-none", isKanban);
  document
    .getElementById("prod-kanban-view")
    .classList.toggle("d-none", !isKanban);
  document
    .getElementById("prod-view-table")
    .classList.toggle("active", !isKanban);
  document
    .getElementById("prod-view-kanban")
    .classList.toggle("active", isKanban);
  if (isKanban) renderKanban(_prodKanbanData);
};

function renderKanban(data) {
  _prodKanbanData = data;
  const cols = [
    { key: "pending", label: "รอดำเนินการ" },
    { key: "in_progress", label: "กำลังผลิต" },
    { key: "completed", label: "เสร็จแล้ว" },
    { key: "cancelled", label: "ยกเลิก" },
  ];
  const board = document.getElementById("kanban-board");
  board.innerHTML = cols
    .map((col) => {
      const items = data.filter((r) => r.status === col.key);
      const cards = items.length
        ? items
            .map(
              (r) => `
          <div class="kanban-card">
            <div class="kanban-card-title">${r.product_name}</div>
            <div class="kanban-card-meta">สั่งผลิต: ${fmt.number(r.quantity_planned)} หน่วย<br>${fmt.date(r.created_at)}</div>
            ${col.key === "pending" ? `<button class="btn btn-xs btn-outline-primary btn-sm w-100" onclick="changeProductionStatus(${r.id},'in_progress')">เริ่มผลิต</button>` : ""}
            ${col.key === "in_progress" ? `<button class="btn btn-xs btn-outline-success btn-sm w-100" onclick="changeProductionStatus(${r.id},'completed')">เสร็จแล้ว</button>` : ""}
          </div>`,
            )
            .join("")
        : '<div class="kanban-empty">ไม่มีรายการ</div>';
      return `
      <div class="kanban-col">
        <div class="kanban-col-header ${col.key}">
          <span>${col.label}</span>
          <span class="count">${items.length}</span>
        </div>
        <div class="kanban-cards">${cards}</div>
      </div>`;
    })
    .join("");
}

// Helper for kanban quick status change
window.changeProductionStatus = async (id, newStatus) => {
  try {
    await api.put("/api/production/" + id, {
      status: newStatus,
      quantity_produced: null,
    });
    production.load();
    toast("อัปเดตสถานะสำเร็จ");
  } catch (err) {
    toast(err.message, "danger");
  }
};

// Hook production load to store kanban data
const _origProdLoad = production.load.bind(production);
production.load = async function () {
  await _origProdLoad();
  _prodKanbanData = production.data || [];
  if (
    !document.getElementById("prod-kanban-view").classList.contains("d-none")
  ) {
    renderKanban(_prodKanbanData);
  }
};

// ─── DASHBOARD ACTIVITY FEED ─────────────────────────────────────────────────
async function loadDashActivity() {
  try {
    const data = await api.get("/api/dashboard/activity");
    const el = document.getElementById("dash-activity");
    if (!data.length) {
      el.innerHTML =
        '<div class="text-center text-muted py-2"><small>ไม่มีกิจกรรม</small></div>';
      return;
    }
    const icons = {
      sale: "bi-receipt",
      material: "bi-boxes",
      production: "bi-gear-wide-connected",
    };
    el.innerHTML =
      '<div class="activity-feed">' +
      data
        .map(
          (r) => `
      <div class="activity-item">
        <div class="activity-dot ${r.type}"><i class="bi ${icons[r.type] || "bi-circle-fill"}"></i></div>
        <div class="activity-info">
          <div class="activity-title">${r.ref}</div>
          <div class="activity-sub">${r.detail}${r.amount ? ` · ${r.type === "sale" ? fmt.currency(r.amount) : fmt.number(r.amount)}` : ""}</div>
        </div>
        <div class="activity-time">${fmt.timeAgo(r.created_at)}</div>
      </div>`,
        )
        .join("") +
      "</div>";
  } catch {}
}

async function loadDashAlerts() {
  try {
    const d = await api.get("/api/notifications");
    const el = document.getElementById("dash-alerts");
    if (d.count === 0) {
      el.innerHTML =
        '<div class="text-center text-success py-2"><i class="bi bi-check-circle me-1"></i><small>ทุกอย่างปกติ</small></div>';
      return;
    }
    el.innerHTML =
      '<div class="alert-widget">' +
      d.alerts
        .slice(0, 4)
        .map(
          (a) => `
      <div class="alert-item ${a.type}"><i class="bi bi-${a.icon}"></i>${a.msg}</div>`,
        )
        .join("") +
      "</div>";
  } catch {}
}

// Hook dashboard.load to also load activity
const _origDashLoad = dashboard.load.bind(dashboard);
dashboard.load = async function () {
  await _origDashLoad();
  loadDashActivity();
  loadDashAlerts();
  loadNotifications();
};

// Add timeAgo to fmt
fmt.timeAgo = (dt) => {
  if (!dt) return "";
  const diff = Math.floor((Date.now() - new Date(dt)) / 1000);
  if (diff < 60) return "เมื่อกี้";
  if (diff < 3600) return Math.floor(diff / 60) + " นาทีที่แล้ว";
  if (diff < 86400) return Math.floor(diff / 3600) + " ชม.ที่แล้ว";
  return Math.floor(diff / 86400) + " วันที่แล้ว";
};

// ─── SETTINGS PAGE ───────────────────────────────────────────────────────────
function loadSettingsPage() {
  const co = JSON.parse(localStorage.getItem("tws_company") || "{}");
  document.getElementById("set-company").value = co.name || "";
  document.getElementById("set-address").value = co.address || "";
  document.getElementById("set-phone").value = co.phone || "";
  document.getElementById("set-tax").value = co.tax || "";
  document.getElementById("set-cur-pass").value = "";
  document.getElementById("set-new-pass").value = "";
  document.getElementById("set-confirm-pass").value = "";
  // System info
  document.getElementById("sys-username").textContent =
    currentUser?.username || "-";
  document.getElementById("sys-role").textContent =
    roleLabel(currentUser?.role) || "-";
  document.getElementById("sys-login-time").textContent =
    new Date().toLocaleString("th-TH", {
      timeStyle: "short",
      dateStyle: "short",
    });
}

window.saveCompanySettings = () => {
  const co = {
    name: document.getElementById("set-company").value.trim(),
    address: document.getElementById("set-address").value.trim(),
    phone: document.getElementById("set-phone").value.trim(),
    tax: document.getElementById("set-tax").value.trim(),
  };
  localStorage.setItem("tws_company", JSON.stringify(co));
  toast("บันทึกข้อมูลบริษัทสำเร็จ");
};

window.changePassword = async () => {
  const cur = document.getElementById("set-cur-pass").value;
  const nw = document.getElementById("set-new-pass").value;
  const cf = document.getElementById("set-confirm-pass").value;
  if (!cur || !nw || !cf) return toast("กรุณากรอกข้อมูลให้ครบ", "warning");
  if (nw !== cf) return toast("รหัสผ่านใหม่ไม่ตรงกัน", "warning");
  if (nw.length < 6)
    return toast("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร", "warning");
  try {
    const r = await api.put("/api/users/me/password", {
      current_password: cur,
      new_password: nw,
    });
    toast(r.message || "เปลี่ยนรหัสผ่านสำเร็จ");
    document.getElementById("set-cur-pass").value = "";
    document.getElementById("set-new-pass").value = "";
    document.getElementById("set-confirm-pass").value = "";
  } catch (err) {
    toast(err.message, "danger");
  }
};

// ─── QUICK ACTION HELPERS ─────────────────────────────────────────────────────
window.showSaleModal =
  window.showSaleModal ||
  (() => {
    navigate("sales");
    setTimeout(
      () =>
        document.querySelector('[onclick="showSaleModal()"]') &&
        new bootstrap.Modal("#saleModal").show(),
      300,
    );
  });

window.showProductionModal =
  window.showProductionModal ||
  (() => {
    navigate("production");
    setTimeout(() => new bootstrap.Modal("#productionModal").show(), 300);
  });

window.showCustomerModal =
  window.showCustomerModal ||
  (() => {
    navigate("customers");
    setTimeout(() => new bootstrap.Modal("#customerModal").show(), 300);
  });

// ─── Init ────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Set default dates
  document.getElementById("sales-from").value = fmt.monthStart();
  document.getElementById("sales-to").value = fmt.today();
  document.getElementById("rpt-sales-from").value = fmt.monthStart();
  document.getElementById("rpt-sales-to").value = fmt.today();
  document.getElementById("rpt-prod-from").value = fmt.monthStart();
  document.getElementById("rpt-prod-to").value = fmt.today();
  document.getElementById("rpt-profit-from").value = fmt.monthStart();
  document.getElementById("rpt-profit-to").value = fmt.today();

  // Report tab click handlers
  document.querySelectorAll("[data-report]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const tab = a.dataset.report;
      reports.currentTab = tab;
      // Show/hide sections
      ["sales", "inventory", "production", "profit"].forEach((t) => {
        const el = document.getElementById("report-" + t);
        if (el) el.classList.toggle("d-none", t !== tab);
      });
      // Update active tab
      document
        .querySelectorAll("[data-report]")
        .forEach((l) => l.classList.toggle("active", l.dataset.report === tab));
      // Load data
      reports.load();
    });
  });

  checkAuth();
});

// ─── USERS ────────────────────────────────────────────────────────
const users = {
  data: [],
  async load() {
    if (currentUser?.role !== "admin") {
      document.getElementById("users-tbody").innerHTML =
        '<tr><td colspan="7" class="text-center text-danger">ไม่มีสิทธิ์เข้าถึง</td></tr>';
      return;
    }
    try {
      this.data = await api.get("/api/users");
      this.render();
    } catch (err) {
      toast(err.message, "danger");
    }
  },

  render() {
    const tbody = document.getElementById("users-tbody");
    tbody.innerHTML = this.data
      .map(
        (u) => `
      <tr>
        <td>${u.id}</td>
        <td><code>${u.username}</code></td>
        <td>${u.name}</td>
        <td><span class="badge ${roleBadgeClass(u.role)}">${roleLabel(u.role)}</span></td>
        <td>${u.active ? '<span class="badge bg-success">ใช้งาน</span>' : '<span class="badge bg-secondary">ระงับ</span>'}</td>
        <td>${fmt.date(u.created_at)}</td>
        <td>
          ${u.username !== "admin" ? `<button class="btn btn-outline-primary btn-sm" onclick="showUserModal(${u.id})"><i class="bi bi-pencil"></i></button>` : "-"}
        </td>
      </tr>`,
      )
      .join("");
  },
};

window.showUserModal = (id) => {
  const u = id ? users.data.find((x) => x.id === id) : null;
  document.getElementById("userModalTitle").textContent = u
    ? "แก้ไขผู้ใช้"
    : "เพิ่มผู้ใช้";
  document.getElementById("usr-id").value = u?.id || "";
  document.getElementById("usr-username").value = u?.username || "";
  document.getElementById("usr-password").value = "";
  document.getElementById("usr-name").value = u?.name || "";
  document.getElementById("usr-role").value = u?.role || "staff";
  document.getElementById("usr-username").disabled = !!u;
  document.getElementById("usr-pass-required").style.display = u ? "none" : "";
  document.getElementById("usr-active-group").style.display = u ? "" : "none";
  if (u) document.getElementById("usr-active").value = u.active ? "1" : "0";
  new bootstrap.Modal("#userModal").show();
};

window.saveUser = async () => {
  const id = document.getElementById("usr-id").value;
  const data = {
    username: document.getElementById("usr-username").value.trim(),
    password: document.getElementById("usr-password").value,
    name: document.getElementById("usr-name").value.trim(),
    role: document.getElementById("usr-role").value,
    active: parseInt(document.getElementById("usr-active").value) || 1,
  };
  if (!data.name || (!id && (!data.username || !data.password)))
    return toast("กรุณากรอกข้อมูลให้ครบ", "warning");
  try {
    if (id) {
      await api.put("/api/users/" + id, data);
      toast("แก้ไขสำเร็จ");
    } else {
      await api.post("/api/users", data);
      toast("เพิ่มผู้ใช้สำเร็จ");
    }
    bootstrap.Modal.getInstance(document.getElementById("userModal"))?.hide();
    users.load();
  } catch (err) {
    toast(err.message, "danger");
  }
};

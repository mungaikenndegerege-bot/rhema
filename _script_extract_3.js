
    const initialProducts = [
      { id: "p1", name: "USB-C fast charger 25W", sku: "CHG-025", category: "Chargers", retail: 2460, wholesale: 1620, stock: 24, reorder: 5 },
      { id: "p2", name: "Braided USB-C cable 1m", sku: "CBL-C1M", category: "Cables", retail: 1295, wholesale: 745, stock: 37, reorder: 8 },
      { id: "p3", name: "Tempered glass protector", sku: "SCR-TG01", category: "Protection", retail: 1555, wholesale: 905, stock: 4, reorder: 6 },
      { id: "p4", name: "Magnetic phone stand", sku: "STD-MAG", category: "Stands", retail: 1880, wholesale: 1200, stock: 12, reorder: 4 },
      { id: "p5", name: "Wireless earbuds", sku: "AUD-WL02", category: "Audio", retail: 4535, wholesale: 3110, stock: 9, reorder: 3 },
      { id: "p6", name: "10,000mAh power bank", sku: "PWR-10K", category: "Power", retail: 3885, wholesale: 2590, stock: 7, reorder: 3 },
      { id: "p7", name: "Clear shockproof case", sku: "CAS-CLR1", category: "Protection", retail: 2075, wholesale: 1230, stock: 18, reorder: 5 },
      { id: "p8", name: "Lightning cable 1m", sku: "CBL-L1M", category: "Cables", retail: 1555, wholesale: 905, stock: 3, reorder: 6 },
      { id: "p9", name: "Dual USB car charger", sku: "CHG-CAR2", category: "Chargers", retail: 2010, wholesale: 1330, stock: 16, reorder: 4 }
    ];
    const readStore = (key, fallback) => {
      try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
      catch (error) { return fallback; }
    };
    const usdToKesRate = 129.556657;
    const convertUsdToKes = amount => Math.round(Number(amount) * usdToKesRate / 5) * 5;
    function migrateLegacyCurrency() {
      if (localStorage.getItem("counterpoint-currency-version") === "kes-v1") return;
      const storedProducts = readStore("counterpoint-products", null);
      const storedSales = readStore("counterpoint-sales", null);
      const storedRepairs = readStore("counterpoint-repairs", null);
      if (Array.isArray(storedProducts)) {
        localStorage.setItem("counterpoint-products", JSON.stringify(storedProducts.map(product => ({ ...product, retail: convertUsdToKes(product.retail), wholesale: convertUsdToKes(product.wholesale) }))));
      }
      if (Array.isArray(storedSales)) {
        localStorage.setItem("counterpoint-sales", JSON.stringify(storedSales.map(sale => {
          const items = Array.isArray(sale.items) ? sale.items.map(item => ({ ...item, price: convertUsdToKes(item.price) })) : [];
          const total = items.length ? items.reduce((sum, item) => sum + item.price * item.quantity, 0) : convertUsdToKes(sale.total);
          return { ...sale, items, total };
        })));
      }
      if (Array.isArray(storedRepairs)) {
        localStorage.setItem("counterpoint-repairs", JSON.stringify(storedRepairs.map(ticket => ({ ...ticket, estimate: convertUsdToKes(ticket.estimate) }))));
      }
      localStorage.setItem("counterpoint-currency-version", "kes-v1");
    }
    migrateLegacyCurrency();
    let products = readStore("counterpoint-products", initialProducts);
    let sales = readStore("counterpoint-sales", []);
    let repairs = readStore("counterpoint-repairs", []);
    // Inventory PIN (default 1234)
    const INVENTORY_PIN_KEY = 'rhema-inventory-pin';
    if (!localStorage.getItem(INVENTORY_PIN_KEY)) localStorage.setItem(INVENTORY_PIN_KEY, '1234');
    function getInventoryPin() { return localStorage.getItem(INVENTORY_PIN_KEY) || '1234'; }
    function setInventoryPin(pin) { localStorage.setItem(INVENTORY_PIN_KEY, String(pin)); notify('Inventory PIN updated.'); }
    // Normalize any legacy date strings to numeric timestamps (ms since epoch)
    function normalizeTimestamps() {
      let changed = false;
      if (Array.isArray(sales)) {
        sales = sales.map(sale => {
          if (sale && typeof sale.date === 'string') {
            const t = Date.parse(sale.date);
            if (!Number.isNaN(t)) { changed = true; return { ...sale, date: t }; }
          }
          return sale;
        });
      }
      if (Array.isArray(repairs)) {
        repairs = repairs.map(ticket => {
          if (ticket && typeof ticket.date === 'string') {
            const t = Date.parse(ticket.date);
            if (!Number.isNaN(t)) { changed = true; return { ...ticket, date: t }; }
          }
          return ticket;
        });
      }
      if (changed) persist();
    }
    normalizeTimestamps();
    let cart = [];
    let mode = "retail";
    let category = "All";
    let modalSubmit = null;
    const money = value => "KSh " + Number(value).toLocaleString("en-KE", { maximumFractionDigits: 2 });
    const safe = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
    const persist = () => {
      localStorage.setItem("counterpoint-products", JSON.stringify(products));
      localStorage.setItem("counterpoint-sales", JSON.stringify(sales));
      localStorage.setItem("counterpoint-repairs", JSON.stringify(repairs));
    };
    function notify(message) {
      const element = document.getElementById("notice");
      element.textContent = message;
      element.classList.add("show");
      clearTimeout(notify.timer);
      notify.timer = setTimeout(() => element.classList.remove("show"), 2400);
    }
    function showScreen(name) {
      document.querySelectorAll(".screen").forEach(screen => screen.classList.toggle("active", screen.id === "screen-" + name));
      document.querySelectorAll(".nav-btn").forEach(button => button.classList.toggle("active", button.dataset.screen === name));
      const labels = { overview: "Overview", checkout: "Checkout", inventory: "Inventory", repairs: "Repairs", reports: "Reports" };
      document.getElementById("crumbCurrent").textContent = labels[name];
      if (name === "overview") renderDashboard();
      if (name === "checkout") renderProducts();
      if (name === "inventory") renderInventory();
      if (name === "repairs") renderRepairs();
      if (name === "reports") renderReportsScreen();
    }
    function updateHeaderDate() {
      const el = document.getElementById('headerDate');
      if (!el) return;
      const now = new Date();
      el.textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    }
    function renderDashboard() {
      updateHeaderDate();
      const today = new Date().toDateString();
      const todaySales = sales.filter(sale => new Date(sale.date).toDateString() === today);
      document.getElementById("metricSales").textContent = money(todaySales.reduce((sum, sale) => sum + sale.total, 0));
      document.getElementById("metricItems").textContent = todaySales.reduce((sum, sale) => sum + sale.items.reduce((count, item) => count + item.quantity, 0), 0);
      document.getElementById("metricRepairs").textContent = repairs.filter(ticket => ticket.status !== "Collected").length;
      document.getElementById("metricLow").textContent = products.filter(product => product.stock <= product.reorder).length;
      const rows = todaySales.map(sale => `<tr><td class="product-name">${safe(sale.receipt)}</td><td>${new Date(sale.date).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", hour12: false})}</td><td><span class="tag">${safe(sale.mode)}</span></td><td>${safe(sale.payment)}</td><td class="product-name">${money(sale.total)}</td></tr>`).join("");
      document.getElementById("recentSales").innerHTML = rows || `<tr><td colspan="5" class="empty-note">No sales yet. Your completed sales will appear here.</td></tr>`;
    }
    function renderCategories() {
      const values = ["All", ...new Set(products.map(product => product.category))];
      document.getElementById("categories").innerHTML = values.map(value => `<button class="category ${category === value ? "active" : ""}" data-category="${safe(value)}">${safe(value)}</button>`).join("");
      document.querySelectorAll(".category").forEach(button => button.addEventListener("click", () => { category = button.dataset.category; renderProducts(); }));
    }
    function renderProducts() {
      renderCategories();
      const query = document.getElementById("productSearch").value.trim().toLowerCase();
      const visible = products.filter(product => (category === "All" || product.category === category) && `${product.name} ${product.sku}`.toLowerCase().includes(query));
      document.getElementById("productGrid").innerHTML = visible.map(product => `<button class="product-card" data-product="${safe(product.id)}" ${product.stock < 1 ? "disabled" : ""}><span class="product-icon">${safe(product.category.slice(0, 2).toUpperCase())}</span><strong>${safe(product.name)}</strong><span class="product-bottom"><span class="product-price">${money(mode === "retail" ? product.retail : product.wholesale)}</span><span class="product-stock">${product.stock} in stock</span></span></button>`).join("") || `<div class="empty-note">No matching products.</div>`;
      document.querySelectorAll(".product-card[data-product]").forEach(button => button.addEventListener("click", () => addToCart(button.dataset.product)));
      renderCart();
    }
    function addToCart(id) {
      const product = products.find(item => item.id === id);
      if (!product || product.stock < 1) return;
      const existing = cart.find(item => item.id === id);
      if (existing) {
        if (existing.quantity >= product.stock) return notify("Not enough stock for that quantity.");
        existing.quantity++;
      } else cart.push({ id, quantity: 1 });
      renderCart();
    }
    function renderCart() {
      const element = document.getElementById("cartItems");
      element.innerHTML = cart.length ? cart.map(item => {
        const product = products.find(entry => entry.id === item.id);
        if (!product) return "";
        const price = mode === "retail" ? product.retail : product.wholesale;
        return `<div class="cart-row"><div><div class="cart-row-name">${safe(product.name)}</div><div class="cart-row-price">${money(price)} each</div><div class="qty-controls"><button class="qty-btn" data-qty="-1" data-id="${safe(product.id)}" aria-label="Decrease quantity">-</button><span class="qty-val">${item.quantity}</span><button class="qty-btn" data-qty="1" data-id="${safe(product.id)}" aria-label="Increase quantity">+</button></div></div><strong>${money(price * item.quantity)}</strong></div>`;
      }).join("") : `<div class="cart-empty">Your basket is empty.</div>`;
      element.querySelectorAll(".qty-btn").forEach(button => button.addEventListener("click", () => changeQuantity(button.dataset.id, Number(button.dataset.qty))));
      const subtotal = cart.reduce((sum, item) => {
        const product = products.find(entry => entry.id === item.id);
        return sum + (product ? (mode === "retail" ? product.retail : product.wholesale) * item.quantity : 0);
      }, 0);
      const tax = Math.round(subtotal * 0.0 * 100) / 100;
      document.getElementById("cartSubtotal").textContent = money(subtotal);
      document.getElementById("cartTax").textContent = money(tax);
      document.getElementById("cartTotal").textContent = money(subtotal + tax);
      document.getElementById("completeSale").textContent = "Charge " + money(subtotal + tax);
    }
    function changeQuantity(id, delta) {
      const item = cart.find(entry => entry.id === id);
      const product = products.find(entry => entry.id === id);
      if (!item || !product) return;
      item.quantity += delta;
      if (item.quantity <= 0) cart = cart.filter(entry => entry.id !== id);
      else if (item.quantity > product.stock) { item.quantity = product.stock; notify("Quantity capped at available stock."); }
      renderCart();
    }
    function completeSale() {
      if (!cart.length) return notify("Add an item before charging.");
      for (const item of cart) {
        const product = products.find(entry => entry.id === item.id);
        if (!product || product.stock < item.quantity) return notify("Stock changed. Check the basket and try again.");
      }
      const items = cart.map(item => {
        const product = products.find(entry => entry.id === item.id);
        const price = mode === "retail" ? product.retail : product.wholesale;
        return { id: product.id, name: product.name, price, quantity: item.quantity };
      });
      const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      products = products.map(product => {
        const line = cart.find(item => item.id === product.id);
        return line ? { ...product, stock: product.stock - line.quantity } : product;
      });
      sales.unshift({ receipt: "CP-" + Date.now().toString().slice(-7), date: Date.now(), mode: mode === "retail" ? "Retail" : "Wholesale", payment: document.getElementById("paymentMethod").value, items, total });
      cart = [];
      persist(); renderProducts(); renderDashboard();
      notify("Sale completed and stock updated.");
    }
    function renderInventory() {
      const query = document.getElementById("inventorySearch").value.trim().toLowerCase();
      const visible = products.filter(product => `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(query));
      document.getElementById("inventoryCount").textContent = `${visible.length} product${visible.length === 1 ? "" : "s"}`;
      document.getElementById("inventoryRows").innerHTML = visible.map(product => `<tr><td><div class="product-name">${safe(product.name)}</div><div class="subcell">Reorder at ${product.reorder}</div></td><td>${safe(product.sku)}</td><td>${safe(product.category)}</td><td>${money(product.retail)}</td><td>${money(product.wholesale)}</td><td><span class="tag ${product.stock <= product.reorder ? "warn" : ""}">${product.stock}</span></td><td><button class="btn small" data-edit-product="${safe(product.id)}">Edit</button></td></tr>`).join("") || `<tr><td colspan="7" class="empty-note">No products found.</td></tr>`;
      document.querySelectorAll("[data-edit-product]").forEach(button => button.addEventListener("click", () => openProductModal(button.dataset.editProduct)));
    }
    function openModal(title, body, submit) {
      document.getElementById("modalTitle").textContent = title;
      document.getElementById("modalContent").innerHTML = body;
      modalSubmit = submit;
      document.getElementById("modalBackdrop").classList.add("open");
      document.getElementById("modalContent").querySelector("input")?.focus();
    }
    function closeModal() { document.getElementById("modalBackdrop").classList.remove("open"); modalSubmit = null; }
    function openProductModal(id) {
      const product = products.find(item => item.id === id);
      const value = key => product ? safe(product[key]) : "";
      const fields = `<div class="form-grid"><div class="form-field full"><label for="fName">Product name</label><input class="field" id="fName" required value="${value("name")}" placeholder="e.g. USB-C charger"></div><div class="form-field"><label for="fSku">SKU</label><input class="field" id="fSku" required value="${value("sku")}" placeholder="CHG-001"></div><div class="form-field"><label for="fCategory">Category</label><input class="field" id="fCategory" required value="${value("category")}" placeholder="Chargers"></div><div class="form-field"><label for="fRetail">Retail price</label><input class="field" id="fRetail" type="number" min="0" step="0.01" required value="${product ? product.retail : ""}"></div><div class="form-field"><label for="fWholesale">Wholesale price</label><input class="field" id="fWholesale" type="number" min="0" step="0.01" required value="${product ? product.wholesale : ""}"></div><div class="form-field"><label for="fStock">Quantity in stock</label><input class="field" id="fStock" type="number" min="0" step="1" required value="${product ? product.stock : "0"}"></div><div class="form-field"><label for="fReorder">Reorder point</label><input class="field" id="fReorder" type="number" min="0" step="1" required value="${product ? product.reorder : "5"}"></div></div>`;
      openModal(product ? "Edit product" : "Add product", fields, () => {
        const name = document.getElementById("fName").value.trim();
        const sku = document.getElementById("fSku").value.trim();
        const categoryValue = document.getElementById("fCategory").value.trim();
        const retail = Number(document.getElementById("fRetail").value);
        const wholesale = Number(document.getElementById("fWholesale").value);
        const stock = Number(document.getElementById("fStock").value);
        const reorder = Number(document.getElementById("fReorder").value);
        if (!name || !sku || !categoryValue || [retail, wholesale, stock, reorder].some(number => !Number.isFinite(number) || number < 0)) return notify("Fill in all product fields with valid values.");
        if (products.some(item => item.sku.toLowerCase() === sku.toLowerCase() && item.id !== id)) return notify("That SKU is already in use.");
        if (product) Object.assign(product, { name, sku, category: categoryValue, retail, wholesale, stock, reorder });
        else products.unshift({ id: "p" + Date.now(), name, sku, category: categoryValue, retail, wholesale, stock, reorder });
        persist(); closeModal(); renderInventory(); renderProducts(); notify(product ? "Product updated." : "Product added.");
      });
    }
    function renderRepairs() {
      const filter = document.getElementById("repairFilter").value;
      const visible = repairs.filter(ticket => filter === "All" || ticket.status === filter);
      document.getElementById("repairCount").textContent = `${visible.length} ticket${visible.length === 1 ? "" : "s"}`;
      document.getElementById("repairList").innerHTML = visible.map(ticket => `<article class="repair-card"><div><strong>${safe(ticket.device)} <span class="tag repair">${safe(ticket.status)}</span></strong><p>${safe(ticket.customer)} &middot; ${safe(ticket.phone)} &middot; ${safe(ticket.issue)}</p><p>Received ${new Date(ticket.date).toLocaleDateString()}${ticket.estimate ? " &middot; Estimate " + money(ticket.estimate) : ""}</p></div><div class="repair-actions"><select class="field" data-repair-status="${safe(ticket.id)}" aria-label="Repair status for ${safe(ticket.device)}"><option ${ticket.status === "Waiting" ? "selected" : ""}>Waiting</option><option ${ticket.status === "In progress" ? "selected" : ""}>In progress</option><option ${ticket.status === "Ready" ? "selected" : ""}>Ready</option><option ${ticket.status === "Collected" ? "selected" : ""}>Collected</option></select><button class="btn small" data-delete-repair="${safe(ticket.id)}" aria-label="Delete repair ticket">Remove</button></div></article>`).join("") || `<div class="empty-note">No repair tickets here yet.</div>`;
      document.querySelectorAll("[data-repair-status]").forEach(select => select.addEventListener("change", () => {
        const ticket = repairs.find(entry => entry.id === select.dataset.repairStatus);
        if (ticket) { ticket.status = select.value; persist(); renderRepairs(); renderDashboard(); }
      }));
      document.querySelectorAll("[data-delete-repair]").forEach(button => button.addEventListener("click", () => {
        repairs = repairs.filter(ticket => ticket.id !== button.dataset.deleteRepair); persist(); renderRepairs(); renderDashboard(); notify("Repair ticket removed.");
      }));
    }
    // Reports screen: generate monthly combined report and provide CSV (Excel) and PDF downloads
    function renderReportsScreen() {
      // default month to current
      const monthInput = document.getElementById("reportMonth");
      if (!monthInput.value) {
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        monthInput.value = `${now.getFullYear()}-${mm}`;
      }
      renderReportPreview();
      document.getElementById("reportMonth").addEventListener("change", renderReportPreview);
      document.getElementById("downloadExcel").addEventListener("click", () => {
        const month = document.getElementById("reportMonth").value;
        const report = generateMonthlyReport(month);
        const csv = buildCsv(report);
        downloadBlob(csv, `rhema-report-${month}.csv`, 'text/csv');
      });
      document.getElementById("downloadPdf").addEventListener("click", async () => {
        const month = document.getElementById("reportMonth").value;
        const report = generateMonthlyReport(month);
        await downloadReportPdf(report, month);
      });
    }

    function generateMonthlyReport(monthStr) {
      // monthStr like "2026-10"
      if (!monthStr) monthStr = new Date().toISOString().slice(0,7);
      const [year, month] = monthStr.split('-').map(Number);
      const salesRows = sales.filter(sale => {
        const d = new Date(sale.date);
        return d.getFullYear() === year && (d.getMonth() + 1) === month;
      }).map(sale => ({ receipt: sale.receipt, date: new Date(sale.date).toLocaleDateString(), time: new Date(sale.date).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', hour12: false}), mode: sale.mode, payment: sale.payment, total: sale.total }));
      const repairRows = repairs.filter(r => {
        const d = new Date(r.date);
        return d.getFullYear() === year && (d.getMonth() + 1) === month;
      }).map(r => ({ id: r.id, date: new Date(r.date).toLocaleDateString(), customer: r.customer, phone: r.phone, device: r.device, issue: r.issue, estimate: r.estimate, status: r.status }));
      const totals = { salesCount: salesRows.length, salesTotal: salesRows.reduce((s, r) => s + r.total, 0), repairsCount: repairRows.length };
      return { month: monthStr, salesRows, repairRows, totals };
    }

    function buildCsv(report) {
      const lines = [];
      lines.push(`"Rhema Mobile Technologies - Monthly Report","${report.month}"`);
      lines.push('');
      lines.push('Sales');
      lines.push('Receipt,Date,Time,Type,Payment,Total');
      for (const s of report.salesRows) lines.push([s.receipt, s.date, s.time, s.mode, s.payment, s.total].map(x => `"${String(x).replace(/"/g,'""')}"`).join(','));
      lines.push('');
      lines.push('Repairs');
      lines.push('ID,Date,Customer,Phone,Device,Issue,Estimate,Status');
      for (const r of report.repairRows) lines.push([r.id, r.date, r.customer, r.phone, r.device, r.issue, r.estimate, r.status].map(x => `"${String(x).replace(/"/g,'""')}"`).join(','));
      lines.push('');
      lines.push(`Totals,Sales Count: ${report.totals.salesCount},Sales Total: ${report.totals.salesTotal},Repairs Count: ${report.totals.repairsCount}`);
      return lines.join('\n');
    }

    function downloadBlob(content, filename, mime) {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    async function downloadReportPdf(report, month) {
      try {
        const jspdfLib = window.jspdf;
        const PDFClass = jspdfLib ? jspdfLib.jsPDF : window.jsPDF;
        const doc = new PDFClass();
        doc.setFontSize(12);
        doc.text(`Rhema Mobile Technologies - Monthly Report (${report.month})`, 14, 18);
        let y = 26;
        if (report.salesRows.length) {
          doc.text('Sales', 14, y);
          doc.autoTable({ startY: y + 2, head: [['Receipt','Date','Time','Type','Payment','Total']], body: report.salesRows.map(r => [r.receipt, r.date, r.time, r.mode, r.payment, r.total]) });
          y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : y + 80;
        } else {
          doc.text('No sales for this month', 14, y + 6);
          y += 20;
        }
        if (report.repairRows.length) {
          doc.text('Repairs', 14, y);
          doc.autoTable({ startY: y + 2, head: [['ID','Date','Customer','Phone','Device','Estimate','Status']], body: report.repairRows.map(r => [r.id, r.date, r.customer, r.phone, r.device, r.estimate, r.status]) });
        } else {
          doc.text('No repairs for this month', 14, y + 6);
        }
        doc.save(`rhema-report-${month}.pdf`);
      } catch (e) { notify('PDF generation failed.'); console.error(e); }
    }

    function renderReportPreview() {
      const month = document.getElementById('reportMonth').value;
      const report = generateMonthlyReport(month);
      const wrap = document.getElementById('reportPreview');
      let html = `<div style="margin-bottom:10px;">Sales: ${report.totals.salesCount} transactions &middot; Total ${money(report.totals.salesTotal)} | Repairs: ${report.totals.repairsCount}</div>`;
      if (report.salesRows.length) {
        html += '<table><thead><tr><th>Receipt</th><th>Date</th><th>Time</th><th>Type</th><th>Payment</th><th>Total</th></tr></thead><tbody>' + report.salesRows.map(s => `<tr><td class="product-name">${safe(s.receipt)}</td><td>${safe(s.date)}</td><td>${safe(s.time)}</td><td>${safe(s.mode)}</td><td>${safe(s.payment)}</td><td>${money(s.total)}</td></tr>`).join('') + '</tbody></table>';
      } else html += '<div class="empty-note">No sales in this month.</div>';
      if (report.repairRows.length) {
        html += '<h4 style="margin-top:12px;">Repairs</h4><table><thead><tr><th>ID</th><th>Date</th><th>Customer</th><th>Phone</th><th>Device</th><th>Estimate</th><th>Status</th></tr></thead><tbody>' + report.repairRows.map(r => `<tr><td>${safe(r.id)}</td><td>${safe(r.date)}</td><td>${safe(r.customer)}</td><td>${safe(r.phone)}</td><td>${safe(r.device)}</td><td>${money(r.estimate)}</td><td>${safe(r.status)}</td></tr>`).join('') + '</tbody></table>';
      }
      wrap.innerHTML = html;
    }
    function openRepairModal() {
      const body = `<div class="form-grid"><div class="form-field"><label for="rCustomer">Customer name</label><input class="field" id="rCustomer" required></div><div class="form-field"><label for="rPhone">Phone number</label><input class="field" id="rPhone" required></div><div class="form-field"><label for="rDevice">Device</label><input class="field" id="rDevice" required placeholder="Brand and model"></div><div class="form-field"><label for="rEstimate">Estimate</label><input class="field" id="rEstimate" type="number" min="0" step="0.01" placeholder="0.00"></div><div class="form-field full"><label for="rIssue">Reported issue</label><input class="field" id="rIssue" required placeholder="Screen, battery, charging port..."></div></div>`;
      openModal("New repair ticket", body, () => {
        const customer = document.getElementById("rCustomer").value.trim();
        const phone = document.getElementById("rPhone").value.trim();
        const device = document.getElementById("rDevice").value.trim();
        const issue = document.getElementById("rIssue").value.trim();
        const estimateValue = document.getElementById("rEstimate").value;
        const estimate = estimateValue === "" ? 0 : Number(estimateValue);
        if (!customer || !phone || !device || !issue || !Number.isFinite(estimate) || estimate < 0) return notify("Complete the required repair details.");
        repairs.unshift({ id: "r" + Date.now(), customer, phone, device, issue, estimate, date: Date.now(), status: "Waiting" });
        persist(); closeModal(); renderRepairs(); renderDashboard(); notify("Repair ticket created.");
      });
    // Inventory PIN modal and management
    function requireInventoryPin(successCallback) {
      const body = `<div class="form-grid"><div class="form-field"><label for="invPin">Enter inventory PIN</label><input class="field" id="invPin" type="password" inputmode="numeric" maxlength="6" autofocus></div></div>`;
      openModal('Inventory PIN', body, () => {
        const pin = document.getElementById('invPin')?.value.trim();
        if (pin === getInventoryPin()) { closeModal(); if (typeof successCallback === 'function') successCallback(); }
        else notify('Incorrect PIN');
      });
    }

    function openSetPinModal() {
      const body = `<div class="form-grid"><div class="form-field"><label for="curPin">Current PIN</label><input class="field" id="curPin" type="password" inputmode="numeric" maxlength="6"></div><div class="form-field"><label for="newPin">New PIN (4-6 digits)</label><input class="field" id="newPin" type="password" inputmode="numeric" maxlength="6"></div><div class="form-field"><label for="confirmPin">Confirm new PIN</label><input class="field" id="confirmPin" type="password" inputmode="numeric" maxlength="6"></div></div>`;
      openModal('Set inventory PIN', body, () => {
        const cur = document.getElementById('curPin')?.value.trim();
        const np = document.getElementById('newPin')?.value.trim();
        const cp = document.getElementById('confirmPin')?.value.trim();
        if (cur !== getInventoryPin()) return notify('Current PIN incorrect');
        if (!/^\d{4,6}$/.test(np)) return notify('New PIN must be 4-6 digits');
        if (np !== cp) return notify('PIN values do not match');
        setInventoryPin(np); closeModal();
      });
    }
    }
    document.querySelectorAll(".nav-btn").forEach(button => button.addEventListener("click", () => {
      if (button.dataset.screen === 'inventory') {
        // require PIN before opening inventory
        requireInventoryPin(() => showScreen('inventory'));
      } else showScreen(button.dataset.screen);
    }));
    document.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => showScreen(button.dataset.go)));
    document.getElementById("priceMode").addEventListener("click", event => {
      const button = event.target.closest("[data-mode]");
      if (!button) return;
      mode = button.dataset.mode;
      document.querySelectorAll("#priceMode button").forEach(item => item.classList.toggle("active", item === button));
      renderProducts();
    });
    document.getElementById("productSearch").addEventListener("input", renderProducts);
    document.getElementById("inventorySearch").addEventListener("input", renderInventory);
    document.getElementById("clearCart").addEventListener("click", () => { cart = []; renderCart(); });
    document.getElementById("completeSale").addEventListener("click", completeSale);
    document.getElementById("addProduct").addEventListener("click", () => openProductModal(null));
    document.getElementById("setInventoryPin").addEventListener("click", openSetPinModal);
    document.getElementById("newRepair").addEventListener("click", openRepairModal);
    document.getElementById("repairFilter").addEventListener("change", renderRepairs);
    document.getElementById("closeModal").addEventListener("click", closeModal);
    document.getElementById("cancelModal").addEventListener("click", closeModal);
    document.getElementById("saveModal").addEventListener("click", () => modalSubmit?.());
    document.getElementById("modalBackdrop").addEventListener("click", event => { if (event.target.id === "modalBackdrop") closeModal(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape") closeModal(); });
    document.querySelectorAll("[data-print]").forEach(button => button.addEventListener("click", () => {
      document.getElementById("printMeta").textContent = `${button.dataset.print} - generated ${new Date().toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}`;
      // Keep previous behaviour: open print dialog. The new Download PDF option is available under Reports.
      window.print();
    }));
    // Ensure dashboard metrics and recent sales/time-sensitive UI update regularly using local time
    renderDashboard();
    // Refresh dashboard every minute so dates/times reflect the current local time
    setInterval(renderDashboard, 60000);
  

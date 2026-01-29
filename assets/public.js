import { db } from "./firebase.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ======================
   HELPERS
====================== */
const el = (id) => document.getElementById(id);

// ✅ Sem "R$" — apenas número
const money = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function formatDateTime(d = new Date()) {
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// GitHub Pages: Admin usa "/assets/..." -> público com <base> usa "./assets/..."
function fixAssetPath(p) {
  if (!p) return "";
  const s = String(p).trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("./")) return s;
  if (s.startsWith("/")) return "." + s; // "/assets/..." => "./assets/..."
  return "./" + s.replace(/^(\.\/)+/, "");
}

function makeWhatsLink(raw) {
  if (!raw) return "#";
  const s = String(raw).trim();
  if (!s) return "#";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  const digits = s.replace(/\D/g, "");
  return digits.length >= 10 ? `https://wa.me/${digits}` : "#";
}

function pick(obj, keys, fallback = "") {
  for (const k of keys) {
    if (!obj) continue;
    if (k.includes(".")) {
      const parts = k.split(".");
      let cur = obj;
      for (const p of parts) cur = cur?.[p];
      if (cur !== undefined && cur !== null && String(cur).trim() !== "")
        return cur;
    } else {
      const v = obj?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
  }
  return fallback;
}

function clampPos(v, fallback = 50) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

/* ======================
   ESTADO
====================== */
let cart = []; // { productId, name, price, qty }
let cartOpen = false;

// mapa do estoque em tempo real: productId -> number|null
const stockMap = new Map();

const WORKER_URL = "https://site-encomendas-patos.viniespezio21.workers.dev";

const cartBtn = el("cartOpenBtn");
const cartCount = el("cartCount");

/* ======================
   CARRINHO (painel fixo)
====================== */
const cartPanel = document.createElement("div");
cartPanel.id = "cartPanel";
cartPanel.style.display = "none";

// canto esquerdo fixo
cartPanel.style.position = "fixed";
cartPanel.style.left = "16px";
cartPanel.style.top = "78px";
cartPanel.style.width = "320px";
cartPanel.style.maxHeight = "calc(100vh - 110px)";
cartPanel.style.overflow = "auto";
cartPanel.style.zIndex = "99999";

// visual
cartPanel.style.background = "#141414";
cartPanel.style.border = "1px solid rgba(255,255,255,.08)";
cartPanel.style.borderRadius = "14px";
cartPanel.style.padding = "14px";
cartPanel.style.boxShadow = "0 18px 40px rgba(0,0,0,.55)";

// ✅ estilo do texto "Pagamento em cash..."
const style = document.createElement("style");
style.textContent = `
  .pay-hint{
    margin-top: 4px;
    font-size: 12px;
    opacity: .85;
  }
`;
document.head.appendChild(style);

document.body.appendChild(cartPanel);

cartBtn?.addEventListener("click", () => {
  cartOpen = !cartOpen;
  cartPanel.style.display = cartOpen ? "block" : "none";
  renderCart();
});

function getAvailableStock(productId) {
  if (!stockMap.has(productId)) return null;
  const v = stockMap.get(productId);
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeCartAgainstStock() {
  let changed = false;

  cart = cart
    .map((i) => {
      const avail = getAvailableStock(i.productId);
      if (avail === null) return i;

      const newQty = Math.min(i.qty, avail);
      if (newQty !== i.qty) changed = true;

      return { ...i, qty: newQty };
    })
    .filter((i) => i.qty > 0);

  return changed;
}

function renderCart() {
  normalizeCartAgainstStock();

  const total = cart.reduce((s, i) => s + i.qty * i.price, 0);
  cartCount.textContent = cart.length;

  cartPanel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <h3 style="margin:0">Carrinho</h3>
      <button id="closeCart" class="btn secondary" type="button" style="padding:6px 10px">Fechar</button>
    </div>

    ${
      cart.length === 0
        ? `<p class="small" style="margin-top:10px">Carrinho vazio</p>`
        : ""
    }

    ${cart
      .map((i, idx) => {
        const avail = getAvailableStock(i.productId);
        const stockLine =
          avail === null ? "" : `<span class="small">Estoque: ${avail}</span><br>`;
        return `
          <div class="hr" style="margin:10px 0"></div>
          <div>
            <strong>${i.name}</strong><br>
            ${stockLine}
            <span class="small">Qtd: ${i.qty}</span><br>
            <strong>${money(i.price * i.qty)}</strong>
            <div class="pay-hint">Pagamento em cash do jogo!</div>
            <div style="margin-top:8px">
              <button class="btn danger" data-remove="${idx}" type="button">Remover</button>
            </div>
          </div>
        `;
      })
      .join("")}

    <div class="hr" style="margin:12px 0"></div>
    <strong>Total: ${money(total)}</strong>
    <div class="pay-hint">Pagamento em cash do jogo!</div>

    <div class="hr" style="margin:12px 0"></div>

    <label class="small">Nick no jogo</label>
    <input id="nickInput" class="input" placeholder="">

    <label class="small" style="margin-top:10px;display:block">@ do Discord</label>
    <input id="discordInput" class="input" placeholder="">

    <button class="btn" style="width:100%;margin-top:12px" id="sendOrder" type="button">
      Finalizar pedido
    </button>
  `;

  el("closeCart")?.addEventListener("click", () => {
    cartOpen = false;
    cartPanel.style.display = "none";
  });

  cartPanel.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      cart.splice(Number(btn.dataset.remove), 1);
      renderCart();
    });
  });

  el("sendOrder")?.addEventListener("click", sendOrder);
}

/* ======================
   ENVIA PEDIDO
====================== */
async function sendOrder() {
  const nick = el("nickInput").value.trim();
  const discord = el("discordInput").value.trim();

  if (!nick || !discord) {
    alert("Preencha Nick e Discord");
    return;
  }

  // valida estoque antes de enviar
  for (const item of cart) {
    const avail = getAvailableStock(item.productId);
    if (avail !== null && item.qty > avail) {
      alert(`"${item.name}" tem só ${avail} em estoque. Ajuste a quantidade.`);
      renderCart();
      return;
    }
    if (avail !== null && avail <= 0) {
      alert(`"${item.name}" está sem estoque.`);
      renderCart();
      return;
    }
  }

  const total = cart.reduce((s, i) => s + i.qty * i.price, 0);

  const payload = {
    nick,
    discord,
    items: cart.map((i) => ({
      productId: i.productId,
      name: i.name,
      qty: i.qty,
      unitPrice: i.price,
      unitPriceText: money(i.price),
      subtotalText: money(i.price * i.qty),
    })),
    totalText: money(total),
    createdAt: new Date().toISOString(),
  };

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} :: ${txt}`);
    }

    alert("Pedido recebido! Entraremos em contato.");

    cart = [];
    renderCart();
    cartOpen = false;
    cartPanel.style.display = "none";
  } catch (e) {
    alert("Erro ao enviar pedido");
    console.error(e);
  }
}

/* ======================
   CONFIG GLOBAL
====================== */
let configUnsubs = [];

function applyConfig(data) {
  el("siteTitle").textContent = pick(data, ["siteTitle"], "Loja");
  el("siteSubtitle").textContent = pick(data, ["siteSubtitle"], "—");
  el("globalDesc").textContent = pick(data, ["globalDesc"], "—");

  el("bannerTitle").textContent = pick(data, ["bannerTitle"], "—");
  el("bannerDesc").textContent = pick(data, ["bannerDesc"], "—");

  const bannerUrl = fixAssetPath(pick(data, ["bannerImageUrl"], ""));
  if (bannerUrl) el("bannerImg").src = bannerUrl;

  const whatsRaw = pick(data, ["whatsappLink"], "");
  el("whatsBtn").href = makeWhatsLink(whatsRaw);

  const btnText = pick(data, ["buyBtnText"], "");
  if (btnText) el("whatsBtn").textContent = btnText;

  el("kpiUpdated").textContent = `Atualizado: ${formatDateTime()}`;
}

function watchGlobalConfig() {
  configUnsubs.forEach((fn) => {
    try { fn(); } catch {}
  });
  configUnsubs = [];

  const ref = doc(db, "site", "settings");
  const unsub = onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;
    applyConfig(snap.data());
  });

  configUnsubs.push(unsub);
}

/* ======================
   PRODUTOS + ESTOQUE
====================== */
function renderProducts(items) {
  el("productsGrid").innerHTML = "";

  items.forEach((p) => {
    const card = document.createElement("div");
    card.className = "card";

    const img = fixAssetPath(p.imageUrl || "");
    const stock = p.stock === null || p.stock === undefined ? null : Number(p.stock);
    const hasStock = Number.isFinite(stock);
    const out = hasStock && stock <= 0;

    const promo =
      p.promoPrice !== null &&
      p.promoPrice !== undefined &&
      Number(p.promoPrice) > 0 &&
      Number(p.promoPrice) < Number(p.price || 0);

    const shownPrice = promo ? Number(p.promoPrice) : Number(p.price || 0);

    const stockBadge = hasStock
      ? `<div class="badge">Estoque: ${stock}</div>`
      : `<div class="badge">Estoque: ∞</div>`;

    // ✅ aplica o corte (object-position) vindo do admin
    const px = clampPos(p.imagePosX, 50);
    const py = clampPos(p.imagePosY, 50);

    card.innerHTML = `
      <div class="img">
        <img src="${img}" alt="" style="object-position:${px}% ${py}%;">
      </div>
      <div class="body">
        <h3>${p.name || "Produto"}</h3>
        <p>${p.description || ""}</p>

        <div class="badges">
          ${stockBadge}
          ${p.featured ? `<div class="badge">Destaque</div>` : ``}
        </div>

        <div class="priceRow">
          <div class="price">${money(shownPrice)}</div>
          ${promo ? `<div class="old">${money(p.price)}</div>` : ``}
        </div>
        <div class="pay-hint">Pagamento em cash do jogo!</div>

        <div style="display:flex;gap:6px;align-items:center;margin-top:10px">
          <input type="number" min="1" value="1" class="input qty" style="width:90px" ${out ? "disabled" : ""}>
          <button class="btn addBtn" type="button" ${out ? "disabled" : ""}>
            ${out ? "Sem estoque" : "Adicionar"}
          </button>
        </div>
      </div>
    `;

    const qtyInput = card.querySelector(".qty");
    const addBtn = card.querySelector(".addBtn");

    // limita o input ao estoque
    if (hasStock) {
      qtyInput.max = String(Math.max(1, stock));
      qtyInput.value = String(Math.min(Number(qtyInput.value || 1), stock));
      qtyInput.addEventListener("input", () => {
        const v = Math.max(1, Number(qtyInput.value || 1));
        qtyInput.value = String(Math.min(v, stock));
      });
    }

    addBtn.addEventListener("click", () => {
      const wanted = Math.max(1, Number(qtyInput.value || 1));

      const avail = getAvailableStock(p.id);
      if (avail !== null && wanted > avail) {
        alert(`Só tem ${avail} em estoque.`);
        qtyInput.value = String(avail);
        return;
      }
      if (avail !== null && avail <= 0) {
        alert("Sem estoque.");
        return;
      }

      cart.push({
        productId: p.id,
        name: p.name,
        price: shownPrice,
        qty: wanted,
      });

      renderCart();
    });

    el("productsGrid").appendChild(card);
  });
}

const qProducts = query(collection(db, "products"), orderBy("sortOrder", "asc"));

onSnapshot(qProducts, (snap) => {
  const items = [];
  stockMap.clear();

  snap.forEach((d) => {
    const data = d.data();
    if (!data?.active) return;

    const product = { id: d.id, ...data };
    items.push(product);

    stockMap.set(d.id, data.stock);
  });

  renderProducts(items);

  el("kpiProducts").textContent = `Produtos: ${items.length}`;
  el("kpiUpdated").textContent = `Atualizado: ${formatDateTime()}`;

  if (normalizeCartAgainstStock() && cartOpen) {
    renderCart();
  }
});

/* ======================
   START
====================== */
watchGlobalConfig();

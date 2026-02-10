import { db } from "./firebase.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  onSnapshot as onDocSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ======================
   HELPERS
====================== */
const el = (id) => document.getElementById(id);

const money = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function formatDateTime(d = new Date()) {
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function fixAssetPath(p) {
  if (!p) return "";
  const s = String(p).trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("./")) return s;
  if (s.startsWith("/")) return "." + s;
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
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return fallback;
}

function clampPos(v, fallback = 50) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}
function clampZoom(v, fallback = 100) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(50, Math.min(200, n));
}

/**
 * ✅ Regra de zoom fiel:
 * - zoom < 100: contain + checker + scale(z/100)
 * - zoom >= 100: cover + scale(z/100)
 */
function applyImageView(imgEl, containerEl, { x = 50, y = 50, zoom = 100 } = {}) {
  const z = clampZoom(zoom, 100);
  const fit = z < 100 ? "contain" : "cover";

  if (containerEl) containerEl.classList.toggle("checker", z < 100);
  if (imgEl) {
    imgEl.style.objectFit = fit;
    imgEl.style.objectPosition = `${clampPos(x, 50)}% ${clampPos(y, 50)}%`;
    imgEl.style.transform = `scale(${z / 100})`;
    imgEl.style.transformOrigin = "center center";
  }
}

/* ======================
   ESTADO / CARRINHO
====================== */
let cart = [];
let cartOpen = false;
const stockMap = new Map();
const WORKER_URL = "https://site-encomendas-patos.viniespezio21.workers.dev";

const cartBtn = el("cartOpenBtn");
const cartCount = el("cartCount");

const cartPanel = document.createElement("div");
cartPanel.id = "cartPanel";
cartPanel.style.display = "none";
cartPanel.style.position = "fixed";
cartPanel.style.left = "16px";
cartPanel.style.top = "78px";
cartPanel.style.width = "320px";
cartPanel.style.maxHeight = "calc(100vh - 110px)";
cartPanel.style.overflow = "auto";
cartPanel.style.zIndex = "99999";
cartPanel.style.background = "#141414";
cartPanel.style.border = "1px solid rgba(255,255,255,.08)";
cartPanel.style.borderRadius = "14px";
cartPanel.style.padding = "14px";
cartPanel.style.boxShadow = "0 18px 40px rgba(0,0,0,.55)";

const style = document.createElement("style");
style.textContent = `.pay-hint{margin-top:4px;font-size:12px;opacity:.85;}`;
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
    ${cart.length === 0 ? `<p class="small" style="margin-top:10px">Carrinho vazio</p>` : ""}
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
        </div>`;
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
    <button class="btn" style="width:100%;margin-top:12px" id="sendOrder" type="button">Finalizar pedido</button>
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

async function sendOrder() {
  const nick = el("nickInput").value.trim();
  const discord = el("discordInput").value.trim();
  if (!nick || !discord) return alert("Preencha Nick e Discord");

  for (const item of cart) {
    const avail = getAvailableStock(item.productId);
    if (avail !== null && item.qty > avail)
      return alert(`"${item.name}" tem só ${avail} em estoque.`);
    if (avail !== null && avail <= 0) return alert(`"${item.name}" está sem estoque.`);
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
   CONFIG GLOBAL + BANNER
====================== */
function watchGlobalConfig() {
  const ref = doc(db, "site", "settings");
  onDocSnapshot(ref, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();

    el("siteTitle").textContent = pick(data, ["siteTitle"], "Loja");
    el("siteSubtitle").textContent = pick(data, ["siteSubtitle"], "—");
    el("globalDesc").textContent = pick(data, ["globalDesc"], "—");

    el("bannerTitle").textContent = pick(data, ["bannerTitle"], "—");
    el("bannerDesc").textContent = pick(data, ["bannerDesc"], "—");

    const bannerUrl = fixAssetPath(pick(data, ["bannerImageUrl"], ""));
    if (bannerUrl) el("bannerImg").src = bannerUrl;

    // ✅ aplica corte/zoom do banner no site
    const bannerContainer = el("bannerImg")?.parentElement;
    applyImageView(el("bannerImg"), bannerContainer, {
      x: data.bannerPosX ?? 50,
      y: data.bannerPosY ?? 50,
      zoom: data.bannerZoom ?? 100,
    });

    const whatsRaw = pick(data, ["whatsappLink"], "");
    el("whatsBtn").href = makeWhatsLink(whatsRaw);

    const btnText = pick(data, ["buyBtnText"], "");
    if (btnText) el("whatsBtn").textContent = btnText;

    el("kpiUpdated").textContent = `Atualizado: ${formatDateTime()}`;
  });
}

/* ======================
   PRODUTOS
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

    card.innerHTML = `
      <div class="img"><img src="${img}" alt=""></div>
      <div class="body">
        <h3>${p.name || "Produto"}</h3>
        <p>${p.description || ""}</p>
        <div class="badges">
          ${stockBadge}
          ${p.featured ? `<div class="badge">Destaque</div>` : ``}
        </div>

        <!-- ✅ NOVO LAYOUT DE PREÇO -->
        <div class="priceBlock">
          ${
            promo
              ? `
            <div class="priceLine">
              <div class="priceLabel">Preço atual na trade</div>
              <div class="priceValue trade">${money(p.price)}</div>
            </div>
            <div class="priceLine">
              <div class="priceLabel">Preço casamata</div>
              <div class="priceValue casamata">${money(shownPrice)}</div>
            </div>
          `
              : `
            <div class="priceLine">
              <div class="priceLabel">Preço casamata</div>
              <div class="priceValue casamata">${money(shownPrice)}</div>
            </div>
          `
          }
        </div>

        <div class="pay-hint">Pagamento em cash do jogo!</div>

        <!-- ✅ linha de compra padronizada (alinhamento via CSS) -->
        <div class="buyRow">
          <input type="number" min="1" value="1" class="input qty" ${
            out ? "disabled" : ""
          }>
          <button class="btn addBtn" type="button" ${out ? "disabled" : ""}>
            ${out ? "Sem estoque" : "Adicionar"}
          </button>
        </div>
      </div>
    `;

    const imgContainer = card.querySelector(".img");
    const imgEl = card.querySelector("img");

    applyImageView(imgEl, imgContainer, {
      x: p.imagePosX ?? 50,
      y: p.imagePosY ?? 50,
      zoom: p.imageZoom ?? 100,
    });

    const qtyInput = card.querySelector(".qty");
    const addBtn = card.querySelector(".addBtn");

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
      if (avail !== null && wanted > avail) return alert(`Só tem ${avail} em estoque.`);
      if (avail !== null && avail <= 0) return alert("Sem estoque.");

      cart.push({ productId: p.id, name: p.name, price: shownPrice, qty: wanted });
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

  if (normalizeCartAgainstStock() && cartOpen) renderCart();
});

watchGlobalConfig();

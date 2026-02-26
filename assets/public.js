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

function normalizeStr(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatDateTime(d = new Date()) {
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function pick(obj, keys, fallback = "") {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return fallback;
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
 * Mesma regra do admin:
 * - zoom < 100: contain + checker + scale
 * - zoom >= 100: cover + scale
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

function isPromo(p) {
  return (
    p.promoPrice !== null &&
    p.promoPrice !== undefined &&
    Number(p.promoPrice) > 0 &&
    Number(p.promoPrice) < Number(p.price || 0)
  );
}
function shownPrice(p) {
  return isPromo(p) ? Number(p.promoPrice) : Number(p.price || 0);
}

/* MODAL */
const modalOverlay = document.createElement("div");
modalOverlay.className = "productModalOverlay";
modalOverlay.innerHTML = `
  <div class="productModal" role="dialog" aria-modal="true">
    <button class="productModalClose" type="button" aria-label="Fechar">✕</button>
    <div>
      <img id="modalImg" alt="Produto" />
    </div>
    <div>
      <h3 id="modalTitle"></h3>
      <p id="modalDesc" class="modalDesc"></p>

      <div id="modalBadges" class="badges" style="margin-top:12px;"></div>

      <div id="modalPrices" class="priceBlock" style="margin-top:12px;"></div>

      <div class="productModalActions">
        <input id="modalQty" class="input" type="number" min="1" value="1" style="width:90px;">
        <button id="modalAddBtn" class="btn" type="button" style="flex:1;">Adicionar</button>
      </div>

      <div class="small" style="margin-top:8px; opacity:.9;">Pagamento em cash do jogo!</div>
    </div>
  </div>
`;
document.body.appendChild(modalOverlay);

const closeModalBtn = modalOverlay.querySelector(".productModalClose");
closeModalBtn.addEventListener("click", () => closeModal());
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

let modalProduct = null;

function openModal(p) {
  modalProduct = p;

  el("modalTitle").textContent = p.name || "Produto";
  el("modalDesc").textContent = p.description || "";
  el("modalQty").value = "1";

  const img = fixAssetPath(p.imageUrl || "");
  el("modalImg").src = img;

  // badges
  el("modalBadges").innerHTML = `
    <div class="badge">${p.category || "Outros"}</div>
    ${p.bestSeller ? `<div class="badge best">Mais vendido</div>` : ""}
    ${p.featured ? `<div class="badge">Destaque</div>` : ""}
    <div class="badge">${p.stock === null || p.stock === undefined ? "Estoque: ∞" : `Estoque: ${Number(p.stock)}`}</div>
  `;

  // preços
  const promo = isPromo(p);
  const shown = shownPrice(p);

  el("modalPrices").innerHTML = promo
    ? `
      <div class="priceLine">
        <span class="priceLabel">Preço atual na trade</span>
        <span class="priceValue trade">${money(p.price)}</span>
      </div>
      <div class="priceLine">
        <span class="priceLabel">Preço casamata</span>
        <span class="priceValue casamata">${money(shown)}</span>
      </div>
    `
    : `
      <div class="priceLine">
        <span class="priceLabel">Preço casamata</span>
        <span class="priceValue casamata">${money(shown)}</span>
      </div>
      <div class="priceLine" style="visibility:hidden">
        <span class="priceLabel">—</span>
        <span class="priceValue">—</span>
      </div>
    `;

  // aplica corte/zoom
  const imgEl = el("modalImg");
  const containerEl = imgEl?.parentElement;
  applyImageView(imgEl, containerEl, {
    x: p.imagePosX ?? 50,
    y: p.imagePosY ?? 50,
    zoom: p.imageZoom ?? 100,
  });

  modalOverlay.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modalOverlay.classList.remove("active");
  document.body.style.overflow = "";
  modalProduct = null;
}

el("modalAddBtn").addEventListener("click", () => {
  if (!modalProduct) return;
  const p = modalProduct;
  const qty = Math.max(1, Number(el("modalQty").value || 1));
  addToCart(p, qty);
  showToast("Produto adicionado ao carrinho!");
  closeModal();
});

/* CARRINHO */
let cart = [];
let cartOpen = false;

const stockMap = new Map();
const WORKER_URL = "https://site-encomendas-backend.viniespezio21.workers.dev";

const cartBtn = el("cartOpenBtn");
const cartCount = el("cartCount");

// ✅ Botão flutuante do carrinho (fica visível ao rolar a página)
const floatingCartBtn = document.createElement("button");
floatingCartBtn.type = "button";
floatingCartBtn.className = "floatingCartBtn";
floatingCartBtn.innerHTML = `🛒 <span class="floatingCartCount">0</span>`;
document.body.appendChild(floatingCartBtn);

floatingCartBtn.addEventListener("click", () => (cartOpen ? closeCart() : openCart()));

const cartOverlay = document.createElement("div");
cartOverlay.className = "cartOverlay";
document.body.appendChild(cartOverlay);

const cartPanel = document.createElement("div");
cartPanel.id = "cartPanel";
document.body.appendChild(cartPanel);

function openCart() {
  cartOpen = true;
  cartOverlay.classList.add("active");
  cartPanel.classList.add("active");
  renderCart();
}
function closeCart() {
  cartOpen = false;
  cartOverlay.classList.remove("active");
  cartPanel.classList.remove("active");
}

cartBtn?.addEventListener("click", () => (cartOpen ? closeCart() : openCart()));
cartOverlay.addEventListener("click", closeCart);

function updateCartCount() {
  const n = String(cart.reduce((s, i) => s + i.qty, 0));
  if (cartCount) cartCount.textContent = n;
  const fc = floatingCartBtn?.querySelector?.(".floatingCartCount");
  if (fc) fc.textContent = n;
}

function getAvailableStock(productId) {
  if (!stockMap.has(productId)) return null;
  const v = stockMap.get(productId);
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeCartAgainstStock() {
  cart = cart
    .map((i) => {
      const avail = getAvailableStock(i.productId);
      if (avail === null) return i;
      return { ...i, qty: Math.min(i.qty, avail) };
    })
    .filter((i) => i.qty > 0);
}

function cartTotal() {
  return cart.reduce((sum, i) => sum + i.price * i.qty, 0);
}

function renderCart() {
  normalizeCartAgainstStock();
  updateCartCount();

  cartPanel.innerHTML = `
    <div class="cartHeader">
      <h3 style="margin:0">Carrinho</h3>
      <button id="closeCartBtn" class="btn secondary" type="button">Fechar</button>
    </div>

    <div class="cartItems">
      ${
        cart.length === 0
          ? `<p class="small">Seu carrinho está vazio.</p>`
          : cart
              .map((i, idx) => {
                const avail = getAvailableStock(i.productId);
                const stockLine = avail === null ? "" : `<div class="small">Estoque: ${avail}</div>`;
                return `
                  <div class="cartItem">
                    <strong>${i.name}</strong>
                    ${stockLine}
                    <div class="small">Unitário: ${money(i.price)}</div>

                    <div class="cartQtyRow">
                      <button class="cartQtyBtn" type="button" data-dec="${idx}">−</button>
                      <div class="cartQtyVal">${i.qty}</div>
                      <button class="cartQtyBtn" type="button" data-inc="${idx}">+</button>
                      <button class="btn danger smallBtn" type="button" data-remove="${idx}" style="margin-left:auto;">Remover</button>
                    </div>

                    <div style="font-weight:900;margin-top:10px">${money(i.price * i.qty)}</div>
                    <div class="small" style="margin-top:4px;opacity:.85">Pagamento em cash do jogo!</div>
                  </div>
                `;
              })
              .join("")
      }
    </div>

    <div class="cartTotal">Total: ${money(cartTotal())}</div>

    <div class="cartFooter">
      <label class="small">Nick no jogo</label>
      <input id="nickInput" class="input" placeholder="">
      <label class="small" style="margin-top:10px;display:block">@ do Discord</label>
      <input id="discordInput" class="input" placeholder="">
      <button id="sendOrder" class="btn" style="width:100%;margin-top:12px" type="button">
        Finalizar pedido
      </button>
    </div>
  `;

  el("closeCartBtn")?.addEventListener("click", closeCart);

  cartPanel.querySelectorAll("[data-dec]").forEach((b) =>
    b.addEventListener("click", () => {
      const idx = Number(b.dataset.dec);
      cart[idx].qty = Math.max(1, cart[idx].qty - 1);
      renderCart();
    })
  );

  cartPanel.querySelectorAll("[data-inc]").forEach((b) =>
    b.addEventListener("click", () => {
      const idx = Number(b.dataset.inc);
      const avail = getAvailableStock(cart[idx].productId);
      const next = cart[idx].qty + 1;
      cart[idx].qty = avail === null ? next : Math.min(next, avail);
      renderCart();
    })
  );

  cartPanel.querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", () => {
      const idx = Number(b.dataset.remove);
      cart.splice(idx, 1);
      renderCart();
    })
  );

  el("sendOrder")?.addEventListener("click", sendOrder);
}

function addToCart(p, qty) {
  const avail = getAvailableStock(p.id);
  const price = shownPrice(p);

  const found = cart.find((i) => i.productId === p.id);
  if (found) {
    const next = found.qty + qty;
    found.qty = avail === null ? next : Math.min(next, avail);
  } else {
    cart.push({
      productId: p.id,
      name: p.name,
      qty: avail === null ? qty : Math.min(qty, avail),
      price,
    });
  }

  updateCartCount();
  if (cartOpen) renderCart();
}

async function sendOrder() {
  if (cart.length === 0) return showToast("Carrinho vazio.");

  const nick = (el("nickInput")?.value || "").trim();
  const discord = (el("discordInput")?.value || "").trim();
  if (!nick || !discord) return showToast("Preencha Nick e Discord.");

  const totalNum = cartTotal();
  const createdAt = new Date().toISOString();
  const siteTitle = (el("siteTitle")?.textContent || "").trim();

  const items = cart.map((i) => {
    const qty = Number(i.qty || 0);
    const unit = Number(i.price || 0);
    const sub = qty * unit;
    return {
      productId: i.productId,
      name: i.name,
      qty,
      quantity: qty,
      unit,
      price: unit,
      unitPrice: unit,
      unitText: money(unit),
      unitPriceText: money(unit),
      subtotal: sub,
      lineTotal: sub,
      total: sub,
      subtotalText: money(sub),
      totalText: money(sub),
    };
  });

  const payload = {
    nick,
    discord,
    siteTitle: siteTitle || undefined,
    createdAt,
    items,
    quantity: items.reduce((s, it) => s + Number(it.qty || 0), 0),
    subtotal: totalNum,
    total: totalNum,
    grandTotal: totalNum,
    amount: totalNum,
    totalText: money(totalNum),
  };

  try {
    const res = await fetch(`${WORKER_URL}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error("Falha no envio.");

    showToast("Pedido enviado! ✅");
    cart = [];
    renderCart();
    closeCart();
  } catch (e) {
    console.error(e);
    showToast("Erro ao enviar pedido.");
  }
}


/* TOAST */
const toast = document.createElement("div");
toast.className = "toast";
document.body.appendChild(toast);
let toastTimer = null;

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("active");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("active"), 2400);
}

/* RENDER */
function renderProducts(items) {
  el("productsGrid").innerHTML = "";

  items.forEach((p) => {
    const card = document.createElement("div");
    card.className = "card";

    const img = fixAssetPath(p.imageUrl || "");
    const stock = p.stock === null || p.stock === undefined ? null : Number(p.stock);
    const hasStock = Number.isFinite(stock);
    const out = hasStock && stock <= 0;

    const promo = isPromo(p);
    const shown = shownPrice(p);

    card.innerHTML = `
      <div class="img"><img src="${img}" alt=""></div>
      <div class="body">
        <h3>${p.name || "Produto"}</h3>
        <p>${p.description || ""}</p>

        <div class="badges">
          <div class="badge">${p.category || "Outros"}</div>
          ${p.bestSeller ? `<div class="badge best">Mais vendido</div>` : ""}
          ${p.featured ? `<div class="badge">Destaque</div>` : ""}
          <div class="badge">${hasStock ? `Estoque: ${stock}` : "Estoque: ∞"}</div>
        </div>

        <div class="priceBlock">
          ${
            promo
              ? `
              <div class="priceLine">
                <span class="priceLabel">Preço atual na trade</span>
                <span class="priceValue trade">${money(p.price)}</span>
              </div>
              <div class="priceLine">
                <span class="priceLabel">Preço casamata</span>
                <span class="priceValue casamata">${money(shown)}</span>
              </div>
              `
              : `
              <div class="priceLine">
                <span class="priceLabel">Preço casamata</span>
                <span class="priceValue casamata">${money(shown)}</span>
              </div>
              <div class="priceLine" style="visibility:hidden">
                <span class="priceLabel">—</span>
                <span class="priceValue">—</span>
              </div>
              `
          }
        </div>

        <div class="pay-hint">Pagamento em cash do jogo!</div>

        <div class="buyRow" style="margin-top:10px;">
          <input class="input qty" type="number" min="1" value="1" ${out ? "disabled" : ""}/>
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

    card.querySelector(".img")?.addEventListener("click", () => openModal(p));
    card.querySelector("h3")?.addEventListener("click", () => openModal(p));

    const qtyInput = card.querySelector(".qty");
    const addBtn = card.querySelector(".addBtn");

    addBtn?.addEventListener("click", () => {
      const qty = Math.max(1, Number(qtyInput.value || 1));
      addToCart(p, qty);
      showToast("Adicionado ao carrinho!");
    });

    el("productsGrid").appendChild(card);
  });
}

/* CONFIG GLOBAL + BANNER + ✅ RODAPÉ + ✅ DESTAQUES */
function watchGlobalConfig() {
  const ref = doc(db, "site", "settings");
  onDocSnapshot(ref, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();

    /* 🔥 TOPO DA BARRA PRETA */

el("siteTitle").textContent = pick(
  data,
  ["headerTitle", "siteTitle"],
  "Loja"
);

el("siteSubtitle").textContent = pick(
  data,
  ["headerSubtitle", "siteSubtitle"],
  "—"
);

/* 🔥 BOTÃO DO TOPO */

const headerBtnText = pick(data, ["headerBtnText"], "");
const headerBtnLink = pick(data, ["headerBtnLink"], "");
const headerBtnShow = data.headerBtnShow ?? "true";

if (headerBtnShow === "false") {
  el("whatsBtn").style.display = "none";
} else {
  el("whatsBtn").style.display = "inline-block";
  el("whatsBtn").textContent = headerBtnText || pick(data, ["buyBtnText"], "COMPRAR");
  el("whatsBtn").href = headerBtnLink || makeWhatsLink(pick(data, ["whatsappLink"], ""));
}
    el("globalDesc").textContent = pick(data, ["globalDesc"], "—");

    el("bannerTitle").textContent = pick(data, ["bannerTitle"], "—");
    el("bannerDesc").textContent = pick(data, ["bannerDesc"], "—");

    const bannerUrl = fixAssetPath(pick(data, ["bannerImageUrl"], ""));
    if (bannerUrl) el("bannerImg").src = bannerUrl;

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

    /* ✅ DESTAQUES (3 CARDS) */
    const t1i = pick(data, ["trust1Icon"], "🚀");
    const t1t = pick(data, ["trust1Title"], "Entrega rápida");
    const t1x = pick(data, ["trust1Text"], "Itens entregues no servidor em poucos minutos");

    const t2i = pick(data, ["trust2Icon"], "💰");
    const t2t = pick(data, ["trust2Title"], "Pagamento em cash");
    const t2x = pick(data, ["trust2Text"], "Transação 100% dentro do jogo");

    const t3i = pick(data, ["trust3Icon"], "📦");
    const t3t = pick(data, ["trust3Title"], "Estoque em tempo real");
    const t3x = pick(data, ["trust3Text"], "Atualização automática de disponibilidade");

    if (el("trust1Icon")) el("trust1Icon").textContent = t1i;
    if (el("trust1Title")) el("trust1Title").textContent = t1t;
    if (el("trust1Text")) el("trust1Text").textContent = t1x;

    if (el("trust2Icon")) el("trust2Icon").textContent = t2i;
    if (el("trust2Title")) el("trust2Title").textContent = t2t;
    if (el("trust2Text")) el("trust2Text").textContent = t2x;

    if (el("trust3Icon")) el("trust3Icon").textContent = t3i;
    if (el("trust3Title")) el("trust3Title").textContent = t3t;
    if (el("trust3Text")) el("trust3Text").textContent = t3x;

    // ✅ VISIBILIDADE (CARDS / RODAPÉ)
    const showTrustBlock = data.showTrustBlock ?? true;
    const trustBlockEl = document.querySelector(".trustBlock");
    if (trustBlockEl) trustBlockEl.style.display = showTrustBlock ? "" : "none";

    const showFooter = data.showFooter ?? true;
    const footerEl = document.querySelector(".footer");
    if (footerEl) footerEl.style.display = showFooter ? "" : "none";

    el("kpiUpdated").textContent = `Atualizado: ${formatDateTime()}`;

    /* ✅ RODAPÉ */
    const ft = pick(data, ["footerTitle"], "CASAMATA");
    const ftxt = pick(data, ["footerText"], "");
    const fcopy = pick(data, ["footerCopy"], "");

    const footerTitleEl = document.getElementById("footerTitle");
    const footerTextEl = document.getElementById("footerText");
    const footerCopyEl = document.getElementById("footerCopy");
    const footerLinksEl = document.getElementById("footerLinks");

    if (footerTitleEl) footerTitleEl.textContent = ft;
    if (footerTextEl) footerTextEl.textContent = ftxt;
    if (footerCopyEl) footerCopyEl.textContent = fcopy;

    const raw = (data.footerLinksRaw || "").toString();
    const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);

    if (footerLinksEl) {
      footerLinksEl.innerHTML = lines.map(line => {
        const parts = line.split("|").map(p => p.trim());
        const text = parts[0] || "Link";
        const url = parts[1] || "#";
        return `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
      }).join("");
    }
  });
}

/* FILTROS */
const CATEGORIES = ["Todos", "Armas", "Munição", "Recursos", "Equipamentos", "Outros"];
const catChips = el("catChips");
const searchInput = el("searchInput");
const clearBtn = el("clearFilters");
const filterHint = el("filterHint");

let allProducts = [];
let selectedCategory = "Todos";

function buildCategoryChips() {
  catChips.innerHTML = "";
  for (const c of CATEGORIES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip" + (c === selectedCategory ? " active" : "");
    btn.textContent = c;
    btn.addEventListener("click", () => {
      selectedCategory = c;
      [...catChips.querySelectorAll(".chip")].forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      applyFiltersAndRender();
    });
    catChips.appendChild(btn);
  }
}

function applyFiltersAndRender() {
  const q = normalizeStr(searchInput.value);
  let filtered = allProducts.slice();

  if (selectedCategory !== "Todos") {
    filtered = filtered.filter(
      (p) => (p.category || "Outros").toString().trim() === selectedCategory
    );
  }

  if (q) {
    filtered = filtered.filter((p) => {
      const hay = normalizeStr((p.name || "") + " " + (p.description || ""));
      return hay.includes(q);
    });
  }

  filterHint.textContent = `Mostrando ${filtered.length} de ${allProducts.length} produtos`;
  renderProducts(filtered);
}

searchInput?.addEventListener("input", applyFiltersAndRender);
clearBtn?.addEventListener("click", () => {
  selectedCategory = "Todos";
  searchInput.value = "";
  buildCategoryChips();
  applyFiltersAndRender();
});

/* FIRESTORE: PRODUCTS */
const qy = query(collection(db, "products"), orderBy("sortOrder", "asc"));

onSnapshot(qy, (snap) => {
  const items = [];
  stockMap.clear();

  snap.forEach((d) => {
    const data = d.data();
    if (data.active === false) return;

    const product = { id: d.id, ...data };
    if (!product.category) product.category = "Outros";
    if (product.bestSeller === undefined) product.bestSeller = false;
    items.push(product);
    stockMap.set(d.id, data.stock);
  });

  allProducts = items;
  buildCategoryChips();
  applyFiltersAndRender();

  el("kpiProducts").textContent = `Produtos: ${items.length}`;
  el("kpiUpdated").textContent = `Atualizado: ${formatDateTime()}`;

  if (cartOpen) renderCart();
  updateCartCount();
});

watchGlobalConfig();
updateCartCount();

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
 * zoom < 100: contain + checker + scale
 * zoom >= 100: cover + scale
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

function normalizeStr(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* ======================
   TOAST
====================== */
function showToast(message) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 250);
  }, 1800);
}

/* ======================
   MODAL PRODUTO
====================== */
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

const closeModal = () => (modalOverlay.style.display = "none");
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});
modalOverlay.querySelector(".productModalClose").addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalOverlay.style.display === "flex") closeModal();
});

let modalCurrentProduct = null;

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

function openProductModal(p) {
  modalCurrentProduct = p;

  const img = fixAssetPath(p.imageUrl || "");
  const imgEl = el("modalImg");
  imgEl.src = img;

  applyImageView(imgEl, imgEl.parentElement, {
    x: p.imagePosX ?? 50,
    y: p.imagePosY ?? 50,
    zoom: p.imageZoom ?? 100,
  });

  el("modalTitle").textContent = p.name || "Produto";
  el("modalDesc").textContent = p.description || "";

  const badges = [];
  const stock = p.stock === null || p.stock === undefined ? null : Number(p.stock);
  const hasStock = Number.isFinite(stock);
  badges.push(hasStock ? `Estoque: ${stock}` : "Estoque: ∞");
  badges.push((p.category || "Outros").toString());
  if (p.featured) badges.push("Destaque");
  if (p.bestSeller) badges.push("Mais vendido");

  el("modalBadges").innerHTML = badges
    .map((b) => `<div class="badge ${b === "Mais vendido" ? "best" : ""}">${b}</div>`)
    .join("");

  const promo = isPromo(p);
  const html = promo
    ? `
      <div class="priceLine">
        <div class="priceLabel">Preço atual na trade</div>
        <div class="priceValue trade">${money(p.price)}</div>
      </div>
      <div class="priceLine">
        <div class="priceLabel">Preço casamata</div>
        <div class="priceValue casamata">${money(shownPrice(p))}</div>
      </div>
    `
    : `
      <div class="priceLine">
        <div class="priceLabel">Preço casamata</div>
        <div class="priceValue casamata">${money(shownPrice(p))}</div>
      </div>
    `;
  el("modalPrices").innerHTML = html;

  const qtyEl = el("modalQty");
  qtyEl.value = "1";
  qtyEl.min = "1";
  if (hasStock) qtyEl.max = String(Math.max(1, stock));

  modalOverlay.style.display = "flex";
}

el("modalAddBtn").addEventListener("click", () => {
  const p = modalCurrentProduct;
  if (!p) return;

  const qty = Math.max(1, Number(el("modalQty").value || 1));
  addToCart(p, qty);
  showToast("Produto adicionado ao carrinho!");
  closeModal();
});

/* ======================
   CARRINHO (ESQUERDA)
====================== */
let cart = []; // { productId, name, price, qty }
let cartOpen = false;

const stockMap = new Map();
const WORKER_URL = "https://site-encomendas-patos.viniespezio21.workers.dev";

const cartBtn = el("cartOpenBtn");
const cartCount = el("cartCount");

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
  if (cartCount) cartCount.textContent = String(cart.reduce((s, i) => s + i.qty, 0));
}

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

function addToCart(p, qty) {
  const id = p.id;
  const price = shownPrice(p);
  const avail = getAvailableStock(id);

  if (avail !== null && avail <= 0) {
    alert("Sem estoque.");
    return;
  }
  if (avail !== null && qty > avail) {
    alert(`Só tem ${avail} em estoque.`);
    return;
  }

  const existing = cart.find((x) => x.productId === id && x.price === price);
  if (existing) {
    const next = existing.qty + qty;
    existing.qty = avail === null ? next : Math.min(next, avail);
  } else {
    cart.push({ productId: id, name: p.name, price, qty });
  }

  updateCartCount();
  if (cartOpen) renderCart();
}

function cartTotal() {
  return cart.reduce((s, i) => s + i.qty * i.price, 0);
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
                const stockLine =
                  avail === null ? "" : `<div class="small">Estoque: ${avail}</div>`;

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
      cart.splice(Number(b.dataset.remove), 1);
      renderCart();
    })
  );

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
    if (avail !== null && avail <= 0)
      return alert(`"${item.name}" está sem estoque.`);
  }

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
    totalText: money(cartTotal()),
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
    closeCart();
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
   FILTROS: CATEGORIA + BUSCA
====================== */
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

searchInput.addEventListener("input", applyFiltersAndRender);

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  selectedCategory = "Todos";
  buildCategoryChips();
  applyFiltersAndRender();
});

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

    const promo = isPromo(p);
    const sp = shownPrice(p);

    const badges = [];
    badges.push(hasStock ? `Estoque: ${stock}` : "Estoque: ∞");
    badges.push((p.category || "Outros").toString());
    if (p.featured) badges.push("Destaque");
    if (p.bestSeller) badges.push("Mais vendido");

    card.innerHTML = `
      <div class="img"><img src="${img}" alt=""></div>
      <div class="body">
        <h3>${p.name || "Produto"}</h3>
        <p>${p.description || ""}</p>

        <div class="badges">
          ${badges
            .map((b) => `<div class="badge ${b === "Mais vendido" ? "best" : ""}">${b}</div>`)
            .join("")}
        </div>

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
              <div class="priceValue casamata">${money(sp)}</div>
            </div>
          `
              : `
            <div class="priceLine">
              <div class="priceLabel">Preço casamata</div>
              <div class="priceValue casamata">${money(sp)}</div>
            </div>
          `
          }
        </div>

        <div class="pay-hint">Pagamento em cash do jogo!</div>

        <div class="buyRow">
          <input type="number" min="1" value="1" class="input qty" ${out ? "disabled" : ""}>
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

    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wanted = Math.max(1, Number(qtyInput.value || 1));
      addToCart(p, wanted);
      showToast("Produto adicionado ao carrinho!");
    });

    card.addEventListener("click", (e) => {
      if (e.target.closest(".buyRow")) return;
      openProductModal(p);
    });

    el("productsGrid").appendChild(card);
  });
}

/* ======================
   FIRESTORE LISTENERS
====================== */
const qProducts = query(collection(db, "products"), orderBy("sortOrder", "asc"));
onSnapshot(qProducts, (snap) => {
  const items = [];
  stockMap.clear();

  snap.forEach((d) => {
    const data = d.data();
    if (!data?.active) return;

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

  if (normalizeCartAgainstStock() && cartOpen) renderCart();
  updateCartCount();
});

watchGlobalConfig();
updateCartCount();

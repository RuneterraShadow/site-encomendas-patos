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
   ESTADO / ESTOQUE / CARRINHO
====================== */
let cart = [];
let cartOpen = false;

const stockMap = new Map();
const WORKER_URL = "https://site-encomendas-patos.viniespezio21.workers.dev";

const cartBtn = el("cartOpenBtn");
const cartCount = el("cartCount");

/* ---- overlay + painel (carrinho elegante) ---- */
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

cartBtn?.addEventListener("click", () => {
  if (cartOpen) closeCart();
  else openCart();
});

cartOverlay.addEventListener("click", closeCart);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && cartOpen) closeCart();
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

function updateCartCount() {
  if (cartCount) cartCount.textContent = String(cart.length);
}

/* ======================
   RENDER CARRINHO
====================== */
function renderCart() {
  normalizeCartAgainstStock();
  updateCartCount();

  const total = cart.reduce((s, i) => s + i.qty * i.price, 0);

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
                    <div class="small">Qtd: ${i.qty}</div>
                    <div style="font-weight:800;margin-top:6px">${money(i.price * i.qty)}</div>
                    <div class="small" style="margin-top:4px;opacity:.85">Pagamento em cash do jogo!</div>
                    <div style="margin-top:10px;display:flex;gap:8px">
                      <button class="btn danger smallBtn" type="button" data-remove="${idx}">Remover</button>
                    </div>
                  </div>
                `;
              })
              .join("")
      }
    </div>

    <div class="cartTotal">Total: ${money(total)}</div>

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

  cartPanel.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      cart.splice(Number(btn.dataset.remove), 1);
      renderCart();
    });
  });

  el("sendOrder")?.addEventListener("click", sendOrder);
}

/* ======================
   ENVIAR PEDIDO
====================== */
async function sendOrder() {
  const nick = el("nickInput").value.trim();
  const discord = el("discordInput").value.trim();
  if (!nick || !discord) return alert("Preencha Nick e Discord");

  // valida estoque
  for (const item of cart) {
    const avail = getAvailableStock(item.productId);
    if (avail !== null && item.qty > avail)
      return alert(`"${item.name}" tem só ${avail} em estoque.`);
    if (avail !== null && avail <= 0)
      return alert(`"${item.name}" está sem estoque.`);
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
      updateCartCount();

      // se quiser abrir automaticamente ao adicionar, descomente:
      // openCart();

      if (cartOpen) renderCart();
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
    items.push(product);
    stockMap.set(d.id, data.stock);
  });

  renderProducts(items);
  el("kpiProducts").textContent = `Produtos: ${items.length}`;
  el("kpiUpdated").textContent = `Atualizado: ${formatDateTime()}`;

  if (normalizeCartAgainstStock() && cartOpen) renderCart();
  updateCartCount();
});

watchGlobalConfig();
updateCartCount();

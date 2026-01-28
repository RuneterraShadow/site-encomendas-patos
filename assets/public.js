// assets/public.js
import { db } from "./firebase.js";
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const el = (id) => document.getElementById(id);
const grid = el("productsGrid");

// ======================
// Utils
// ======================
function moneyBRL(value) {
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function setSafeImg(imgEl, url) {
  imgEl.src =
    url ||
    "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600">
          <rect width="100%" height="100%" fill="#111"/>
          <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#777" font-family="Arial" font-size="26">
            Sem imagem
          </text>
        </svg>`
      );
}

function humanDate(ts) {
  try {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("pt-BR");
  } catch {
    return "—";
  }
}

// pega preço final (promo se existir)
function finalPriceNumber(p) {
  const price = Number(p.price || 0);
  const promo = Number(p.promoPrice || 0);
  const isPromo = promo > 0 && promo < price;
  return isPromo ? promo : price;
}
function finalPriceText(p) {
  return moneyBRL(finalPriceNumber(p));
}

// ======================
// Carrinho (localStorage)
// ======================
const CART_KEY = "cart_v1";
function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "{}") || {};
  } catch {
    return {};
  }
}
function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}
let cart = loadCart();

// produtos em memória (para render e enviar)
let productsById = new Map();

// ======================
// UI (Carrinho + Checkout) FIXO no topo esquerdo
// ======================
function injectCartStyles() {
  if (document.getElementById("cartStyles")) return;
  const st = document.createElement("style");
  st.id = "cartStyles";
  st.textContent = `
    #cartBtn{
      position:fixed;
      top:72px;
      left:14px;
      z-index:9999;
      border-radius:12px;
      padding:10px 12px;
      font-weight:800;
    }
    #cartOverlay{
      position:fixed;
      inset:0;
      background:rgba(0,0,0,.55);
      z-index:9998;
      display:none;
    }
    #cartOverlay.open{ display:block; }

    #cartPanel{
      position:fixed;
      top:120px;
      left:14px;
      width:320px;
      max-width:calc(100vw - 28px);
      background:var(--panel);
      border:1px solid #232323;
      border-radius:16px;
      box-shadow:0 18px 50px rgba(0,0,0,.55);
      z-index:9999;
      display:none;
      overflow:hidden;
    }
    #cartPanel.open{ display:block; }

    #cartPanel .cartHeader{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      padding:12px;
      border-bottom:1px solid #232323;
      background:rgba(255,255,255,.02);
    }
    #cartPanel .cartTitle{ font-weight:900; }

    #cartItems{
      padding:12px;
      display:flex;
      flex-direction:column;
      gap:10px;
      max-height:45vh;
      overflow:auto;
    }
    .cartItem{
      border:1px solid #232323;
      background:var(--panel2);
      border-radius:12px;
      padding:10px;
      display:flex;
      flex-direction:column;
      gap:8px;
    }
    .cartItemTop{
      display:flex;
      justify-content:space-between;
      gap:10px;
    }
    .cartName{ font-weight:800; font-size:13px; }
    .cartPrice{ font-weight:800; font-size:13px; color:#fff; opacity:.9; }

    .cartQtyRow{
      display:flex;
      gap:8px;
      align-items:center;
      justify-content:space-between;
    }
    .qtyBtns{
      display:flex;
      gap:6px;
      align-items:center;
    }
    .qtyBtns button{
      border:none;
      background:#2a2a2a;
      color:#fff;
      border-radius:10px;
      padding:6px 10px;
      cursor:pointer;
      font-weight:800;
    }
    .qtyNum{
      min-width:32px;
      text-align:center;
      font-weight:900;
    }
    .removeBtn{
      border:none;
      background:var(--danger);
      color:#111;
      border-radius:10px;
      padding:6px 10px;
      cursor:pointer;
      font-weight:900;
    }

    #cartPanel .cartFooter{
      border-top:1px solid #232323;
      padding:12px;
      display:flex;
      flex-direction:column;
      gap:10px;
      background:rgba(255,255,255,.02);
    }
    .totalRow{
      display:flex;
      justify-content:space-between;
      align-items:center;
      font-weight:900;
    }
    .actionsRow{
      display:flex;
      gap:10px;
    }
    .actionsRow .btn{ flex:1; }

    /* Checkout modal */
    #checkoutModal{
      position:fixed;
      inset:0;
      z-index:10000;
      display:none;
    }
    #checkoutModal.open{ display:block; }
    #checkoutModal .backdrop{
      position:absolute;
      inset:0;
      background:rgba(0,0,0,.65);
    }
    #checkoutModal .box{
      position:absolute;
      left:50%;
      top:50%;
      transform:translate(-50%,-50%);
      width:420px;
      max-width:calc(100vw - 28px);
      background:var(--panel);
      border:1px solid #232323;
      border-radius:16px;
      box-shadow:0 18px 70px rgba(0,0,0,.7);
      padding:14px;
    }
    #checkoutModal .boxHeader{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      margin-bottom:6px;
    }
    #checkoutModal h3{ margin:0; }
    #checkoutModal .hint{ margin:0 0 10px; color:var(--muted); font-size:12px; }
    #checkoutMsg{ min-height:16px; }
  `;
  document.head.appendChild(st);
}

function ensureCartUI() {
  injectCartStyles();

  let overlay = document.getElementById("cartOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "cartOverlay";
    document.body.appendChild(overlay);
  }

  let btn = document.getElementById("cartBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "cartBtn";
    btn.className = "btn secondary";
    btn.type = "button";
    btn.textContent = "Carrinho (0)";
    document.body.appendChild(btn);
  }

  let panel = document.getElementById("cartPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "cartPanel";
    panel.innerHTML = `
      <div class="cartHeader">
        <div class="cartTitle">Carrinho</div>
        <button type="button" class="btn secondary" data-cart-close>Fechar</button>
      </div>
      <div id="cartItems"></div>
      <div class="cartFooter">
        <div class="totalRow">
          <span>Total</span>
          <span id="cartTotal">R$ 0,00</span>
        </div>
        <div class="actionsRow">
          <button type="button" class="btn secondary" data-cart-clear>Limpar</button>
          <button type="button" class="btn" data-cart-checkout>Encomendar</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
  }

  let modal = document.getElementById("checkoutModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "checkoutModal";
    modal.innerHTML = `
      <div class="backdrop" data-checkout-close></div>
      <div class="box">
        <div class="boxHeader">
          <h3>Finalizar pedido</h3>
          <button type="button" class="btn secondary" data-checkout-close>Fechar</button>
        </div>
        <p class="hint">Informe seus dados para enviarmos o pedido.</p>

        <label>Nick no jogo</label>
        <input id="checkoutNick" class="input" placeholder="" autocomplete="off" />

        <div style="height:10px"></div>

        <label>@ do Discord</label>
        <input id="checkoutDiscord" class="input" placeholder="" autocomplete="off" />

        <div style="height:12px"></div>

        <button type="button" class="btn" id="sendOrderBtn">Enviar pedido</button>

        <p id="checkoutMsg" class="small" style="margin:10px 0 0;"></p>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const cartItemsEl = document.getElementById("cartItems");
  const cartTotalEl = document.getElementById("cartTotal");

  function openCart() {
    panel.classList.add("open");
    overlay.classList.add("open");
  }
  function closeCart() {
    panel.classList.remove("open");
    overlay.classList.remove("open");
  }
  function openCheckout() {
    modal.classList.add("open");
  }
  function closeCheckout() {
    modal.classList.remove("open");
    document.getElementById("checkoutMsg").textContent = "";
  }

  btn.addEventListener("click", openCart);
  overlay.addEventListener("click", closeCart);
  panel.querySelector("[data-cart-close]").addEventListener("click", closeCart);

  modal.querySelectorAll("[data-checkout-close]").forEach((x) =>
    x.addEventListener("click", closeCheckout)
  );

  panel.querySelector("[data-cart-clear]").addEventListener("click", () => {
    cart = {};
    saveCart(cart);
    renderCart();
  });

  panel.querySelector("[data-cart-checkout]").addEventListener("click", () => {
    const items = cartToItems();
    if (!items.length) {
      alert("Seu carrinho está vazio.");
      return;
    }
    openCheckout();
  });

  return {
    btn,
    panel,
    overlay,
    modal,
    cartItemsEl,
    cartTotalEl,
    openCart,
    closeCart,
    openCheckout,
    closeCheckout,
  };
}

const UI = ensureCartUI();

// ======================
// Carrinho: helpers
// ======================
function cartCount() {
  return Object.values(cart).reduce((acc, n) => acc + Number(n || 0), 0);
}

function cartToItems() {
  const items = [];
  for (const [id, qty] of Object.entries(cart)) {
    const p = productsById.get(id);
    if (!p) continue;
    const q = Number(qty || 0);
    if (q <= 0) continue;

    items.push({
      id,
      name: p.name || "Produto",
      qty: q,
      price: finalPriceNumber(p),
      priceText: finalPriceText(p),
    });
  }
  return items;
}

function calcTotal(items) {
  return items.reduce((acc, i) => acc + Number(i.price || 0) * Number(i.qty || 0), 0);
}

function setCartQty(id, qty) {
  const q = Math.max(0, Math.floor(Number(qty || 0)));
  if (q <= 0) {
    delete cart[id];
  } else {
    cart[id] = q;
  }
  saveCart(cart);
  renderCart();
}

function renderCart() {
  // contador no botão
  UI.btn.textContent = `Carrinho (${cartCount()})`;

  const items = cartToItems();

  if (!items.length) {
    UI.cartItemsEl.innerHTML = `<p class="small" style="margin:0;">Carrinho vazio.</p>`;
    UI.cartTotalEl.textContent = moneyBRL(0);
    return;
  }

  UI.cartItemsEl.innerHTML = "";
  for (const it of items) {
    const row = document.createElement("div");
    row.className = "cartItem";
    row.innerHTML = `
      <div class="cartItemTop">
        <div class="cartName">${it.name}</div>
        <div class="cartPrice">${it.priceText}</div>
      </div>

      <div class="cartQtyRow">
        <div class="qtyBtns">
          <button type="button" data-dec>-</button>
          <div class="qtyNum">${it.qty}</div>
          <button type="button" data-inc>+</button>
        </div>
        <button type="button" class="removeBtn" data-remover>Remover</button>
      </div>
    `;

    row.querySelector("[data-dec]").addEventListener("click", () => setCartQty(it.id, it.qty - 1));
    row.querySelector("[data-inc]").addEventListener("click", () => setCartQty(it.id, it.qty + 1));
    row.querySelector("[data-remover]").addEventListener("click", () => setCartQty(it.id, 0));

    UI.cartItemsEl.appendChild(row);
  }

  const total = calcTotal(items);
  UI.cartTotalEl.textContent = moneyBRL(total);
}

// ======================
// Render produtos (grid)
// ======================
function renderProducts(items) {
  grid.innerHTML = "";

  for (const p of items) {
    const promo =
      p.promoPrice &&
      Number(p.promoPrice) > 0 &&
      Number(p.promoPrice) < Number(p.price || 0);

    const priceHtml = promo
      ? `<div class="priceRow">
           <div>
             <div class="old">${moneyBRL(p.price)}</div>
             <div class="price">${moneyBRL(p.promoPrice)}</div>
           </div>
           <div class="badge">Promo</div>
         </div>`
      : `<div class="priceRow"><div class="price">${moneyBRL(p.price)}</div></div>`;

    const stock = p.stock ?? null;
    const stockBadge = stock === null ? "" : `<div class="badge">Estoque: ${stock}</div>`;
    const desc = (p.description || "").trim();

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="img"><img alt="${p.name || "Produto"}"></div>
      <div class="body">
        <h3>${p.name || "Produto"}</h3>
        ${desc ? `<p>${desc}</p>` : `<p class="small">Sem descrição</p>`}

        <div class="badges">
          ${stockBadge}
          ${p.featured ? `<div class="badge">Destaque</div>` : ``}
          ${promo ? `<div class="badge">Promo</div>` : ``}
        </div>

        ${priceHtml}

        <div style="display:flex; gap:10px; align-items:center;">
          <input class="input" type="number" min="1" step="1" value="1" style="width:90px;" data-qty />
          <button class="btn" type="button" data-add>Adicionar</button>
        </div>

        <p class="small" data-added style="margin:0; display:none; color:var(--ok);">Adicionado ao carrinho.</p>
      </div>
    `;

    setSafeImg(card.querySelector("img"), p.imageUrl);

    const qtyEl = card.querySelector("[data-qty]");
    const addedEl = card.querySelector("[data-added]");

    card.querySelector("[data-add]").addEventListener("click", () => {
      const q = Math.max(1, Math.floor(Number(qtyEl.value || 1)));
      const current = Number(cart[p.id] || 0);
      setCartQty(p.id, current + q);

      addedEl.style.display = "block";
      setTimeout(() => (addedEl.style.display = "none"), 1200);
    });

    grid.appendChild(card);
  }
}

// ======================
// SETTINGS (site/settings)
// ======================
const settingsRef = doc(db, "site", "settings");
onSnapshot(settingsRef, (snap) => {
  const s = snap.exists() ? snap.data() : {};

  el("siteTitle").textContent = s.siteTitle || "Minha Loja";
  el("siteSubtitle").textContent = s.siteSubtitle || "Atualiza em tempo real";
  document.title = s.siteTitle || "Loja";

  el("bannerTitle").textContent = s.bannerTitle || "Banner";
  el("bannerDesc").textContent = s.bannerDesc || "Edite isso no /admin";
  el("globalDesc").textContent = s.globalDesc || "—";

  // whatsapp botão do topo
  window.__WHATSAPP_LINK = (s.whatsappLink || "").trim();
  window.__BUY_TEXT = s.buyBtnText || "COMPRE AGORA!";
  el("whatsBtn").textContent = window.__BUY_TEXT;
  el("whatsBtn").href = window.__WHATSAPP_LINK || "#";

  setSafeImg(el("bannerImg"), s.bannerImageUrl);

  el("kpiUpdated").textContent = `Atualizado: ${humanDate(s.updatedAt)}`;

  // URL do worker para enviar pedidos
  window.__ORDER_WORKER_URL = (s.orderWebhookUrl || "").trim();
});

// ======================
// PRODUCTS (sem where, filtra no client)
// ======================
const qProducts = query(collection(db, "products"), orderBy("sortOrder", "asc"));

onSnapshot(qProducts, (snap) => {
  const items = [];
  productsById = new Map();

  snap.forEach((d) => {
    const data = d.data();
    const p = { id: d.id, ...data };
    productsById.set(d.id, p);

    if (data.active === true) items.push(p);
  });

  el("kpiProducts").textContent = `Produtos: ${items.length}`;
  renderProducts(items);

  // re-render carrinho pra atualizar nomes/preços caso mudem
  renderCart();
});

// ======================
// Envio do pedido (checkout -> Worker)
// ======================
async function sendOrder() {
  const msgEl = document.getElementById("checkoutMsg");
  const btnEl = document.getElementById("sendOrderBtn");

  const nick = (document.getElementById("checkoutNick").value || "").trim();
  const discord = (document.getElementById("checkoutDiscord").value || "").trim();

  if (!nick || !discord) {
    msgEl.style.color = "var(--danger)";
    msgEl.textContent = "Preencha Nick no jogo e @ do Discord.";
    return;
  }

  const items = cartToItems();
  if (!items.length) {
    msgEl.style.color = "var(--danger)";
    msgEl.textContent = "Seu carrinho está vazio.";
    return;
  }

  const url = (window.__ORDER_WORKER_URL || "").trim();
  if (!url) {
    msgEl.style.color = "var(--danger)";
    msgEl.textContent = "Webhook/Worker não configurado. (orderWebhookUrl no painel)";
    return;
  }

  btnEl.disabled = true;
  msgEl.style.color = "var(--muted)";
  msgEl.textContent = "Enviando pedido...";

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nick, discord, items }),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(t || `HTTP ${resp.status}`);
    }

    // sucesso
    msgEl.style.color = "var(--ok)";
    msgEl.textContent = "✅ Pedido recebido! Entraremos em contato em breve.";

    // limpa carrinho
    cart = {};
    saveCart(cart);
    renderCart();

    // fecha modal depois de um tempo
    setTimeout(() => {
      UI.modal.classList.remove("open");
      msgEl.textContent = "";
      document.getElementById("checkoutNick").value = "";
      document.getElementById("checkoutDiscord").value = "";
    }, 1400);

  } catch (err) {
    msgEl.style.color = "var(--danger)";
    msgEl.textContent = "❌ Não foi possível enviar agora. Tente novamente.";
    console.error(err);
  } finally {
    btnEl.disabled = false;
  }
}

document.getElementById("sendOrderBtn").addEventListener("click", sendOrder);

// render inicial do carrinho (antes do firestore chegar)
renderCart();

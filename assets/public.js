// assets/public.js
import { db } from "./firebase.js";
import {
  doc, onSnapshot, collection, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ TROQUE SE PRECISAR (é a URL do seu Cloudflare Worker)
const WORKER_URL = "https://site-encomendas-patos.viniespezio21.workers.dev";

// helpers
const el = (id) => document.getElementById(id);

function moneyBRL(value){
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
}

function setSafeImg(imgEl, url){
  imgEl.src = url || "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600">
      <rect width="100%" height="100%" fill="#111"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#777" font-family="Arial" font-size="26">
        Sem imagem
      </text>
    </svg>`
  );
}

function humanDate(ts){
  try{
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("pt-BR");
  }catch{
    return "—";
  }
}

function safeTrim(s){ return String(s || "").trim(); }

// state
let PRODUCTS = []; // produtos ativos do Firestore
let CART = loadCart(); // [{id, name, price, promoPrice, qty}]
let SETTINGS = {}; // site/settings

// DOM
const productsGrid = el("productsGrid");

// carrinho
const cartOpenBtn = el("cartOpenBtn");
const cartCloseBtn = el("cartCloseBtn");
const cartDrawer = el("cartDrawer");
const cartItemsEl = el("cartItems");
const cartCountEl = el("cartCount");
const cartTotalEl = el("cartTotal");
const cartClearBtn = el("cartClearBtn");
const cartCheckoutBtn = el("cartCheckoutBtn");

// modal pedido
const orderModal = el("orderModal");
const orderCloseBtn = el("orderCloseBtn");
const orderNick = el("orderNick");
const orderDiscord = el("orderDiscord");
const btnEnviarPedido = el("btnEnviarPedido");
const orderStatus = el("orderStatus");

// ---------- CART persistence ----------
function loadCart(){
  try{
    const raw = localStorage.getItem("cart_v1");
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) return parsed;
    return [];
  }catch{
    return [];
  }
}
function saveCart(){
  try{ localStorage.setItem("cart_v1", JSON.stringify(CART)); }catch{}
}

// ---------- CART utils ----------
function getUnitPrice(p){
  const price = Number(p.price || 0);
  const promo = Number(p.promoPrice || 0);
  if (promo > 0 && promo < price) return promo;
  return price;
}
function cartCount(){
  return CART.reduce((acc, it) => acc + Number(it.qty || 0), 0);
}
function cartTotal(){
  return CART.reduce((acc, it) => acc + (getUnitPrice(it) * Number(it.qty || 0)), 0);
}
function addToCart(product, qty){
  qty = Number(qty || 1);
  if (!Number.isFinite(qty) || qty <= 0) qty = 1;

  const idx = CART.findIndex(x => x.id === product.id);
  if (idx >= 0){
    CART[idx].qty += qty;
  } else {
    CART.push({
      id: product.id,
      name: product.name || "Produto",
      price: Number(product.price || 0),
      promoPrice: Number(product.promoPrice || 0),
      imageUrl: product.imageUrl || "",
      qty
    });
  }
  saveCart();
  renderCart();
}

function updateQty(id, qty){
  qty = Number(qty || 1);
  if (!Number.isFinite(qty) || qty <= 0) qty = 1;

  const idx = CART.findIndex(x => x.id === id);
  if (idx >= 0){
    CART[idx].qty = qty;
    saveCart();
    renderCart();
  }
}

function removeFromCart(id){
  CART = CART.filter(x => x.id !== id);
  saveCart();
  renderCart();
}

function clearCart(){
  CART = [];
  saveCart();
  renderCart();
}

// ---------- UI: cart drawer ----------
function openCart(){
  cartDrawer.classList.remove("hidden");
  cartDrawer.setAttribute("aria-hidden", "false");
}
function closeCart(){
  cartDrawer.classList.add("hidden");
  cartDrawer.setAttribute("aria-hidden", "true");
}

function openOrderModal(){
  orderStatus.textContent = "";
  btnEnviarPedido.disabled = false;
  btnEnviarPedido.textContent = "Enviar pedido";

  // NÃO preencher valores (campos vazios)
  orderNick.value = "";
  orderDiscord.value = "";

  orderModal.classList.remove("hidden");
  orderModal.setAttribute("aria-hidden", "false");
}
function closeOrderModal(){
  orderModal.classList.add("hidden");
  orderModal.setAttribute("aria-hidden", "true");
}

function renderCart(){
  // count + total
  cartCountEl.textContent = String(cartCount());
  cartTotalEl.textContent = moneyBRL(cartTotal());

  // items list
  cartItemsEl.innerHTML = "";
  if (!CART.length){
    cartItemsEl.innerHTML = `<p class="small" style="opacity:.85;margin:6px 0;">Carrinho vazio.</p>`;
    cartCheckoutBtn.disabled = true;
    cartClearBtn.disabled = true;
    return;
  }
  cartCheckoutBtn.disabled = false;
  cartClearBtn.disabled = false;

  for (const it of CART){
    const unit = getUnitPrice(it);
    const row = document.createElement("div");
    row.className = "cartRow";
    row.innerHTML = `
      <div class="cartRowMain">
        <div class="cartRowTitle">${it.name}</div>
        <div class="cartRowPrice">${moneyBRL(unit)}</div>
      </div>

      <div class="cartRowActions">
        <input class="cartQty" type="number" min="1" step="1" value="${it.qty}">
        <button class="btn secondary cartRemove" type="button">Remover</button>
      </div>
    `;

    const qtyInput = row.querySelector(".cartQty");
    qtyInput.addEventListener("change", () => updateQty(it.id, qtyInput.value));

    row.querySelector(".cartRemove").addEventListener("click", () => removeFromCart(it.id));

    cartItemsEl.appendChild(row);
  }
}

// ---------- UI: products ----------
function renderProducts(items){
  productsGrid.innerHTML = "";

  if (!items.length){
    productsGrid.innerHTML = `<p class="small" style="opacity:.85;">Nenhum produto disponível no momento.</p>`;
    return;
  }

  for (const p of items){
    const price = Number(p.price || 0);
    const promo = Number(p.promoPrice || 0);
    const hasPromo = promo > 0 && promo < price;
    const unit = hasPromo ? promo : price;

    const stock = (p.stock ?? null);
    const stockBadge = stock === null ? "" : `<div class="badge">Estoque: ${stock}</div>`;
    const desc = safeTrim(p.description);

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
          ${hasPromo ? `<div class="badge">Promo</div>` : ``}
        </div>

        <div class="priceRow">
          <div>
            ${hasPromo ? `<div class="old">${moneyBRL(price)}</div>` : ``}
            <div class="price">${moneyBRL(unit)}</div>
          </div>
        </div>

        <div class="row" style="gap:10px; margin-top:10px;">
          <input class="qtyInput" type="number" min="1" step="1" value="1" style="max-width:90px;">
          <button class="btn" type="button" data-add>Adicionar</button>
        </div>

        <p class="small" style="margin-top:8px; opacity:.85;" data-added></p>
      </div>
    `;

    setSafeImg(card.querySelector("img"), p.imageUrl);

    const qtyInput = card.querySelector(".qtyInput");
    const addedMsg = card.querySelector("[data-added]");

    card.querySelector("[data-add]").addEventListener("click", () => {
      const qty = Number(qtyInput.value || 1);

      // opcional: respeitar estoque se tiver
      if (stock !== null && Number.isFinite(Number(stock)) && qty > Number(stock)){
        addedMsg.textContent = `Quantidade acima do estoque (${stock}).`;
        return;
      }

      addToCart(p, qty);
      addedMsg.textContent = `Adicionado ao carrinho: ${qty}`;
      setTimeout(() => { addedMsg.textContent = ""; }, 1800);
    });

    productsGrid.appendChild(card);
  }
}

// ---------- ORDER: send to Worker ----------
function buildOrderPayload(){
  // itens do carrinho com preço unitário e subtotal (já bonitinho pro Worker/Discord)
  const items = CART.map(it => {
    const unit = getUnitPrice(it);
    const qty = Number(it.qty || 0);
    return {
      id: it.id,
      name: it.name,
      qty,
      unitPrice: unit,
      unitPriceText: moneyBRL(unit),
      subtotal: unit * qty,
      subtotalText: moneyBRL(unit * qty)
    };
  });

  return {
    nick: safeTrim(orderNick.value),
    discord: safeTrim(orderDiscord.value),
    siteTitle: SETTINGS.siteTitle || "",
    items,
    total: cartTotal(),
    totalText: moneyBRL(cartTotal()),
    createdAt: new Date().toISOString()
  };
}

async function enviarPedidoWorker(payload){
  const res = await fetch(`${WORKER_URL}/order`, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });

  // tenta ler json/text pra debug
  const txt = await res.text().catch(() => "");
  if (!res.ok){
    throw new Error(`Worker respondeu ${res.status}: ${txt}`);
  }
  return txt;
}

// ---------- SETTINGS (site/settings) ----------
const settingsRef = doc(db, "site", "settings");
onSnapshot(settingsRef, (snap) => {
  SETTINGS = snap.exists() ? snap.data() : {};

  el("siteTitle").textContent = SETTINGS.siteTitle || "Minha Loja";
  el("siteSubtitle").textContent = SETTINGS.siteSubtitle || "Atualiza em tempo real";
  document.title = SETTINGS.siteTitle || "Loja";

  el("bannerTitle").textContent = SETTINGS.bannerTitle || "Banner";
  el("bannerDesc").textContent = SETTINGS.bannerDesc || "Edite isso no /admin";
  el("globalDesc").textContent = SETTINGS.globalDesc || "—";

  window.__WHATSAPP_LINK = SETTINGS.whatsappLink || "";
  window.__BUY_TEXT = SETTINGS.buyBtnText || "COMPRE AGORA!";

  el("whatsBtn").textContent = window.__BUY_TEXT;
  el("whatsBtn").href = SETTINGS.whatsappLink || "#";

  setSafeImg(el("bannerImg"), SETTINGS.bannerImageUrl);

  el("kpiUpdated").textContent = `Atualizado: ${humanDate(SETTINGS.updatedAt)}`;
});

// ---------- PRODUCTS (sem where para evitar índice composto) ----------
const qProducts = query(
  collection(db, "products"),
  orderBy("sortOrder", "asc")
);

onSnapshot(qProducts, (snap) => {
  const items = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data && data.active === true){
      items.push({ id: d.id, ...data });
    }
  });

  PRODUCTS = items;
  el("kpiProducts").textContent = `Produtos: ${items.length}`;
  renderProducts(items);
});

// ---------- EVENTS ----------
cartOpenBtn.addEventListener("click", openCart);
cartCloseBtn.addEventListener("click", closeCart);

// fechar clicando fora (drawer)
cartDrawer.addEventListener("click", (e) => {
  if (e.target === cartDrawer) closeCart();
});

cartClearBtn.addEventListener("click", () => {
  if (!CART.length) return;
  if (confirm("Limpar o carrinho?")) clearCart();
});

cartCheckoutBtn.addEventListener("click", () => {
  if (!CART.length){
    alert("Carrinho vazio.");
    return;
  }
  openOrderModal();
});

orderCloseBtn.addEventListener("click", closeOrderModal);
orderModal.addEventListener("click", (e) => {
  if (e.target === orderModal) closeOrderModal();
});

btnEnviarPedido.addEventListener("click", async () => {
  const nick = safeTrim(orderNick.value);
  const discord = safeTrim(orderDiscord.value);

  if (!nick || !discord){
    orderStatus.textContent = "Preencha Nick no jogo e @ do Discord.";
    return;
  }
  if (!CART.length){
    orderStatus.textContent = "Carrinho vazio.";
    return;
  }

  btnEnviarPedido.disabled = true;
  btnEnviarPedido.textContent = "Enviando...";
  orderStatus.textContent = "";

  try{
    const payload = buildOrderPayload();
    await enviarPedidoWorker(payload);

    // sucesso
    clearCart();
    closeOrderModal();
    closeCart();

    // confirmação pro cliente
    alert("✅ Pedido recebido! Entraremos em contato em breve.");
  }catch(err){
    console.error(err);
    orderStatus.textContent = "Não foi possível enviar agora. Tente novamente.";
  }finally{
    btnEnviarPedido.disabled = false;
    btnEnviarPedido.textContent = "Enviar pedido";
  }
});

// init
renderCart();

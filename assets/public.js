import { db } from "./firebase.js";
import { doc, onSnapshot, collection, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ URL do seu Worker
const ORDER_ENDPOINT = "https://site-encomendas-patos.viniespezio21.workers.dev";

const el = (id) => document.getElementById(id);
const grid = el("productsGrid");

const CART_KEY = "cart_v1";

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

// ---------- CART (localStorage) ----------
function loadCart(){
  try{
    const raw = localStorage.getItem(CART_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return (data && typeof data === "object") ? data : {};
  }catch{
    return {};
  }
}

function saveCart(cart){
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartUI();
}

function cartCount(cart){
  return Object.values(cart).reduce((a, it) => a + (Number(it.qty)||0), 0);
}

function addToCart(p, qty){
  const cart = loadCart();
  const id = p.id;
  const current = cart[id]?.qty || 0;

  const promo = p.promoPrice && Number(p.promoPrice) > 0 && Number(p.promoPrice) < Number(p.price || 0);
  const priceText = promo ? moneyBRL(p.promoPrice) : moneyBRL(p.price);

  cart[id] = {
    id,
    name: p.name || "Produto",
    priceText,
    qty: Math.min(999, current + qty),
  };

  saveCart(cart);
}

function setQty(id, qty){
  const cart = loadCart();
  if (!cart[id]) return;
  if (qty <= 0) delete cart[id];
  else cart[id].qty = Math.min(999, qty);
  saveCart(cart);
}

function clearCart(){
  saveCart({});
}

// ---------- CART UI (button + drawer + modal) ----------
function ensureCartUI(){
  // Botão no topo (carrinho)
  const topbar = document.querySelector(".topbar") || document.body;
  if (!document.getElementById("cartBtn")) {
    const btn = document.createElement("button");
    btn.id = "cartBtn";
    btn.className = "btn";
    btn.style.marginLeft = "10px";
    btn.innerHTML = `Carrinho (<span id="cartCount">0</span>)`;
ளம்
    // tenta encaixar ao lado do Admin/Compre Agora (se existir)
    const anchor = document.getElementById("whatsBtn")?.parentElement || topbar;
    anchor.appendChild(btn);

    btn.addEventListener("click", openCartDrawer);
  }

  // Drawer
  if (!document.getElementById("cartDrawer")) {
    const drawer = document.createElement("div");
    drawer.id = "cartDrawer";
    drawer.style.cssText = `
      position: fixed; right: 16px; top: 80px; width: 420px; max-width: calc(100vw - 32px);
      background: #111; border: 1px solid rgba(255,255,255,.08); border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,.6);
      padding: 14px; z-index: 9999; display: none;
    `;
    drawer.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
        <h3 style="margin:0;">Carrinho</h3>
        <button class="btn" id="cartCloseBtn">Fechar</button>
      </div>

      <div id="cartItems" style="margin-top:10px; display:flex; flex-direction:column; gap:10px;"></div>

      <div style="display:flex; gap:10px; margin-top:12px;">
        <button class="btn" id="cartClearBtn" style="opacity:.85;">Limpar</button>
        <button class="btn" id="cartCheckoutBtn" style="flex:1;">Encomendar</button>
      </div>

      <p id="cartMsg" class="small" style="margin:10px 0 0; opacity:.9;"></p>
    `;
    document.body.appendChild(drawer);

    drawer.querySelector("#cartCloseBtn").addEventListener("click", closeCartDrawer);
    drawer.querySelector("#cartClearBtn").addEventListener("click", () => clearCart());
    drawer.querySelector("#cartCheckoutBtn").addEventListener("click", openCheckoutModal);
  }

  // Modal checkout
  if (!document.getElementById("checkoutModal")) {
    const modal = document.createElement("div");
    modal.id = "checkoutModal";
    modal.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,.65); z-index: 10000;
      display: none; align-items: center; justify-content: center; padding: 20px;
    `;
    modal.innerHTML = `
      <div style="width:520px; max-width: 100%; background:#111; border:1px solid rgba(255,255,255,.08);
                  border-radius: 16px; padding: 16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
          <h3 style="margin:0;">Finalizar pedido</h3>
          <button class="btn" id="checkoutClose">Fechar</button>
        </div>

        <p class="small" style="margin:8px 0 14px; opacity:.9;">
          Informe seus dados para enviarmos o pedido.
        </p>

        <label class="small">Nick no jogo</label>
        <input id="nickInput" class="input" style="width:100%; margin:6px 0 12px;" placeholder="Ex: Viniespezio" />

        <label class="small">@ do Discord</label>
        <input id="discordInput" class="input" style="width:100%; margin:6px 0 12px;" placeholder="Ex: @viniespezio" />

        <div style="display:flex; gap:10px; margin-top:10px;">
          <button class="btn" id="checkoutSend" style="flex:1;">Enviar pedido</button>
        </div>

        <p id="checkoutMsg" class="small" style="margin:10px 0 0; opacity:.9;"></p>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector("#checkoutClose").addEventListener("click", closeCheckoutModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeCheckoutModal(); });
    modal.querySelector("#checkoutSend").addEventListener("click", sendCheckout);
  }

  updateCartUI();
}

function openCartDrawer(){
  el("cartDrawer").style.display = "block";
  updateCartUI();
}
function closeCartDrawer(){
  el("cartDrawer").style.display = "none";
}
function openCheckoutModal(){
  const cart = loadCart();
  if (cartCount(cart) === 0) {
    el("cartMsg").textContent = "Seu carrinho está vazio.";
    return;
  }
  el("checkoutMsg").textContent = "";
  el("checkoutModal").style.display = "flex";
}
function closeCheckoutModal(){
  el("checkoutModal").style.display = "none";
}

function updateCartUI(){
  const cart = loadCart();
  const count = cartCount(cart);
  const countEl = document.getElementById("cartCount");
  if (countEl) countEl.textContent = String(count);

  const itemsEl = document.getElementById("cartItems");
  if (!itemsEl) return;

  const entries = Object.values(cart);

  itemsEl.innerHTML = "";
  if (entries.length === 0) {
    itemsEl.innerHTML = `<p class="small" style="opacity:.9;">Carrinho vazio.</p>`;
    return;
  }

  for (const it of entries) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex; gap:10px; align-items:center; border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:10px;";
    row.innerHTML = `
      <div style="flex:1;">
        <div style="font-weight:700;">${it.name}</div>
        <div class="small" style="opacity:.85;">${it.priceText || "—"}</div>
      </div>
      <input class="input" type="number" min="1" max="999" value="${it.qty}" style="width:90px;" data-qty />
      <button class="btn" data-remove style="opacity:.85;">Remover</button>
    `;
    row.querySelector("[data-qty]").addEventListener("change", (e) => {
      const q = Number(e.target.value);
      if (!Number.isFinite(q) || q < 1) setQty(it.id, 0);
      else setQty(it.id, q);
    });
    row.querySelector("[data-remove]").addEventListener("click", () => setQty(it.id, 0));
    itemsEl.appendChild(row);
  }
}

async function sendCheckout(){
  const nick = (document.getElementById("nickInput").value || "").trim();
  const discord = (document.getElementById("discordInput").value || "").trim();
  const msgEl = document.getElementById("checkoutMsg");

  if (!nick || nick.length < 2) {
    msgEl.textContent = "Informe um Nick válido.";
    return;
  }
  if (!discord || discord.length < 2) {
    msgEl.textContent = "Informe seu @ do Discord.";
    return;
  }

  const cart = loadCart();
  const items = Object.values(cart);
  if (items.length === 0) {
    msgEl.textContent = "Seu carrinho está vazio.";
    return;
  }

  msgEl.textContent = "Enviando pedido...";
  const sendBtn = document.getElementById("checkoutSend");
  sendBtn.disabled = true;

  try{
    const r = await fetch(ORDER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nick, discord, items }),
    });

    if (!r.ok) throw new Error("failed");

    msgEl.textContent = "✅ Pedido recebido! Entraremos em contato em breve.";
    clearCart();
    setTimeout(() => {
      closeCheckoutModal();
      closeCartDrawer();
    }, 900);
  }catch{
    msgEl.textContent = "❌ Não foi possível enviar agora. Tente novamente.";
  }finally{
    sendBtn.disabled = false;
  }
}

// ---------- PRODUCTS ----------
function renderProducts(items){
  ensureCartUI();

  grid.innerHTML = "";
  for (const p of items){
    const promo = p.promoPrice && Number(p.promoPrice) > 0 && Number(p.promoPrice) < Number(p.price || 0);

    const priceHtml = promo
      ? `<div class="priceRow">
           <div>
             <div class="old">${moneyBRL(p.price)}</div>
             <div class="price">${moneyBRL(p.promoPrice)}</div>
           </div>
           <div class="badge">Promo</div>
         </div>`
      : `<div class="priceRow"><div class="price">${moneyBRL(p.price)}</div></div>`;

    const stock = (p.stock ?? null);
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
        </div>

        ${priceHtml}

        <div style="display:flex; gap:10px; align-items:center; margin-top:10px;">
          <input class="input" data-qty type="number" min="1" max="999" value="1" style="width:120px;" />
          <button class="btn" data-add>Adicionar</button>
        </div>

        <p class="small" data-status style="margin:8px 0 0; opacity:.9;"></p>
      </div>
    `;

    setSafeImg(card.querySelector("img"), p.imageUrl);

    const qtyEl = card.querySelector("[data-qty]");
    const statusEl = card.querySelector("[data-status]");

    card.querySelector("[data-add]").addEventListener("click", () => {
      const qty = Number(qtyEl.value);

      if (!Number.isFinite(qty) || qty < 1 || qty > 999){
        statusEl.textContent = "Quantidade inválida.";
        return;
      }
      if (typeof p.stock === "number" && qty > p.stock){
        statusEl.textContent = `Quantidade maior que o estoque (${p.stock}).`;
        return;
      }

      addToCart(p, qty);
      statusEl.textContent = `✅ Adicionado ao carrinho: ${qty}`;
    });

    grid.appendChild(card);
  }
}

// ---------- SETTINGS ----------
const settingsRef = doc(db, "site", "settings");
onSnapshot(settingsRef, (snap) => {
  const s = snap.exists() ? snap.data() : {};

  el("siteTitle").textContent = s.siteTitle || "Minha Loja";
  el("siteSubtitle").textContent = s.siteSubtitle || "Atualiza em tempo real";
  document.title = s.siteTitle || "Loja";

  el("bannerTitle").textContent = s.bannerTitle || "Banner";
  el("bannerDesc").textContent = s.bannerDesc || "Edite isso no /admin";
  el("globalDesc").textContent = s.globalDesc || "—";

  window.__BUY_TEXT = s.buyBtnText || "Adicionar";

  el("whatsBtn").href = s.whatsappLink || "#";
  setSafeImg(el("bannerImg"), s.bannerImageUrl);

  el("kpiUpdated").textContent = `Atualizado: ${humanDate(s.updatedAt)}`;

  // garante UI do carrinho mesmo antes de produtos renderizarem
  ensureCartUI();
});

// PRODUCTS (SEM where -> SEM índice composto)
const qProducts = query(collection(db, "products"), orderBy("sortOrder", "asc"));

onSnapshot(qProducts, (snap) => {
  const items = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data.active === true) items.push({ id: d.id, ...data });
  });

  el("kpiProducts").textContent = `Produtos: ${items.length}`;
  renderProducts(items);
});

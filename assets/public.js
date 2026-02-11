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

/* ======================
   CARRINHO
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
        const stockLine = avail === null ? "" : `<span class="small">Estoque: ${avail}</span><br>`;
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
    if (avail !== null && item.qty > avail) return alert(`"${item.name}" tem só ${avail} em estoque.`);
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
   CONFIG GLOBAL + BANNER + TRUST + FOOTER
====================== */
function parseFooterLinks(raw = "") {
  const lines = String(raw || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const links = [];
  for (const line of lines) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length >= 2 && parts[0] && parts[1]) {
      links.push({ text: parts[0], url: parts[1] });
    }
  }
  return links;
}

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

    // ✅ TRUST (3 cards)
    if (el("trust1Icon")) el("trust1Icon").textContent = pick(data, ["trust1Icon"], "🚀");
    if (el("trust1Title")) el("trust1Title").textContent = pick(data, ["trust1Title"], "Entrega rápida");
    if (el("trust1Text")) el("trust1Text").textContent = pick(data, ["trust1Text"], "Itens entregues no servidor em poucos minutos");

    if (el("trust2Icon")) el("trust2Icon").textContent = pick(data, ["trust2Icon"], "💰");
    if (el("trust2Title")) el("trust2Title").textContent = pick(data, ["trust2Title"], "Pagamento em cash");
    if (el("trust2Text")) el("trust2Text").textContent = pick(data, ["trust2Text"], "Transação 100% dentro do jogo");

    if (el("trust3Icon")) el("trust3Icon").textContent = pick(data, ["trust3Icon"], "📦");
    if (el("trust3Title")) el("trust3Title").textContent = pick(data, ["trust3Title"], "Estoque em tempo real");
    if (el("trust3Text")) el("trust3Text").textContent = pick(data, ["trust3Text"], "Atualização automática de disponibilidade");

    // ✅ FOOTER
    if (el("footerTitle")) el("footerTitle").textContent = pick(data, ["footerTitle"], "");
    if (el("footerText")) el("footerText").textContent = pick(data, ["footerText"], "");

    const linksRaw = pick(data, ["footerLinksRaw"], "");
    const links = parseFooterLinks(linksRaw);
    if (el("footerLinks")) {
      el("footerLinks").innerHTML = links
        .map(
          (l) =>
            `<a class="footerLink" href="${l.url}" target="_blank" rel="noopener">${l.text}</a>`
        )
        .join("");
    }

    if (el("footerCopy")) el("footerCopy").textContent = pick(data, ["footerCopy"], "");

    el("kpiUpdated").textContent = `Atualizado: ${formatDateTime()}`;
  });
}

/* ======================
   PRODUTOS
====================== */
function addToCart(p, qty) {
  const avail = getAvailableStock(p.id);
  const q = Math.max(1, Number(qty || 1));

  if (avail !== null && q > avail) {
    alert(`Só tem ${avail} em estoque.`);
    return;
  }

  const promoOk =
    p.promoPrice !== null &&
    p.promoPrice !== undefined &&
    Number(p.promoPrice) > 0 &&
    Number(p.promoPrice) < Number(p.price || 0);

  const priceToUse = promoOk ? Number(p.promoPrice) : Number(p.price || 0);

  const existing = cart.find((i) => i.productId === p.id);
  if (existing) existing.qty += q;
  else cart.push({ productId: p.id, name: p.name, qty: q, price: priceToUse });

  renderCart();
}

function renderProducts(items) {
  const grid = el("productsGrid");
  grid.innerHTML = "";

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
                <span class="priceValue casamata">${money(shownPrice)}</span>
              </div>
              `
              : `
              <div class="priceLine">
                <span class="priceLabel">Preço casamata</span>
                <span class="priceValue casamata">${money(shownPrice)}</span>
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

    const qtyInput = card.querySelector(".qty");
    const addBtn = card.querySelector(".addBtn");
    addBtn?.addEventListener("click", () => addToCart(p, qtyInput.value));

    grid.appendChild(card);
  });

  el("kpiProducts").textContent = `Produtos: ${items.length}`;
}

function watchProducts() {
  const qy = query(collection(db, "products"), orderBy("sortOrder", "asc"));
  onSnapshot(qy, (snap) => {
    const items = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.active === false) return;
      items.push({ id: d.id, ...data });
    });

    // atualiza mapa de estoque
    stockMap.clear();
    items.forEach((p) => stockMap.set(p.id, p.stock ?? null));

    // normaliza carrinho (se estoque baixou)
    normalizeCartAgainstStock();

    renderProducts(items);
  });
}

/* ======================
   START
====================== */
watchGlobalConfig();
watchProducts();
renderCart();

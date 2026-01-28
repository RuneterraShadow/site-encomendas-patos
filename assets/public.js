import { db } from "./firebase.js";
import {
  doc, onSnapshot, collection, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ✅ Endpoint do Cloudflare Worker
const ORDER_ENDPOINT = "https://site-encomendas-patos.viniespezio21.workers.dev";

const el = (id) => document.getElementById(id);
const grid = el("productsGrid");

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

async function sendOrderToDiscord({ productName, qty, priceText }){
  const r = await fetch(ORDER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productName, qty, priceText }),
  });
  if (!r.ok) throw new Error("order_failed");
  return r.json().catch(() => ({}));
}

function renderProducts(items){
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
          <input
            class="input"
            data-qty
            type="number"
            min="1"
            max="999"
            value="1"
            style="width:120px;"
          />
          <button class="btn" data-buy>${(window.__BUY_TEXT || "ENCOMENDAR")}</button>
        </div>

        <p class="small" data-status style="margin:8px 0 0; opacity:.9;"></p>
      </div>
    `;

    setSafeImg(card.querySelector("img"), p.imageUrl);

    const qtyEl = card.querySelector("[data-qty]");
    const statusEl = card.querySelector("[data-status]");
    const btnEl = card.querySelector("[data-buy]");

    btnEl.addEventListener("click", async () => {
      const qty = Number(qtyEl.value);

      if (!Number.isFinite(qty) || qty < 1 || qty > 999){
        statusEl.textContent = "Quantidade inválida.";
        return;
      }

      // opcional: se quiser travar pelo estoque
      if (typeof p.stock === "number" && qty > p.stock){
        statusEl.textContent = `Quantidade maior que o estoque (${p.stock}).`;
        return;
      }

      const priceText = promo ? moneyBRL(p.promoPrice) : moneyBRL(p.price);

      // UI
      btnEl.disabled = true;
      statusEl.textContent = "Enviando pedido...";
      statusEl.style.opacity = "1";

      try{
        await sendOrderToDiscord({
          productName: p.name || "Produto",
          qty,
          priceText
        });

        // ✅ confirmação pro cliente
        statusEl.textContent = "✅ Pedido recebido! Entraremos em contato em breve.";
      }catch{
        statusEl.textContent = "❌ Não foi possível enviar agora. Tente novamente.";
      }finally{
        btnEl.disabled = false;
      }
    });

    grid.appendChild(card);
  }
}

// SETTINGS
const settingsRef = doc(db, "site", "settings");
onSnapshot(settingsRef, (snap) => {
  const s = snap.exists() ? snap.data() : {};

  el("siteTitle").textContent = s.siteTitle || "Minha Loja";
  el("siteSubtitle").textContent = s.siteSubtitle || "Atualiza em tempo real";
  document.title = s.siteTitle || "Loja";

  el("bannerTitle").textContent = s.bannerTitle || "Banner";
  el("bannerDesc").textContent = s.bannerDesc || "Edite isso no /admin";
  el("globalDesc").textContent = s.globalDesc || "—";

  // Mantém caso você ainda use no botão de WhatsApp global
  window.__WHATSAPP_LINK = s.whatsappLink || "";

  // Texto do botão (vai aparecer como ENCOMENDAR)
  window.__BUY_TEXT = s.buyBtnText || "ENCOMENDAR";

  el("whatsBtn").href = s.whatsappLink || "#";

  setSafeImg(el("bannerImg"), s.bannerImageUrl);

  el("kpiUpdated").textContent = `Atualizado: ${humanDate(s.updatedAt)}`;
});

// PRODUCTS (SEM where -> SEM índice composto)
const qProducts = query(
  collection(db, "products"),
  orderBy("sortOrder", "asc")
);

onSnapshot(qProducts, (snap) => {
  const items = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data.active === true) items.push({ id: d.id, ...data });
  });

  el("kpiProducts").textContent = `Produtos: ${items.length}`;
  renderProducts(items);
});

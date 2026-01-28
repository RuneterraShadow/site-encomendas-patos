import { db } from "./firebase.js";
import {
  doc, onSnapshot, collection, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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
        <button class="btn" data-buy>${(window.__BUY_TEXT || "COMPRE AGORA!")}</button>
      </div>
    `;

    setSafeImg(card.querySelector("img"), p.imageUrl);

    card.querySelector("[data-buy]").addEventListener("click", () => {
      const base = (window.__WHATSAPP_LINK || "").trim();
      if (!base){
        alert("WhatsApp não configurado no painel.");
        return;
      }
      const finalPrice = promo ? moneyBRL(p.promoPrice) : moneyBRL(p.price);
      const msg = encodeURIComponent(`Olá! Quero comprar: ${p.name} (${finalPrice})`);
      const link = base.includes("?") ? `${base}&text=${msg}` : `${base}?text=${msg}`;
      window.open(link, "_blank", "noopener");
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

  window.__WHATSAPP_LINK = s.whatsappLink || "";
  window.__BUY_TEXT = s.buyBtnText || "COMPRE AGORA!";

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

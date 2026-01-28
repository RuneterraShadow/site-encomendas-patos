import { db } from "./firebase.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ======================
   HELPERS
====================== */
const el = (id) => document.getElementById(id);
const money = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ======================
   ESTADO DO CARRINHO
====================== */
let cart = [];
let cartOpen = false;
const WORKER_URL = "https://site-encomendas-patos.viniespezio21.workers.dev";

/* ======================
   BOTÃO DO CARRINHO (USA O DO HTML)
====================== */
const cartBtn = el("cartOpenBtn");
const cartCount = el("cartCount");

/* ======================
   PAINEL DO CARRINHO (FIXO NO CANTO ESQUERDO)
====================== */
const cartPanel = document.createElement("div");
cartPanel.id = "cartPanel";
cartPanel.style.display = "none";

// posição/canto esquerdo
cartPanel.style.position = "fixed";
cartPanel.style.left = "16px";
cartPanel.style.top = "78px"; // abaixo da topbar
cartPanel.style.width = "320px";
cartPanel.style.maxHeight = "calc(100vh - 110px)";
cartPanel.style.overflow = "auto";
cartPanel.style.zIndex = "99999";

// visual (pra ficar bonitinho mesmo sem CSS específico)
cartPanel.style.background = "#141414";
cartPanel.style.border = "1px solid rgba(255,255,255,.08)";
cartPanel.style.borderRadius = "14px";
cartPanel.style.padding = "14px";
cartPanel.style.boxShadow = "0 18px 40px rgba(0,0,0,.55)";

document.body.appendChild(cartPanel);

cartBtn.addEventListener("click", () => {
  cartOpen = !cartOpen;
  cartPanel.style.display = cartOpen ? "block" : "none";
  renderCart();
});

/* ======================
   RENDERIZA CARRINHO
====================== */
function renderCart() {
  const total = cart.reduce((s, i) => s + i.qty * i.price, 0);
  cartCount.textContent = cart.length;

  cartPanel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <h3 style="margin:0">Carrinho</h3>
      <button id="closeCart" class="btn secondary" type="button" style="padding:6px 10px">Fechar</button>
    </div>

    ${cart.length === 0 ? `<p class="small" style="margin-top:10px">Carrinho vazio</p>` : ""}

    ${cart
      .map(
        (i, idx) => `
        <div class="hr" style="margin:10px 0"></div>
        <div>
          <strong>${i.name}</strong><br>
          <span class="small">Qtd: ${i.qty}</span><br>
          <strong>${money(i.price * i.qty)}</strong>
          <div style="margin-top:8px">
            <button class="btn danger" data-remove="${idx}" type="button">Remover</button>
          </div>
        </div>
      `
      )
      .join("")}

    <div class="hr" style="margin:12px 0"></div>
    <strong>Total: ${money(total)}</strong>

    <div class="hr" style="margin:12px 0"></div>

    <label class="small">Nick no jogo</label>
    <input id="nickInput" class="input" placeholder="">

    <label class="small" style="margin-top:10px;display:block">@ do Discord</label>
    <input id="discordInput" class="input" placeholder="">

    <button class="btn" style="width:100%;margin-top:12px" id="sendOrder" type="button">
      Finalizar pedido
    </button>
  `;

  // fechar
  el("closeCart")?.addEventListener("click", () => {
    cartOpen = false;
    cartPanel.style.display = "none";
  });

  // remover itens
  cartPanel.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      cart.splice(Number(btn.dataset.remove), 1);
      renderCart();
    });
  });

  // enviar
  el("sendOrder")?.addEventListener("click", sendOrder);
}

/* ======================
   ENVIA PEDIDO
====================== */
async function sendOrder() {
  const nick = el("nickInput").value.trim();
  const discord = el("discordInput").value.trim();

  if (!nick || !discord) {
    alert("Preencha Nick e Discord");
    return;
  }

  const total = cart.reduce((s, i) => s + i.qty * i.price, 0);

  const payload = {
    nick,
    discord,
    items: cart.map((i) => ({
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
    await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    alert("Pedido recebido! Entraremos em contato.");
    cart = [];
    renderCart();
    cartOpen = false;
    cartPanel.style.display = "none";
  } catch {
    alert("Erro ao enviar pedido");
  }
}

/* ======================
   PRODUTOS
====================== */
function renderProducts(items) {
  el("productsGrid").innerHTML = "";

  items.forEach((p) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="img"><img src="${p.imageUrl || ""}" alt=""></div>
      <div class="body">
        <h3>${p.name}</h3>
        <p>${p.description || ""}</p>
        <strong>${money(p.price)}</strong>
        <div style="display:flex;gap:6px;align-items:center;margin-top:10px">
          <input type="number" min="1" value="1" class="input qty" style="width:90px">
          <button class="btn" type="button">Adicionar</button>
        </div>
      </div>
    `;

    card.querySelector(".btn").addEventListener("click", () => {
      const qty = Math.max(1, Number(card.querySelector(".qty").value || 1));
      cart.push({ name: p.name, price: Number(p.price || 0), qty });
      renderCart();
    });

    el("productsGrid").appendChild(card);
  });
}

/* ======================
   FIREBASE
====================== */
const qProducts = query(collection(db, "products"), orderBy("sortOrder", "asc"));

onSnapshot(qProducts, (snap) => {
  const items = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data?.active) items.push(data);
  });
  renderProducts(items);
});

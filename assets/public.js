import { db } from "./firebase.js";
import {
  collection, query, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ======================
   HELPERS
====================== */
const el = (id) => document.getElementById(id);
const money = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

/* ======================
   ESTADO DO CARRINHO
====================== */
let cart = [];
let cartOpen = false;
const WORKER_URL = "https://site-encomendas-patos.viniespezio21.workers.dev";

/* ======================
   CARRINHO (USA HTML EXISTENTE)
====================== */
const cartPanel = document.createElement("div");
cartPanel.id = "cartPanel";
cartPanel.style.display = "none";
document.body.appendChild(cartPanel);

const cartBtn = el("cartOpenBtn");
const cartCount = el("cartCount");

cartBtn.onclick = () => {
  cartOpen = !cartOpen;
  cartPanel.style.display = cartOpen ? "block" : "none";
  renderCart();
};

/* ======================
   RENDERIZA CARRINHO
====================== */
function renderCart() {
  const total = cart.reduce((s, i) => s + i.qty * i.price, 0);
  cartCount.textContent = cart.length;

  cartPanel.innerHTML = `
    <h3>Carrinho</h3>

    ${cart.length === 0 ? `<p class="small">Carrinho vazio</p>` : ""}

    ${cart
      .map(
        (i, idx) => `
      <div class="hr"></div>
      <strong>${i.name}</strong><br>
      Qtd: ${i.qty}<br>
      ${money(i.price * i.qty)}
      <button class="btn danger" data-remove="${idx}" style="margin-top:6px">
        Remover
      </button>
    `
      )
      .join("")}

    <div class="hr"></div>
    <strong>Total: ${money(total)}</strong>

    <div class="hr"></div>

    <label>Nick no jogo</label>
    <input id="nickInput" class="input">

    <label>@ do Discord</label>
    <input id="discordInput" class="input">

    <button class="btn" style="width:100%;margin-top:10px" id="sendOrder">
      Finalizar pedido
    </button>
  `;

  cartPanel.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.onclick = () => {
      cart.splice(btn.dataset.remove, 1);
      renderCart();
    };
  });

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
    totalText: money(cart.reduce((s, i) => s + i.qty * i.price, 0)),
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
    cartPanel.style.display = "none";
    cartOpen = false;
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
      <div class="img"><img src="${p.imageUrl || ""}"></div>
      <div class="body">
        <h3>${p.name}</h3>
        <p>${p.description || ""}</p>
        <strong>${money(p.price)}</strong>
        <div style="display:flex;gap:6px">
          <input type="number" min="1" value="1" class="input qty">
          <button class="btn">Adicionar</button>
        </div>
      </div>
    `;

    card.querySelector(".btn").onclick = () => {
      const qty = Number(card.querySelector(".qty").value);
      cart.push({ name: p.name, price: p.price, qty });
      renderCart();
    };

    el("productsGrid").appendChild(card);
  });
}

/* ======================
   FIREBASE
====================== */
const qProducts = query(
  collection(db, "products"),
  orderBy("sortOrder", "asc")
);

onSnapshot(qProducts, (snap) => {
  const items = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data.active) items.push(data);
  });
  renderProducts(items);
});

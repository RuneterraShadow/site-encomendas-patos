import { db, auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc, onSnapshot, collection, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ======================
   HELPERS
====================== */
const el = (id) => document.getElementById(id);
const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ======================
   ESTADO DO CARRINHO
====================== */
let cart = [];
let cartOpen = false;
const WORKER_URL = "https://site-encomendas-patos.viniespezio21.workers.dev";

/* ======================
   CRIA CARRINHO FLUTUANTE
====================== */
const cartPanel = document.createElement("div");
cartPanel.id = "cartPanel";
cartPanel.style.display = "none";
document.body.appendChild(cartPanel);

function toggleCart() {
  cartOpen = !cartOpen;
  cartPanel.style.display = cartOpen ? "block" : "none";
  renderCart();
}

/* ======================
   BOTÃO NO TOPO
====================== */
const cartBtn = document.createElement("button");
cartBtn.className = "btn secondary";
cartBtn.textContent = "Carrinho (0)";
cartBtn.onclick = toggleCart;

const rowBtns = document.querySelector(".rowBtns");
if (rowBtns) rowBtns.prepend(cartBtn);

/* ======================
   ADMIN (sempre pedir login)
   - Link é 🔒 no index.html com id="adminLink"
   - Sempre pede email/senha ao clicar (força signOut antes)
====================== */
const adminLink = document.getElementById("adminLink");
if (adminLink) {
  adminLink.addEventListener("click", async (e) => {
    e.preventDefault();

    const email = prompt("Email do admin:");
    if (!email) return;

    const password = prompt("Senha do admin:");
    if (!password) return;

    try {
      // força pedir login SEMPRE
      await signOut(auth).catch(() => {});
      await signInWithEmailAndPassword(auth, email.trim(), password);

      const href = adminLink.getAttribute("data-admin-href") || "./admin.html";
      window.location.href = new URL(href, window.location.href).href;
    } catch (err) {
      console.error(err);
      alert("Login inválido.");
    }
  });
}

/* ======================
   RENDERIZA CARRINHO
====================== */
function renderCart() {
  const total = cart.reduce((s, i) => s + i.qty * i.price, 0);
  cartBtn.textContent = `Carrinho (${cart.length})`;

  cartPanel.innerHTML = `
    <h3>Carrinho</h3>

    ${cart.length === 0 ? `<p class="small">Carrinho vazio</p>` : ""}

    ${cart.map((i, idx) => `
      <div class="hr"></div>
      <strong>${i.name}</strong><br>
      Qtd: ${i.qty}<br>
      ${money(i.price * i.qty)}
      <button class="btn danger" data-remove="${idx}" style="margin-top:6px" type="button">Remover</button>
    `).join("")}

    <div class="hr"></div>
    <strong>Total: ${money(total)}</strong>

    <div class="hr"></div>

    <label class="small">Nick no jogo</label>
    <input id="nickInput" class="input" placeholder="">

    <label class="small" style="margin-top:10px;display:block">@ do Discord</label>
    <input id="discordInput" class="input" placeholder="">

    <button class="btn" style="width:100%;margin-top:10px" id="sendOrder" type="button">
      Finalizar pedido
    </button>
  `;

  cartPanel.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.onclick = () => {
      cart.splice(Number(btn.dataset.remove), 1);
      renderCart();
    };
  });

  el("sendOrder")?.addEventListener("click", sendOrder);
}

/* ======================
   ENVIA PEDIDO
====================== */
async function sendOrder() {
  const nick = el("nickInput")?.value?.trim() || "";
  const discord = el("discordInput")?.value?.trim() || "";

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
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} :: ${txt}`);
    }

    alert("Pedido recebido! Entraremos em contato.");
    cart = [];
    renderCart();
    cartOpen = false;
    cartPanel.style.display = "none";
  } catch (e) {
    console.error(e);
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
        <h3>${p.name || "Produto"}</h3>
        <p>${p.description || ""}</p>
        <strong>${money(p.price || 0)}</strong>
        <div style="display:flex;gap:6px;align-items:center;margin-top:10px">
          <input type="number" min="1" value="1" class="input qty" style="width:90px">
          <button class="btn" type="button">Adicionar</button>
        </div>
      </div>
    `;

    card.querySelector(".btn").onclick = () => {
      const qty = Math.max(1, Number(card.querySelector(".qty").value || 1));
      cart.push({ name: p.name, price: Number(p.price || 0), qty });
      renderCart();
    };

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

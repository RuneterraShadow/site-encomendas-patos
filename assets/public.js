import { db } from "./firebase.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ======================
   HELPERS
====================== */
const el = (id) => document.getElementById(id);

const money = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function formatDateTime(d = new Date()) {
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// GitHub Pages: se vier "/assets/..." do admin, converte pra "./assets/..."
function fixAssetPath(p) {
  if (!p) return "";
  const s = String(p).trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("./")) return s;
  if (s.startsWith("/")) return "." + s; // "/assets/..." => "./assets/..."
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
    if (!obj) continue;
    if (k.includes(".")) {
      const parts = k.split(".");
      let cur = obj;
      for (const p of parts) cur = cur?.[p];
      if (cur !== undefined && cur !== null && String(cur).trim() !== "") return cur;
    } else {
      const v = obj?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
  }
  return fallback;
}

/* ======================
   CARRINHO
====================== */
let cart = [];
let cartOpen = false;
const WORKER_URL = "https://site-encomendas-patos.viniespezio21.workers.dev";

const cartBtn = el("cartOpenBtn");
const cartCount = el("cartCount");

const cartPanel = document.createElement("div");
cartPanel.id = "cartPanel";
cartPanel.style.display = "none";

// canto esquerdo fixo
cartPanel.style.position = "fixed";
cartPanel.style.left = "16px";
cartPanel.style.top = "78px";
cartPanel.style.width = "320px";
cartPanel.style.maxHeight = "calc(100vh - 110px)";
cartPanel.style.overflow = "auto";
cartPanel.style.zIndex = "99999";

// visual básico
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
   CONFIG GLOBAL (O PULO DO GATO)
   - escuta vários docs até achar o mesmo do admin
====================== */
let configUnsubs = [];

function applyConfig(data) {
  // títulos
  el("siteTitle").textContent = pick(data, ["siteTitle", "title", "nome", "titulo"], "Loja");
  el("siteSubtitle").textContent = pick(data, ["siteSubtitle", "subtitle", "subtitulo"], "—");

  // descrição global (painel Informações)
  el("globalDesc").textContent = pick(
    data,
    ["globalDesc", "description", "descricaoGlobal", "descricao", "info"],
    "—"
  );

  // banner
  el("bannerTitle").textContent = pick(
    data,
    ["bannerTitle", "banner.title", "bannerTitulo", "banner_titulo"],
    "—"
  );
  el("bannerDesc").textContent = pick(
    data,
    ["bannerDesc", "banner.description", "bannerDescricao", "banner_desc"],
    "—"
  );

  const bannerUrlRaw = pick(
    data,
    ["bannerUrl", "bannerImage", "bannerImg", "banner.url", "bannerURL", "banner_imagem"],
    ""
  );
  const bannerUrl = fixAssetPath(bannerUrlRaw);
  if (bannerUrl) el("bannerImg").src = bannerUrl;

  // Whats + texto do botão
  const whatsRaw = pick(
    data,
    ["whatsLink", "whatsappLink", "whatsapp", "linkWhats", "linkWhatsapp", "telefone"],
    ""
  );
  el("whatsBtn").href = makeWhatsLink(whatsRaw);

  const whatsText = pick(data, ["whatsText", "textoBotao", "buttonText"], "");
  if (whatsText) el("whatsBtn").textContent = whatsText;

  el("kpiUpdated").textContent = `Atualizado: ${formatDateTime()}`;
}

function watchGlobalConfig() {
  // limpa listeners antigos
  configUnsubs.forEach((fn) => {
    try { fn(); } catch {}
  });
  configUnsubs = [];

  // TENTATIVAS (bem amplas)
  // Se o admin estiver salvando em qualquer uma dessas, o site vai refletir.
  const targets = [
    ["site", "main"],
    ["site", "global"],
    ["config", "main"],
    ["config", "global"],
    ["settings", "main"],
    ["settings", "global"],
    ["globals", "main"],
    ["globals", "global"],
    ["public", "main"],
    ["public", "global"],
    ["app", "main"],
    ["app", "global"],
    ["loja", "main"],
    ["loja", "global"],
  ];

  let appliedOnce = false;

  targets.forEach(([col, id]) => {
    const ref = doc(db, col, id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;

        const data = snap.data();

        // aplica sempre (se admin mudar, atualiza em tempo real)
        applyConfig(data);

        if (!appliedOnce) {
          appliedOnce = true;
          console.log("[CONFIG] Usando config de:", `${col}/${id}`, data);
        }
      },
      (err) => {
        // silencioso
      }
    );

    configUnsubs.push(unsub);
  });

  // fallback: se não achar nada, pelo menos não fica travado
  setTimeout(() => {
    if (!appliedOnce) {
      console.warn(
        "[CONFIG] Nenhuma config global encontrada nas rotas padrão. " +
        "Provavelmente o admin salva em outra coleção/doc."
      );
      el("kpiUpdated").textContent = `Atualizado: ${formatDateTime()}`;
    }
  }, 2500);
}

/* ======================
   PRODUTOS
====================== */
function renderProducts(items) {
  el("productsGrid").innerHTML = "";

  items.forEach((p) => {
    const card = document.createElement("div");
    card.className = "card";

    const img = fixAssetPath(p.imageUrl || p.image || p.img || "");

    card.innerHTML = `
      <div class="img"><img src="${img}" alt=""></div>
      <div class="body">
        <h3>${p.name || "Produto"}</h3>
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

const qProducts = query(collection(db, "products"), orderBy("sortOrder", "asc"));

onSnapshot(qProducts, (snap) => {
  const items = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data?.active) items.push(data);
  });

  renderProducts(items);

  el("kpiProducts").textContent = `Produtos: ${items.length}`;
  el("kpiUpdated").textContent = `Atualizado: ${formatDateTime()}`;
});

/* ======================
   START
====================== */
watchGlobalConfig();

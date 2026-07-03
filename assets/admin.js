import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  setDoc,
  doc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  getDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

/* ======================
   HELPERS
====================== */
const el = (id) => document.getElementById(id);

function showMsg(targetId, msg, ok = true) {
  const node = el(targetId);
  if (!node) return;
  node.textContent = msg || "";
  node.style.color = ok ? "#bdbdbd" : "#ff4d4d";
}

function toNum(v, fallback = null) {
  if (v === "" || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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
   AUTH
====================== */
const auth = getAuth();

const loginBox = el("loginBox");
const adminBox = el("adminBox");

function showAdmin(isAuthed) {
  if (loginBox) {
    loginBox.style.display = isAuthed ? "none" : "block";
  }
  if (adminBox) {
    adminBox.style.display = isAuthed ? "block" : "none";
  }
}

el("loginBtn")?.addEventListener("click", async () => {
  const email = el("email").value.trim();
  const pass = el("pass").value;
  if (!email || !pass) return showMsg("loginMsg", "Preencha email e senha.", false);

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    showMsg("loginMsg", "Logado com sucesso ✅", true);
  } catch (e) {
    showMsg("loginMsg", "Falha no login. Confira email/senha.", false);
    console.error(e);
  }
});

el("logoutBtn")?.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  showAdmin(!!user);
  if (user) {
    document.getElementById("ordersPanel").style.display = "block";
    watchOrders();
    loadSettings();
    watchProducts();
  }
});

/* ======================
   SETTINGS (site/settings)
====================== */
const settingsRef = doc(db, "site", "settings");

async function loadSettings() {
  const snap = await getDoc(settingsRef);
  if (!snap.exists()) return;

  const s = snap.data();

  el("siteTitle").value = s.siteTitle || "";
  el("siteSubtitle").value = s.siteSubtitle || "";
  el("globalDesc").value = s.globalDesc || "";
  el("whatsappLink").value = s.whatsappLink || "";
  el("buyBtnText").value = s.buyBtnText || "";

  el("bannerTitle").value = s.bannerTitle || "";
  el("bannerDesc").value = s.bannerDesc || "";
  el("bannerImageUrl").value = s.bannerImageUrl || "";

  const bx = clampPos(s.bannerPosX ?? 50);
  const by = clampPos(s.bannerPosY ?? 50);
  const bz = clampZoom(s.bannerZoom ?? 100);

  el("bImagePosX").value = String(bx);
  el("bImagePosY").value = String(by);
  el("bImageZoom").value = String(bz);

  el("bImagePosXVal").textContent = String(bx);
  el("bImagePosYVal").textContent = String(by);
  el("bImageZoomVal").textContent = String(bz);

  /* ✅ DESTAQUES (3 CARDS) */
  if (el("trust1Icon")) el("trust1Icon").value = s.trust1Icon || "🚀";
  if (el("trust1Title")) el("trust1Title").value = s.trust1Title || "Entrega rápida";
  if (el("trust1Text")) el("trust1Text").value = s.trust1Text || "Itens entregues no servidor em poucos minutos";

  if (el("trust2Icon")) el("trust2Icon").value = s.trust2Icon || "💰";
  if (el("trust2Title")) el("trust2Title").value = s.trust2Title || "Pagamento em cash";
  if (el("trust2Text")) el("trust2Text").value = s.trust2Text || "Transação 100% dentro do jogo";

  if (el("trust3Icon")) el("trust3Icon").value = s.trust3Icon || "📦";
  if (el("trust3Title")) el("trust3Title").value = s.trust3Title || "Estoque em tempo real";
  if (el("trust3Text")) el("trust3Text").value = s.trust3Text || "Atualização automática de disponibilidade";

  // ✅ VISIBILIDADE (CARDS / RODAPÉ)
  if (el("showTrustBlock")) el("showTrustBlock").value = String(s.showTrustBlock ?? true);
  if (el("showFooter")) el("showFooter").value = String(s.showFooter ?? true);

  /* ✅ RODAPÉ (NOVO) */
  if (el("footerTitle")) el("footerTitle").value = s.footerTitle || "";
  if (el("footerText")) el("footerText").value = s.footerText || "";
  if (el("footerLinksRaw")) el("footerLinksRaw").value = s.footerLinksRaw || "";
  if (el("footerCopy")) el("footerCopy").value = s.footerCopy || "";

  updateBannerPreview();
}

function updateBannerPreview() {
  const url = fixAssetPath(el("bannerImageUrl").value);
  const img = el("bImagePreview");
  if (url) img.src = url;

  const x = clampPos(el("bImagePosX").value, 50);
  const y = clampPos(el("bImagePosY").value, 50);
  const z = clampZoom(el("bImageZoom").value, 100);

  el("bImagePosXVal").textContent = String(x);
  el("bImagePosYVal").textContent = String(y);
  el("bImageZoomVal").textContent = String(z);

  applyImageView(img, el("bImagePreviewBox"), { x, y, zoom: z });
}

["bannerImageUrl", "bImagePosX", "bImagePosY", "bImageZoom"].forEach((id) => {
  el(id)?.addEventListener("input", updateBannerPreview);
});

el("resetBannerBtn")?.addEventListener("click", () => {
  el("bImagePosX").value = "50";
  el("bImagePosY").value = "50";
  el("bImageZoom").value = "100";
  updateBannerPreview();
});

el("saveSettingsBtn").addEventListener("click", async () => {
  const payload = {

    /* CONFIGURAÇÕES EXISTENTES */
    siteTitle: el("siteTitle").value.trim(),
    siteSubtitle: el("siteSubtitle").value.trim(),
    globalDesc: el("globalDesc").value.trim(),
    whatsappLink: el("whatsappLink").value.trim(),
    buyBtnText: el("buyBtnText").value.trim(),

    bannerTitle: el("bannerTitle").value.trim(),
    bannerDesc: el("bannerDesc").value.trim(),
    bannerImageUrl: el("bannerImageUrl").value.trim(),

    bannerPosX: clampPos(el("bImagePosX").value, 50),
    bannerPosY: clampPos(el("bImagePosY").value, 50),
    bannerZoom: clampZoom(el("bImageZoom").value, 100),

    showTrustBlock: el("showTrustBlock") ? el("showTrustBlock").value === "true" : true,
    showFooter: el("showFooter") ? el("showFooter").value === "true" : true,
    footerTitle: el("footerTitle") ? el("footerTitle").value.trim() : "",
    footerText: el("footerText") ? el("footerText").value.trim() : "",
    footerLinksRaw: el("footerLinksRaw") ? el("footerLinksRaw").value.trim() : "",
    footerCopy: el("footerCopy") ? el("footerCopy").value.trim() : "",

    /* 🔥 TOPO DO SITE */
    headerTitle: el("headerTitle") ? el("headerTitle").value.trim() : "",
    headerSubtitle: el("headerSubtitle") ? el("headerSubtitle").value.trim() : "",
    headerBtnText: el("headerBtnText") ? el("headerBtnText").value.trim() : "",
    headerBtnLink: el("headerBtnLink") ? el("headerBtnLink").value.trim() : "",
    headerBtnShow: el("headerBtnShow") ? el("headerBtnShow").value : "true"

};

try {
  await setDoc(settingsRef, payload, { merge: true });
  showMsg("settingsMsg", "Configurações salvas ✅", true);
} catch (e) {
  showMsg("settingsMsg", "Erro ao salvar configurações.", false);
  console.error(e);
}

});

/* ======================
   PRODUCT FORM
====================== */
function clearProductForm() {
  el("productId").value = "";
  el("pName").value = "";
  el("pDesc").value = "";
  el("pPrice").value = "";
  el("pPromo").value = "";
  el("pStock").value = "";
  el("pOrder").value = "100";
  el("pCategory").value = "Outros";
  el("pBestSeller").value = "false";
  el("pImageUrl").value = "";

  el("pImagePosX").value = "50";
  el("pImagePosY").value = "50";
  el("pImageZoom").value = "100";

  el("pImagePosXVal").textContent = "50";
  el("pImagePosYVal").textContent = "50";
  el("pImageZoomVal").textContent = "100";

  el("pActive").value = "true";
  el("pFeatured").value = "false";

  el("deleteProductBtn").disabled = true;
  showMsg("productMsg", "");
  updateProductPreview();
}

function updateProductPreview() {
  const url = fixAssetPath(el("pImageUrl").value);
  const img = el("pImagePreview");
  if (url) img.src = url;

  const x = clampPos(el("pImagePosX").value, 50);
  const y = clampPos(el("pImagePosY").value, 50);
  const z = clampZoom(el("pImageZoom").value, 100);

  el("pImagePosXVal").textContent = String(x);
  el("pImagePosYVal").textContent = String(y);
  el("pImageZoomVal").textContent = String(z);

  applyImageView(img, el("pImagePreviewBox"), { x, y, zoom: z });
}

["pImageUrl", "pImagePosX", "pImagePosY", "pImageZoom"].forEach((id) => {
  el(id)?.addEventListener("input", updateProductPreview);
});

el("resetCropBtn")?.addEventListener("click", () => {
  el("pImagePosX").value = "50";
  el("pImagePosY").value = "50";
  el("pImageZoom").value = "100";
  updateProductPreview();
});

el("clearFormBtn")?.addEventListener("click", clearProductForm);

el("saveProductBtn")?.addEventListener("click", async () => {
  const id = el("productId").value.trim();
  const payload = {
    name: el("pName").value.trim(),
    description: el("pDesc").value.trim(),
    price: toNum(el("pPrice").value, 0),
    promoPrice: toNum(el("pPromo").value, null),
    stock: toNum(el("pStock").value, null),
    sortOrder: toNum(el("pOrder").value, 100),
    category: el("pCategory").value,
    bestSeller: el("pBestSeller").value === "true",
    imageUrl: el("pImageUrl").value.trim(),

    imagePosX: clampPos(el("pImagePosX").value, 50),
    imagePosY: clampPos(el("pImagePosY").value, 50),
    imageZoom: clampZoom(el("pImageZoom").value, 100),

    active: el("pActive").value === "true",
    featured: el("pFeatured").value === "true",
  };

  if (!payload.name) return showMsg("productMsg", "Nome é obrigatório.", false);

  try {
    if (id) {
      await updateDoc(doc(db, "products", id), payload);
      showMsg("productMsg", "Produto atualizado ✅", true);
    } else {
      await addDoc(collection(db, "products"), payload);
      showMsg("productMsg", "Produto criado ✅", true);
      clearProductForm();
    }
  } catch (e) {
    showMsg("productMsg", "Erro ao salvar produto.", false);
    console.error(e);
  }
});

el("deleteProductBtn")?.addEventListener("click", async () => {
  const id = el("productId").value.trim();
  if (!id) return;

  if (!confirm("Excluir este produto?")) return;

  try {
    await deleteDoc(doc(db, "products", id));
    showMsg("productMsg", "Produto excluído ✅", true);
    clearProductForm();
  } catch (e) {
    showMsg("productMsg", "Erro ao excluir produto.", false);
    console.error(e);
  }
});

/* ======================
   PRODUCTS LIST (GRID)
====================== */
let stopProducts = null;

function watchProducts() {
  if (stopProducts) return;

  const qy = query(collection(db, "products"), orderBy("sortOrder", "asc"));
  stopProducts = onSnapshot(qy, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    renderAdminProducts(items);
  });

  clearProductForm();
  updateBannerPreview();
}
function renderAdminProducts(items) {
  const grid = el("productsGrid");
  if (!grid) return;

  grid.innerHTML = "";

  items.forEach((p) => {
    const card = document.createElement("div");
    card.className = "card";

    const img = fixAssetPath(p.imageUrl || "");
    const stock =
      p.stock === null || p.stock === undefined ? null : Number(p.stock);
    const hasStock = Number.isFinite(stock);

    const promo =
      p.promoPrice &&
      Number(p.promoPrice) > 0 &&
      Number(p.promoPrice) < Number(p.price);

    card.innerHTML = `
  <div class="img">
    <img src="${img}" alt="">
  </div>

  <div class="body">
    <h3>${p.name || "Produto"}</h3>
  </div>

      <div class="body">
        <h3>${p.name || "Produto"}</h3>
        <p>${p.description || ""}</p>

        <div class="badges">
          <div class="badge">${p.category || "Outros"}</div>
          ${p.bestSeller ? `<div class="badge best">Mais vendido</div>` : ""}
          ${p.featured ? `<div class="badge">Destaque</div>` : ""}
          <div class="badge">
            ${hasStock ? `Estoque: ${stock}` : "Estoque: ∞"}
          </div>
        </div>

        <div class="priceBlock">
          ${
            promo
              ? `
                <div class="priceLine">
                  <span class="priceLabel">Preço atual na trade</span>
                  <span class="priceValue trade">
                    ${Number(p.price || 0).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>

                <div class="priceLine promo">
                  <span class="priceLabel">Preço casamata</span>
                  <span class="priceValue casamata">
                    ${Number(p.promoPrice || 0).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              `
              : `
                <div class="priceLine">
                  <span class="priceLabel">Preço casamata</span>
                  <span class="priceValue casamata">
                    ${Number(p.price || 0).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              `
          }
        </div>

        <div class="buyRow">
          <button class="btn edit-btn">Editar</button>
        </div>
      </div>
    `;

    const imgContainer = card.querySelector(".img");
    const imgEl = card.querySelector("img");

    if (imgEl && imgContainer) {
      applyImageView(imgEl, imgContainer, {
        x: p.imagePosX ?? 50,
        y: p.imagePosY ?? 50,
        zoom: p.imageZoom ?? 100,
      });
    }

    card.querySelector(".edit-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      fillProductForm(p);
    });

    grid.appendChild(card);
  });
}

function fillProductForm(p) {
  el("productId").value = p.id || "";

  el("pName").value = p.name || "";
  el("pDesc").value = p.description || "";
  el("pPrice").value = p.price ?? "";
  el("pPromo").value = p.promoPrice ?? "";
  el("pStock").value = p.stock ?? "";
  el("pOrder").value = p.sortOrder ?? 100;

  el("pCategory").value = p.category || "Outros";
  el("pBestSeller").value = String(!!p.bestSeller);

  el("pImageUrl").value = p.imageUrl || "";

  el("pImagePosX").value = String(clampPos(p.imagePosX ?? 50));
  el("pImagePosY").value = String(clampPos(p.imagePosY ?? 50));
  el("pImageZoom").value = String(clampZoom(p.imageZoom ?? 100));

  el("pActive").value = String(!!p.active);
  el("pFeatured").value = String(!!p.featured);

  el("deleteProductBtn").disabled = false;

  updateProductPreview();
  showMsg("productMsg", "Editando produto. Altere e clique em Salvar.", true);

  // ✅ quando clicar em um produto para editar, sobe a tela até o formulário
  const panel = document.getElementById("productFormPanel") || el("pName")?.closest(".panel");
  if (panel && panel.scrollIntoView) {
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
// ============================
// HISTÓRICO DE PEDIDOS
// ============================

const ORDERS_PER_PAGE = 5;

let pagePending = 1;
let pageCompleted = 1;

function paginate(list, page) {
  const start = (page - 1) * ORDERS_PER_PAGE;
  const end = start + ORDERS_PER_PAGE;
  return list.slice(start, end);
}

function watchOrders() {

  const ordersRef = collection(db, "orders");

  onSnapshot(ordersRef, (snapshot) => {

    const pendingContainer = document.getElementById("ordersPending");
    const completedContainer = document.getElementById("ordersCompleted");

    if (!pendingContainer || !completedContainer) return;

    pendingContainer.innerHTML = "";
    completedContainer.innerHTML = "";

    const orders = [];

    snapshot.forEach((docSnap) => {
      orders.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    const pending = orders.filter(o => o.status === "pendente");
    const completed = orders.filter(o => o.status !== "pendente");

    const startPending = (pagePending - 1) * ORDERS_PER_PAGE;
const pendingPage = pending.slice(startPending, startPending + ORDERS_PER_PAGE);

const startCompleted = (pageCompleted - 1) * ORDERS_PER_PAGE;
const completedPage = completed.slice(startCompleted, startCompleted + ORDERS_PER_PAGE);

    pendingPage.forEach((data) => {

      const id = data.id;

      const div = document.createElement("div");
      div.className = "panel orderCard";
      div.style.marginBottom = "10px";

      div.innerHTML = `
      <strong>${data.nick}</strong><br>
      Discord: ${data.discord}<br>
      Total: ${data.total}<br>
      Status: <b>${data.status}</b><br><br>

      <button class="btn" data-id="${id}">
        Marcar como concluído
      </button>

      <br><br>

      <button class="btn danger smallBtn deleteOrderBtn" data-id="${id}">
        Excluir
      </button>
      `;

      div.querySelector("button").addEventListener("click", async () => {
        await updateDoc(doc(db, "orders", id), {
          status: "concluido"
        });
      });

      pendingContainer.appendChild(div);

    });

    completedPage.forEach((data) => {

      const id = data.id;

      const div = document.createElement("div");
      div.className = "panel orderCard";
      div.style.marginBottom = "10px";

      div.innerHTML = `
      <strong>${data.nick}</strong><br>
      Discord: ${data.discord}<br>
      Total: ${data.total}<br>
      Status: <b>${data.status}</b><br><br>

      <span style="color: #38d478;">✔ Concluído</span>

      <br><br>

      <button class="btn danger smallBtn deleteOrderBtn" data-id="${id}">
        Excluir
      </button>
      `;

      completedContainer.appendChild(div);

    });

    renderPagination(
  pending.length,
  pagePending,
  "paginationPending",
  (p)=> pagePending = p
);

renderPagination(
  completed.length,
  pageCompleted,
  "paginationCompleted",
  (p)=> pageCompleted = p
);
    
  });

}

function renderPagination(total, page, containerId, setPage){

  const totalPages = Math.ceil(total / ORDERS_PER_PAGE);
  const container = document.getElementById(containerId);

  if(!container) return;

  container.innerHTML = "";

  for(let i=1;i<=totalPages;i++){

    const btn = document.createElement("button");
    btn.textContent = i;

    if(i === page) btn.style.background = "#ff7a00";

    btn.onclick = () => {
      setPage(i);
      watchOrders();
    };

    container.appendChild(btn);
  }
}

// Controle das abas de pedidos
document.addEventListener("click", (e) => {
  if (!e.target.classList.contains("tabBtn")) return;

  const tabName = e.target.dataset.tab;

  document.querySelectorAll(".tabBtn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".tabContent").forEach(tab => tab.classList.remove("active"));

  e.target.classList.add("active");
  document.getElementById(tabName).classList.add("active");
});
// ==============================
// EXCLUIR PEDIDO
// ==============================

document.addEventListener("click", async (e) => {
  if (e.target.classList.contains("deleteOrderBtn")) {

    const id = e.target.dataset.id;

    if (!confirm("Tem certeza que deseja excluir este pedido?")) return;

    try {
      await deleteDoc(doc(db, "orders", id));
      alert("Pedido excluído com sucesso!");
    } catch (err) {
      console.error("Erro ao excluir:", err);
      alert("Erro ao excluir pedido.");
    }
  }
});

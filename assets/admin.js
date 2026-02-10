import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ======================
   HELPERS
====================== */
const $ = (id) => document.getElementById(id);

const moneyBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fixAssetPath = (p) => {
  if (!p) return "";
  const s = String(p).trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("./")) return s;
  if (s.startsWith("/")) return "." + s;
  return "./" + s.replace(/^(\.\/)+/, "");
};

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
 * ✅ Regra fiel:
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

function setSafeImg(imgEl, url) {
  const u = fixAssetPath(url);
  if (!u) {
    imgEl?.removeAttribute("src");
    return;
  }
  imgEl.src = u;
}

function setText(id, value) {
  const n = $(id);
  if (n) n.textContent = String(value);
}

function toBoolFromSelect(selId) {
  return $(selId).value === "true";
}

function numOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ======================
   AUTH
====================== */
const loginBox = $("loginBox");
const adminBox = $("adminBox");
const loginMsg = $("loginMsg");

const settingsMsg = $("settingsMsg");
const productMsg = $("productMsg");
const productsGrid = $("productsGrid");

(async () => {
  // sessão: fecha o browser => pede login de novo
  try {
    await setPersistence(auth, browserSessionPersistence);
  } catch (e) {
    console.warn("Persistence error", e);
  }
})();

$("loginBtn")?.addEventListener("click", async (ev) => {
  ev?.preventDefault?.();
  loginMsg.textContent = "";

  const email = $("email").value.trim();
  const pass = $("pass").value;

  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    console.error(e);
    loginMsg.textContent = "Falha no login. Verifique email/senha.";
  }
});

$("logoutBtn")?.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    loginBox.style.display = "block";
    adminBox.style.display = "none";
    return;
  }
  loginBox.style.display = "none";
  adminBox.style.display = "block";

  initSettings();
  initProducts();
});

/* ======================
   SETTINGS (site/settings)
====================== */
let settingsBound = false;

async function initSettings() {
  const ref = doc(db, "site", "settings");

  // Carrega uma vez
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) fillSettingsForm(snap.data());
  } catch (e) {
    console.error(e);
  }

  // Bind só 1 vez
  if (!settingsBound) {
    settingsBound = true;

    $("saveSettingsBtn")?.addEventListener("click", saveSettings);

    // Banner sliders + preview
    ["bImagePosX", "bImagePosY", "bImageZoom", "bannerImageUrl"].forEach((id) => {
      $(id)?.addEventListener("input", updateBannerPreview);
    });

    $("resetBannerBtn")?.addEventListener("click", () => {
      $("bImagePosX").value = 50;
      $("bImagePosY").value = 50;
      $("bImageZoom").value = 100;
      updateBannerPreview();
    });
  }

  updateBannerPreview();
}

function fillSettingsForm(d) {
  $("siteTitle").value = d.siteTitle || "";
  $("siteSubtitle").value = d.siteSubtitle || "";
  $("globalDesc").value = d.globalDesc || "";

  $("whatsappLink").value = d.whatsappLink || "";
  $("buyBtnText").value = d.buyBtnText || "";

  $("bannerTitle").value = d.bannerTitle || "";
  $("bannerDesc").value = d.bannerDesc || "";
  $("bannerImageUrl").value = d.bannerImageUrl || "";

  // Firestore usa bannerPosX/Y/Zoom (o site usa esses campos)
  $("bImagePosX").value = d.bannerPosX ?? 50;
  $("bImagePosY").value = d.bannerPosY ?? 50;
  $("bImageZoom").value = d.bannerZoom ?? 100;

  updateBannerPreview();
}

function readSettingsForm() {
  return {
    siteTitle: $("siteTitle").value.trim(),
    siteSubtitle: $("siteSubtitle").value.trim(),
    globalDesc: $("globalDesc").value.trim(),

    whatsappLink: $("whatsappLink").value.trim(),
    buyBtnText: $("buyBtnText").value.trim(),

    bannerTitle: $("bannerTitle").value.trim(),
    bannerDesc: $("bannerDesc").value.trim(),
    bannerImageUrl: $("bannerImageUrl").value.trim(),

    // ✅ salva nos campos que o public.js lê
    bannerPosX: Number($("bImagePosX").value),
    bannerPosY: Number($("bImagePosY").value),
    bannerZoom: Number($("bImageZoom").value),
  };
}

async function saveSettings() {
  settingsMsg.textContent = "";
  const ref = doc(db, "site", "settings");
  const data = readSettingsForm();

  try {
    await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
    settingsMsg.textContent = "Configurações salvas.";
  } catch (e) {
    console.error(e);
    settingsMsg.textContent = "Erro ao salvar configurações.";
  }
}

function updateBannerPreview() {
  setText("bImagePosXVal", $("bImagePosX")?.value ?? 50);
  setText("bImagePosYVal", $("bImagePosY")?.value ?? 50);
  setText("bImageZoomVal", $("bImageZoom")?.value ?? 100);

  const img = $("bImagePreview");
  const box = $("bImagePreviewBox");
  if (!img || !box) return;

  setSafeImg(img, $("bannerImageUrl").value);
  applyImageView(img, box, {
    x: $("bImagePosX").value,
    y: $("bImagePosY").value,
    zoom: $("bImageZoom").value,
  });
}

/* ======================
   PRODUCTS
====================== */
let productsBound = false;

function initProducts() {
  // listeners/binds 1 vez
  if (!productsBound) {
    productsBound = true;

    $("saveProductBtn")?.addEventListener("click", saveProduct);
    $("clearFormBtn")?.addEventListener("click", (ev) => {
      ev?.preventDefault?.();
      clearProductForm();
    });
    $("deleteProductBtn")?.addEventListener("click", deleteProduct);

    ["pImagePosX", "pImagePosY", "pImageZoom", "pImageUrl"].forEach((id) => {
      $(id)?.addEventListener("input", updateProductPreview);
    });

    $("resetCropBtn")?.addEventListener("click", (ev) => {
      ev?.preventDefault?.();
      $("pImagePosX").value = 50;
      $("pImagePosY").value = 50;
      $("pImageZoom").value = 100;
      updateProductPreview();
    });
  }

  updateProductPreview();

  // realtime listagem
  const qProducts = query(collection(db, "products"), orderBy("sortOrder", "asc"));
  onSnapshot(qProducts, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    renderProductsGrid(items);
  });
}

function updateProductPreview() {
  setText("pImagePosXVal", $("pImagePosX")?.value ?? 50);
  setText("pImagePosYVal", $("pImagePosY")?.value ?? 50);
  setText("pImageZoomVal", $("pImageZoom")?.value ?? 100);

  const img = $("pImagePreview");
  const box = $("pImagePreviewBox");
  if (!img || !box) return;

  setSafeImg(img, $("pImageUrl").value);
  applyImageView(img, box, {
    x: $("pImagePosX").value,
    y: $("pImagePosY").value,
    zoom: $("pImageZoom").value,
  });
}

function clearProductForm() {
  $("productId").value = "";

  $("pName").value = "";
  $("pDesc").value = "";
  $("pPrice").value = "";
  $("pPromo").value = "";
  $("pStock").value = "";
  $("pOrder").value = 100;

  $("pImageUrl").value = "";
  $("pImagePosX").value = 50;
  $("pImagePosY").value = 50;
  $("pImageZoom").value = 100;

  $("pActive").value = "true";
  $("pFeatured").value = "false";

  $("deleteProductBtn").disabled = true;
  productMsg.textContent = "";

  updateProductPreview();
}

function openEdit(p) {
  $("productId").value = p.id;

  $("pName").value = p.name || "";
  $("pDesc").value = p.description || "";
  $("pPrice").value = p.price ?? "";
  $("pPromo").value = p.promoPrice ?? "";
  $("pStock").value = p.stock ?? "";
  $("pOrder").value = p.sortOrder ?? 100;

  $("pImageUrl").value = p.imageUrl || "";
  $("pImagePosX").value = p.imagePosX ?? 50;
  $("pImagePosY").value = p.imagePosY ?? 50;
  $("pImageZoom").value = p.imageZoom ?? 100;

  $("pActive").value = String(!!p.active);
  $("pFeatured").value = String(!!p.featured);

  $("deleteProductBtn").disabled = false;
  productMsg.textContent = "";

  updateProductPreview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function readProductForm() {
  const price = Number($("pPrice").value || 0);
  const promoPrice = numOrNull($("pPromo").value);
  const stock = numOrNull($("pStock").value);

  return {
    name: $("pName").value.trim(),
    description: $("pDesc").value.trim(),
    price: Number.isFinite(price) ? price : 0,
    promoPrice: promoPrice,
    stock: stock,

    sortOrder: Number($("pOrder").value || 100),

    imageUrl: $("pImageUrl").value.trim(),
    imagePosX: Number($("pImagePosX").value),
    imagePosY: Number($("pImagePosY").value),
    imageZoom: Number($("pImageZoom").value),

    active: toBoolFromSelect("pActive"),
    featured: toBoolFromSelect("pFeatured"),
  };
}

async function saveProduct(ev) {
  ev?.preventDefault?.();
  productMsg.textContent = "";

  const data = {
    ...readProductForm(),
    updatedAt: serverTimestamp(),
  };

  const id = $("productId").value.trim();

  try {
    if (!id) {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "products"), data);
      productMsg.textContent = "Produto criado.";
      clearProductForm();
    } else {
      await updateDoc(doc(db, "products", id), data);
      productMsg.textContent = "Produto atualizado.";
    }
  } catch (e) {
    console.error(e);
    productMsg.textContent = "Erro ao salvar produto.";
  }
}

async function deleteProduct(ev) {
  ev?.preventDefault?.();

  const id = $("productId").value.trim();
  if (!id) return;

  if (!confirm("Excluir este produto?")) return;

  productMsg.textContent = "";
  try {
    await deleteDoc(doc(db, "products", id));
    productMsg.textContent = "Produto excluído.";
    clearProductForm();
  } catch (e) {
    console.error(e);
    productMsg.textContent = "Erro ao excluir produto.";
  }
}

function renderProductsGrid(items) {
  productsGrid.innerHTML = "";

  items.forEach((p) => {
    const promo =
      p.promoPrice !== null &&
      p.promoPrice !== undefined &&
      Number(p.promoPrice) > 0 &&
      Number(p.promoPrice) < Number(p.price || 0);

    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <div class="img"><img alt=""></div>
      <div class="body">
        <h3>${p.name || "Produto"}</h3>
        <p>${(p.description || "").slice(0, 120) || "—"}</p>

        <div class="badges">
          <div class="badge">${p.active ? "Ativo" : "Inativo"}</div>
          ${p.featured ? `<div class="badge">Destaque</div>` : ``}
          ${(p.stock === null || p.stock === undefined) ? `` : `<div class="badge">Estoque: ${p.stock}</div>`}
        </div>

        <!-- ✅ Layout novo de preço -->
        <div class="priceBlock">
          ${promo ? `
            <div class="priceLine">
              <div class="priceLabel">Preço atual na trade</div>
              <div class="priceValue trade">${moneyBRL(p.price)}</div>
            </div>
            <div class="priceLine">
              <div class="priceLabel">Preço casamata</div>
              <div class="priceValue casamata">${moneyBRL(p.promoPrice)}</div>
            </div>
          ` : `
            <div class="priceLine">
              <div class="priceLabel">Preço casamata</div>
              <div class="priceValue casamata">${moneyBRL(p.price)}</div>
            </div>
          `}
        </div>

        <button class="btn secondary" type="button" data-edit>Editar</button>
      </div>
    `;

    const imgContainer = card.querySelector(".img");
    const imgEl = card.querySelector("img");

    setSafeImg(imgEl, p.imageUrl);

    applyImageView(imgEl, imgContainer, {
      x: p.imagePosX ?? 50,
      y: p.imagePosY ?? 50,
      zoom: p.imageZoom ?? 100,
    });

    card.querySelector("[data-edit]")?.addEventListener("click", () => openEdit(p));
    productsGrid.appendChild(card);
  });
}

// Inicializa form zerado quando abrir admin
clearProductForm();

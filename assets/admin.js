import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  doc, getDoc, setDoc, serverTimestamp,
  collection, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const loginBox = $("loginBox");
const adminBox = $("adminBox");
const loginMsg = $("loginMsg");
const settingsMsg = $("settingsMsg");
const productMsg = $("productMsg");
const productsGrid = $("productsGrid");

// ✅ Pede senha de novo SOMENTE depois que fechar o navegador
(async () => {
  try {
    await setPersistence(auth, browserSessionPersistence);
  } catch (e) {
    console.warn("Persistence error", e);
  }
})();

/* ======================
   HELPERS
====================== */
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
 * ✅ Mesma regra do site:
 * - zoom < 100: contain + checker + scale(z/100)
 * - zoom >= 100: cover + scale(z/100)
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
  if (!u) return;
  imgEl.src = u;
}

/* ======================
   AUTH UI
====================== */
$("loginBtn")?.addEventListener("click", async () => {
  loginMsg.textContent = "";
  const email = $("email").value.trim();
  const pass = $("password").value;

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
async function initSettings() {
  const ref = doc(db, "site", "settings");
  const snap = await getDoc(ref);
  if (snap.exists()) fillSettingsForm(snap.data());

  $("saveSettingsBtn")?.addEventListener("click", async () => {
    settingsMsg.textContent = "";
    const data = readSettingsForm();
    try {
      await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
      settingsMsg.textContent = "Configurações salvas.";
    } catch (e) {
      console.error(e);
      settingsMsg.textContent = "Erro ao salvar configurações.";
    }
  });

  // Preview banner com zoom/pos
  const bannerPreview = $("bannerPreviewImg");
  const bannerPreviewBox = bannerPreview?.closest(".imgPreviewBox");
  const updateBannerPreview = () => {
    if (!bannerPreview) return;
    setSafeImg(bannerPreview, $("bannerImageUrl").value);
    applyImageView(bannerPreview, bannerPreviewBox, {
      x: $("bannerPosX").value,
      y: $("bannerPosY").value,
      zoom: $("bannerZoom").value
    });
  };

  ["bannerImageUrl", "bannerPosX", "bannerPosY", "bannerZoom"].forEach((id) => {
    $(id)?.addEventListener("input", updateBannerPreview);
  });

  $("bannerResetBtn")?.addEventListener("click", () => {
    $("bannerPosX").value = 50;
    $("bannerPosY").value = 50;
    $("bannerZoom").value = 100;
    updateBannerPreview();
  });

  updateBannerPreview();
}

function fillSettingsForm(d) {
  $("siteTitle").value = d.siteTitle || "";
  $("siteSubtitle").value = d.siteSubtitle || "";
  $("globalDesc").value = d.globalDesc || "";

  $("bannerTitle").value = d.bannerTitle || "";
  $("bannerDesc").value = d.bannerDesc || "";
  $("bannerImageUrl").value = d.bannerImageUrl || "";

  $("whatsappLink").value = d.whatsappLink || "";
  $("buyBtnText").value = d.buyBtnText || "";

  $("bannerPosX").value = d.bannerPosX ?? 50;
  $("bannerPosY").value = d.bannerPosY ?? 50;
  $("bannerZoom").value = d.bannerZoom ?? 100;

  // Preview banner
  const bannerPreview = $("bannerPreviewImg");
  const bannerPreviewBox = bannerPreview?.closest(".imgPreviewBox");
  if (bannerPreview) {
    setSafeImg(bannerPreview, d.bannerImageUrl || "");
    applyImageView(bannerPreview, bannerPreviewBox, {
      x: d.bannerPosX ?? 50,
      y: d.bannerPosY ?? 50,
      zoom: d.bannerZoom ?? 100
    });
  }
}

function readSettingsForm() {
  return {
    siteTitle: $("siteTitle").value.trim(),
    siteSubtitle: $("siteSubtitle").value.trim(),
    globalDesc: $("globalDesc").value.trim(),

    bannerTitle: $("bannerTitle").value.trim(),
    bannerDesc: $("bannerDesc").value.trim(),
    bannerImageUrl: $("bannerImageUrl").value.trim(),

    whatsappLink: $("whatsappLink").value.trim(),
    buyBtnText: $("buyBtnText").value.trim(),

    bannerPosX: Number($("bannerPosX").value),
    bannerPosY: Number($("bannerPosY").value),
    bannerZoom: Number($("bannerZoom").value),
  };
}

/* ======================
   PRODUCTS
====================== */
let editingId = null;

function initProducts() {
  const qProducts = query(collection(db, "products"), orderBy("sortOrder", "asc"));
  onSnapshot(qProducts, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    renderProductsGrid(items);
  });

  $("newProductBtn")?.addEventListener("click", () => {
    editingId = null;
    productMsg.textContent = "";
    clearProductForm();
    $("productModal").style.display = "block";
  });

  $("closeModalBtn")?.addEventListener("click", () => {
    $("productModal").style.display = "none";
  });

  $("saveProductBtn")?.addEventListener("click", saveProduct);
  $("deleteProductBtn")?.addEventListener("click", deleteProduct);

  // Preview produto com zoom/pos
  const previewImg = $("previewImg");
  const previewBox = previewImg?.closest(".imgPreviewBox");
  const updatePreview = () => {
    if (!previewImg) return;
    setSafeImg(previewImg, $("imageUrl").value);
    applyImageView(previewImg, previewBox, {
      x: $("imagePosX").value,
      y: $("imagePosY").value,
      zoom: $("imageZoom").value
    });
  };

  ["imageUrl", "imagePosX", "imagePosY", "imageZoom"].forEach((id) => {
    $(id)?.addEventListener("input", updatePreview);
  });

  $("resetCropBtn")?.addEventListener("click", () => {
    $("imagePosX").value = 50;
    $("imagePosY").value = 50;
    $("imageZoom").value = 100;
    updatePreview();
  });

  updatePreview();
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

        <!-- ✅ NOVO LAYOUT DE PREÇO NO ADMIN -->
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

        <button class="btn secondary" data-edit>Editar</button>
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

function clearProductForm() {
  $("pName").value = "";
  $("pDesc").value = "";
  $("pPrice").value = "";
  $("pPromoPrice").value = "";
  $("pStock").value = "";
  $("pSort").value = "";
  $("pActive").checked = true;
  $("pFeatured").checked = false;

  $("imageUrl").value = "";
  $("imagePosX").value = 50;
  $("imagePosY").value = 50;
  $("imageZoom").value = 100;

  // preview
  const previewImg = $("previewImg");
  const previewBox = previewImg?.closest(".imgPreviewBox");
  if (previewImg) {
    previewImg.removeAttribute("src");
    applyImageView(previewImg, previewBox, { x: 50, y: 50, zoom: 100 });
  }

  $("deleteProductBtn").style.display = "none";
}

function openEdit(p) {
  editingId = p.id;
  productMsg.textContent = "";

  $("pName").value = p.name || "";
  $("pDesc").value = p.description || "";
  $("pPrice").value = p.price ?? "";
  $("pPromoPrice").value = p.promoPrice ?? "";
  $("pStock").value = (p.stock === null || p.stock === undefined) ? "" : p.stock;
  $("pSort").value = p.sortOrder ?? "";
  $("pActive").checked = !!p.active;
  $("pFeatured").checked = !!p.featured;

  $("imageUrl").value = p.imageUrl || "";
  $("imagePosX").value = p.imagePosX ?? 50;
  $("imagePosY").value = p.imagePosY ?? 50;
  $("imageZoom").value = p.imageZoom ?? 100;

  // preview
  const previewImg = $("previewImg");
  const previewBox = previewImg?.closest(".imgPreviewBox");
  if (previewImg) {
    setSafeImg(previewImg, p.imageUrl || "");
    applyImageView(previewImg, previewBox, {
      x: p.imagePosX ?? 50,
      y: p.imagePosY ?? 50,
      zoom: p.imageZoom ?? 100
    });
  }

  $("deleteProductBtn").style.display = "inline-block";
  $("productModal").style.display = "block";
}

async function saveProduct() {
  productMsg.textContent = "";

  const data = {
    name: $("pName").value.trim(),
    description: $("pDesc").value.trim(),
    price: Number($("pPrice").value || 0),
    promoPrice: $("pPromoPrice").value === "" ? null : Number($("pPromoPrice").value),
    stock: $("pStock").value === "" ? null : Number($("pStock").value),
    sortOrder: Number($("pSort").value || 0),
    active: $("pActive").checked,
    featured: $("pFeatured").checked,

    imageUrl: $("imageUrl").value.trim(),
    imagePosX: Number($("imagePosX").value),
    imagePosY: Number($("imagePosY").value),
    imageZoom: Number($("imageZoom").value),

    updatedAt: serverTimestamp(),
  };

  try {
    if (!editingId) {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "products"), data);
      productMsg.textContent = "Produto criado.";
    } else {
      await updateDoc(doc(db, "products", editingId), data);
      productMsg.textContent = "Produto atualizado.";
    }
    $("productModal").style.display = "none";
  } catch (e) {
    console.error(e);
    productMsg.textContent = "Erro ao salvar produto.";
  }
}

async function deleteProduct() {
  if (!editingId) return;
  if (!confirm("Excluir este produto?")) return;

  productMsg.textContent = "";
  try {
    await deleteDoc(doc(db, "products", editingId));
    productMsg.textContent = "Produto excluído.";
    $("productModal").style.display = "none";
    editingId = null;
  } catch (e) {
    console.error(e);
    productMsg.textContent = "Erro ao excluir produto.";
  }
}

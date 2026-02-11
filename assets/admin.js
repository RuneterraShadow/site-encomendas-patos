import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

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

// banner controls
const bImagePosX = $("bImagePosX");
const bImagePosY = $("bImagePosY");
const bImageZoom = $("bImageZoom");
const bImagePosXVal = $("bImagePosXVal");
const bImagePosYVal = $("bImagePosYVal");
const bImageZoomVal = $("bImageZoomVal");
const bImagePreview = $("bImagePreview");
const bImagePreviewBox = $("bImagePreviewBox");
const resetBannerBtn = $("resetBannerBtn");

// product controls
const pImagePosX = $("pImagePosX");
const pImagePosY = $("pImagePosY");
const pImageZoom = $("pImageZoom");
const pImagePosXVal = $("pImagePosXVal");
const pImagePosYVal = $("pImagePosYVal");
const pImageZoomVal = $("pImageZoomVal");
const pImagePreview = $("pImagePreview");
const pImagePreviewBox = $("pImagePreviewBox");
const resetCropBtn = $("resetCropBtn");

// ✅ Pede senha de novo SOMENTE depois que fechar o navegador
(async () => {
  try {
    await setPersistence(auth, browserSessionPersistence);
  } catch (e) {
    console.warn("Persistência de sessão falhou:", e);
  }
})();

// ---------- HELPERS ----------
function setMsg(el, text, ok=true){
  el.textContent = text;
  el.style.color = ok ? "var(--ok)" : "var(--danger)";
  setTimeout(() => { el.textContent = ""; }, 3500);
}
function parseOptionalNumber(value){
  const v = String(value ?? "").trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function boolFromSelect(selectEl){ return selectEl.value === "true"; }
function clampPos(v, fallback=50){
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}
function clampZoom(v, fallback=100){
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(50, Math.min(200, n));
}

/**
 * ✅ Regra pedida (zoom “antigo”):
 * - zoom < 100: contain + checker + scale(z/100)
 * - zoom >= 100: cover + scale(z/100)
 */
function applyImageView(imgEl, containerEl, { x=50, y=50, zoom=100 } = {}){
  const z = clampZoom(zoom, 100);
  const fit = z < 100 ? "contain" : "cover";

  if (containerEl){
    containerEl.classList.toggle("checker", z < 100);
  }
  if (imgEl){
    imgEl.style.objectFit = fit;
    imgEl.style.objectPosition = `${clampPos(x,50)}% ${clampPos(y,50)}%`;
    imgEl.style.transform = `scale(${z/100})`;
    imgEl.style.transformOrigin = "center center";
  }
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

function moneyBRL(v){
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
}

// ---------- AUTH ----------
$("loginBtn").addEventListener("click", async (ev) => {
  ev?.preventDefault?.();
  loginMsg.textContent = "";

  const email = $("email").value.trim();
  const pass = $("pass").value;

  try{
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(e){
    loginMsg.textContent = e?.message || "Erro ao entrar.";
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (user){
    loginBox.style.display = "none";
    adminBox.style.display = "block";
    boot();
  }else{
    adminBox.style.display = "none";
    loginBox.style.display = "block";
  }
});

// ---------- BANNER (corte/zoom) ----------
function updateBannerPreview(){
  const url = $("bannerImageUrl")?.value?.trim() || "";
  if (bImagePreview){
    if (!url){
      bImagePreview.removeAttribute("src");
      bImagePreview.style.display = "none";
    }else{
      bImagePreview.style.display = "block";
      bImagePreview.src = url;
    }
  }

  const x = clampPos(bImagePosX?.value, 50);
  const y = clampPos(bImagePosY?.value, 50);
  const z = clampZoom(bImageZoom?.value, 100);

  if (bImagePosXVal) bImagePosXVal.textContent = String(x);
  if (bImagePosYVal) bImagePosYVal.textContent = String(y);
  if (bImageZoomVal) bImageZoomVal.textContent = String(z);

  applyImageView(bImagePreview, bImagePreviewBox, { x, y, zoom: z });
}

[bImagePosX, bImagePosY, bImageZoom, $("bannerImageUrl")].forEach((node) => {
  node?.addEventListener("input", updateBannerPreview);
});

resetBannerBtn?.addEventListener("click", (ev) => {
  ev?.preventDefault?.();
  if (bImagePosX) bImagePosX.value = "50";
  if (bImagePosY) bImagePosY.value = "50";
  if (bImageZoom) bImageZoom.value = "100";
  updateBannerPreview();
});

// ---------- PRODUCT PREVIEW (corte/zoom) ----------
function updateProductPreview(){
  const url = $("pImageUrl")?.value?.trim() || "";
  if (pImagePreview){
    if (!url){
      pImagePreview.removeAttribute("src");
      pImagePreview.style.display = "none";
    }else{
      pImagePreview.style.display = "block";
      pImagePreview.src = url;
    }
  }

  const x = clampPos(pImagePosX?.value, 50);
  const y = clampPos(pImagePosY?.value, 50);
  const z = clampZoom(pImageZoom?.value, 100);

  if (pImagePosXVal) pImagePosXVal.textContent = String(x);
  if (pImagePosYVal) pImagePosYVal.textContent = String(y);
  if (pImageZoomVal) pImageZoomVal.textContent = String(z);

  applyImageView(pImagePreview, pImagePreviewBox, { x, y, zoom: z });
}

[pImagePosX, pImagePosY, pImageZoom, $("pImageUrl")].forEach((node) => {
  node?.addEventListener("input", updateProductPreview);
});

resetCropBtn?.addEventListener("click", (ev) => {
  ev?.preventDefault?.();
  if (pImagePosX) pImagePosX.value = "50";
  if (pImagePosY) pImagePosY.value = "50";
  if (pImageZoom) pImageZoom.value = "100";
  updateProductPreview();
});

// ---------- SETTINGS ----------
const settingsRef = doc(db, "site", "settings");

async function loadSettingsOnce(){
  const snap = await getDoc(settingsRef);
  const s = snap.exists() ? snap.data() : {};

  $("siteTitle").value = s.siteTitle || "";
  $("siteSubtitle").value = s.siteSubtitle || "";
  $("globalDesc").value = s.globalDesc || "";
  $("whatsappLink").value = s.whatsappLink || "";
  $("buyBtnText").value = s.buyBtnText || "COMPRE AGORA!";

  $("bannerTitle").value = s.bannerTitle || "";
  $("bannerDesc").value = s.bannerDesc || "";
  $("bannerImageUrl").value = s.bannerImageUrl || "";

  if (bImagePosX) bImagePosX.value = String(clampPos(s.bannerPosX ?? 50, 50));
  if (bImagePosY) bImagePosY.value = String(clampPos(s.bannerPosY ?? 50, 50));
  if (bImageZoom) bImageZoom.value = String(clampZoom(s.bannerZoom ?? 100, 100));
  updateBannerPreview();

  updateProductPreview();
}

$("saveSettingsBtn").addEventListener("click", async (ev) => {
  ev?.preventDefault?.();
  try{
    await setDoc(settingsRef, {
      siteTitle: $("siteTitle").value.trim(),
      siteSubtitle: $("siteSubtitle").value.trim(),
      globalDesc: $("globalDesc").value.trim(),
      whatsappLink: $("whatsappLink").value.trim(),
      buyBtnText: $("buyBtnText").value.trim() || "COMPRE AGORA!",

      bannerTitle: $("bannerTitle").value.trim(),
      bannerDesc: $("bannerDesc").value.trim(),
      bannerImageUrl: $("bannerImageUrl").value.trim(),

      bannerPosX: clampPos(bImagePosX?.value, 50),
      bannerPosY: clampPos(bImagePosY?.value, 50),
      bannerZoom: clampZoom(bImageZoom?.value, 100),

      updatedAt: serverTimestamp()
    }, { merge:true });

    setMsg(settingsMsg, "Configurações salvas!");
  }catch(e){
    setMsg(settingsMsg, e?.message || "Erro ao salvar settings.", false);
  }
});

// ---------- PRODUCTS ----------
const productsRef = collection(db, "products");
const qProducts = query(productsRef, orderBy("sortOrder", "asc"));

function resetForm(){
  $("productId").value = "";
  $("pName").value = "";
  $("pDesc").value = "";
  $("pPrice").value = "";
  $("pPromo").value = "";
  $("pStock").value = "";
  $("pOrder").value = "100";
  $("pImageUrl").value = "";
  $("pActive").value = "true";
  $("pFeatured").value = "false";

  // ✅ novos defaults
  $("pCategory").value = "Recursos";
  $("pBestSeller").value = "false";

  $("deleteProductBtn").disabled = true;

  if (pImagePosX) pImagePosX.value = "50";
  if (pImagePosY) pImagePosY.value = "50";
  if (pImageZoom) pImageZoom.value = "100";
  updateProductPreview();
}

$("clearFormBtn").addEventListener("click", (ev) => {
  ev?.preventDefault?.();
  resetForm();
});

$("saveProductBtn").addEventListener("click", async (ev) => {
  ev?.preventDefault?.();

  const id = $("productId").value.trim();

  const payload = {
    name: $("pName").value.trim(),
    description: $("pDesc").value.trim(),

    price: Number($("pPrice").value || 0),
    promoPrice: parseOptionalNumber($("pPromo").value),

    stock: parseOptionalNumber($("pStock").value),
    sortOrder: Number($("pOrder").value || 100),

    imageUrl: $("pImageUrl").value.trim(),
    imagePosX: clampPos(pImagePosX?.value, 50),
    imagePosY: clampPos(pImagePosY?.value, 50),
    imageZoom: clampZoom(pImageZoom?.value, 100),

    active: boolFromSelect($("pActive")),
    featured: boolFromSelect($("pFeatured")),

    // ✅ novos campos
    category: ($("pCategory").value || "Recursos").trim(),
    bestSeller: boolFromSelect($("pBestSeller")),

    updatedAt: serverTimestamp(),
  };

  try{
    if (!id){
      payload.createdAt = serverTimestamp();
      await addDoc(productsRef, payload);
      setMsg(productMsg, "Produto criado!");
      resetForm();
    }else{
      await updateDoc(doc(db, "products", id), payload);
      setMsg(productMsg, "Produto atualizado!");
    }
  }catch(e){
    setMsg(productMsg, e?.message || "Erro ao salvar produto.", false);
  }
});

$("deleteProductBtn").addEventListener("click", async (ev) => {
  ev?.preventDefault?.();
  const id = $("productId").value.trim();
  if (!id) return;

  if (!confirm("Excluir este produto?")) return;

  try{
    await deleteDoc(doc(db, "products", id));
    setMsg(productMsg, "Produto excluído!");
    resetForm();
  }catch(e){
    setMsg(productMsg, e?.message || "Erro ao excluir.", false);
  }
});

function renderProductCard(p){
  const promo = p.promoPrice && Number(p.promoPrice) > 0 && Number(p.promoPrice) < Number(p.price || 0);
  const price = promo ? moneyBRL(p.promoPrice) : moneyBRL(p.price);

  const card = document.createElement("div");
  card.className = "card";

  const cat = (p.category || "Recursos").toString();
  const best = !!p.bestSeller;

  card.innerHTML = `
    <div class="img"><img alt=""></div>
    <div class="body">
      <h3>${p.name || "Produto"}</h3>
      <p>${(p.description || "").slice(0, 120) || "—"}</p>

      <div class="badges">
        <div class="badge">${p.active ? "Ativo" : "Inativo"}</div>
        <div class="badge">${cat}</div>
        ${p.featured ? `<div class="badge">Destaque</div>` : ``}
        ${best ? `<div class="badge best">Mais vendido</div>` : ``}
        ${(p.stock === null || p.stock === undefined) ? `` : `<div class="badge">Estoque: ${p.stock}</div>`}
      </div>

      <div class="priceRow">
        <div class="price">${price}</div>
        ${promo ? `<div class="old">${moneyBRL(p.price)}</div>` : ``}
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
    zoom: p.imageZoom ?? 100
  });

  card.querySelector("[data-edit]").addEventListener("click", () => {
    $("productId").value = p.id;
    $("pName").value = p.name || "";
    $("pDesc").value = p.description || "";
    $("pPrice").value = p.price ?? "";
    $("pPromo").value = p.promoPrice ?? "";
    $("pStock").value = p.stock ?? "";
    $("pOrder").value = p.sortOrder ?? 100;
    $("pImageUrl").value = p.imageUrl || "";
    $("pActive").value = String(!!p.active);
    $("pFeatured").value = String(!!p.featured);

    // ✅ novos campos
    $("pCategory").value = (p.category || "Recursos").toString();
    $("pBestSeller").value = String(!!p.bestSeller);

    $("deleteProductBtn").disabled = false;

    if (pImagePosX) pImagePosX.value = String(clampPos(p.imagePosX ?? 50, 50));
    if (pImagePosY) pImagePosY.value = String(clampPos(p.imagePosY ?? 50, 50));
    if (pImageZoom) pImageZoom.value = String(clampZoom(p.imageZoom ?? 100, 100));
    updateProductPreview();

    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  return card;
}

function watchProducts(){
  onSnapshot(qProducts, (snap) => {
    productsGrid.innerHTML = "";
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    for (const p of items){
      productsGrid.appendChild(renderProductCard(p));
    }
  });
}

// ---------- BOOT ----------
let booted = false;
async function boot(){
  if (booted) return;
  booted = true;

  await loadSettingsOnce();
  watchProducts();
  resetForm();
}

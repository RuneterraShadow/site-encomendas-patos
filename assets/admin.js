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

// ✅ Pede senha de novo SOMENTE depois que fechar o navegador
(async () => {
  try {
    await setPersistence(auth, browserSessionPersistence);
  } catch (e) {
    console.warn("Persistência de sessão falhou:", e);
  }
})();

// ✅ novos elementos (corte/preview + zoom)
const pImagePosX = $("pImagePosX");
const pImagePosY = $("pImagePosY");
const pImageZoom = $("pImageZoom");

const pImagePosXVal = $("pImagePosXVal");
const pImagePosYVal = $("pImagePosYVal");
const pImageZoomVal = $("pImageZoomVal");

const pImagePreview = $("pImagePreview");

// ---------- UI HELPERS ----------
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

function boolFromSelect(selectEl){
  return selectEl.value === "true";
}

function clampPos(v, fallback=50){
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

function updateImagePreview(){
  const url = $("pImageUrl")?.value?.trim() || "";
  if (!url){
    pImagePreview?.removeAttribute("src");
    if (pImagePreview) pImagePreview.style.display = "none";
  }else{
    if (pImagePreview) {
      pImagePreview.style.display = "block";
      pImagePreview.src = url;
    }
  }

  const x = clampPos(pImagePosX?.value, 50);
  const y = clampPos(pImagePosY?.value, 50);
  const z = Math.max(50, Math.min(200, Number(pImageZoom?.value || 100)));

  if (pImagePosXVal) pImagePosXVal.textContent = String(x);
  if (pImagePosYVal) pImagePosYVal.textContent = String(y);
  if (pImageZoomVal) pImageZoomVal.textContent = String(z);

  if (pImagePreview) {
    pImagePreview.style.objectFit = "cover";
    pImagePreview.style.objectPosition = `${x}% ${y}%`;
    pImagePreview.style.transform = `scale(${z / 100})`;
    pImagePreview.style.transformOrigin = "center center";
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

// preview reage em tempo real
$("pImageUrl")?.addEventListener("input", updateImagePreview);
pImagePosX?.addEventListener("input", updateImagePreview);
pImagePosY?.addEventListener("input", updateImagePreview);
pImageZoom?.addEventListener("input", updateImagePreview);

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

  updateImagePreview();
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
  $("deleteProductBtn").disabled = true;

  // ✅ defaults do corte/zoom
  if (pImagePosX) pImagePosX.value = "50";
  if (pImagePosY) pImagePosY.value = "50";
  if (pImageZoom) pImageZoom.value = "100";
  updateImagePreview();
}

$("clearFormBtn").addEventListener("click", (ev) => {
  ev?.preventDefault?.();
  resetForm();
});

$("saveProductBtn").addEventListener("click", async (ev) => {
  ev?.preventDefault?.();

  try{
    const id = $("productId").value.trim();

    const payload = {
      name: $("pName").value.trim(),
      description: $("pDesc").value.trim(),
      price: parseOptionalNumber($("pPrice").value) || 0,
      promoPrice: parseOptionalNumber($("pPromo").value),
      stock: parseOptionalNumber($("pStock").value),
      sortOrder: parseOptionalNumber($("pOrder").value) ?? 100,
      imageUrl: $("pImageUrl").value.trim(),

      // ✅ corte + zoom
      imagePosX: clampPos(pImagePosX?.value, 50),
      imagePosY: clampPos(pImagePosY?.value, 50),
      imageZoom: Math.max(50, Math.min(200, Number(pImageZoom?.value || 100))),

      active: boolFromSelect($("pActive")),
      featured: boolFromSelect($("pFeatured")),
      updatedAt: serverTimestamp()
    };

    if (!payload.name){
      setMsg(productMsg, "Coloque um nome no produto.", false);
      return;
    }

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

  const ok = confirm("Excluir este produto? (não dá pra desfazer)");
  if (!ok) return;

  try{
    await deleteDoc(doc(db, "products", id));
    setMsg(productMsg, "Produto excluído!");
    resetForm();
  }catch(e){
    setMsg(productMsg, e?.message || "Erro ao excluir.", false);
  }
});

function moneyBRL(v){
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
}

function renderProductCard(p){
  const promo = p.promoPrice && Number(p.promoPrice) > 0 && Number(p.promoPrice) < Number(p.price || 0);
  const price = promo ? moneyBRL(p.promoPrice) : moneyBRL(p.price);

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
      <div class="priceRow">
        <div class="price">${price}</div>
        ${promo ? `<div class="old">${moneyBRL(p.price)}</div>` : ``}
      </div>
      <button class="btn secondary" data-edit>Editar</button>
    </div>
  `;

  const imgEl = card.querySelector("img");
  setSafeImg(imgEl, p.imageUrl);

  // ✅ aplica corte + zoom na miniatura do admin (igual ao site)
  const x = clampPos(p.imagePosX, 50);
  const y = clampPos(p.imagePosY, 50);
  const z = Math.max(50, Math.min(200, Number(p.imageZoom || 100)));
  if (imgEl) {
    imgEl.style.objectPosition = `${x}% ${y}%`;
    imgEl.style.transform = `scale(${z / 100})`;
    imgEl.style.transformOrigin = "center center";
  }

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
    $("deleteProductBtn").disabled = false;

    // ✅ carrega corte + zoom no form
    if (pImagePosX) pImagePosX.value = String(clampPos(p.imagePosX, 50));
    if (pImagePosY) pImagePosY.value = String(clampPos(p.imagePosY, 50));
    if (pImageZoom) pImageZoom.value = String(Math.max(50, Math.min(200, Number(p.imageZoom || 100))));
    updateImagePreview();

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

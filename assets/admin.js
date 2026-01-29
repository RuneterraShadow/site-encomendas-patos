import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  setPersistence,
  inMemoryPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc, getDoc, setDoc, serverTimestamp,
  collection, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

// ---------- ELEMENTS ----------
const loginBox = $("loginBox");
const adminBox = $("adminBox");
const loginMsg = $("loginMsg");
const settingsMsg = $("settingsMsg");
const productMsg = $("productMsg");
const productsGrid = $("productsGrid");

// ✅ Sempre pedir login: não persistir sessão e deslogar ao abrir
(async () => {
  try {
    await setPersistence(auth, inMemoryPersistence);
    await signOut(auth); // garante que não entra automaticamente ao abrir o admin
  } catch (e) {
    console.warn("Persistência/Logout falhou:", e);
  }
})();

// ---------- IMAGE CUT PREVIEW (seu admin já usa isso) ----------
const pImagePosX = $("pImagePosX");
const pImagePosY = $("pImagePosY");
const pImagePosXVal = $("pImagePosXVal");
const pImagePosYVal = $("pImagePosYVal");
const pImagePreview = $("pImagePreview");

function clampPos(v, fallback = 50) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

function updateImagePreview(){
  const url = $("pImageUrl")?.value?.trim() || "";

  if (pImagePreview) {
    if (!url) {
      pImagePreview.removeAttribute("src");
      pImagePreview.style.display = "none";
    } else {
      pImagePreview.style.display = "block";
      pImagePreview.src = url;
    }
  }

  const x = clampPos(pImagePosX?.value, 50);
  const y = clampPos(pImagePosY?.value, 50);

  if (pImagePosXVal) pImagePosXVal.textContent = String(x);
  if (pImagePosYVal) pImagePosYVal.textContent = String(y);
}

$("pImageUrl")?.addEventListener("input", updateImagePreview);
pImagePosX?.addEventListener("input", updateImagePreview);
pImagePosY?.addEventListener("input", updateImagePreview);

// ---------- HELPERS ----------
function setMsg(el, text, ok = true){
  if (!el) return;
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

// ---------- AUTH ----------
$("loginBtn").addEventListener("click", async (ev) => {
  ev.preventDefault?.();

  loginMsg.textContent = "";
  const email = $("email").value.trim();
  const pass = $("pass").value;

  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    loginMsg.textContent = e?.message || "Erro ao entrar.";
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginBox.style.display = "none";
    adminBox.style.display = "block";
    boot();
  } else {
    adminBox.style.display = "none";
    loginBox.style.display = "block";
  }
});

// ---------- SETTINGS ----------
const settingsRef = doc(db, "site", "settings");

async function loadSettingsOnce(){
  const snap = await getDoc(settingsRef);
  const s = snap.exists() ? snap.data() : {};

  $("siteTitle").value = s.title || "";
  $("siteSubtitle").value = s.subtitle || "";
  $("globalDesc").value = s.globalDesc || "";

  $("bannerTitle").value = s.bannerTitle || "";
  $("bannerDesc").value = s.bannerDesc || "";
  $("bannerImageUrl").value = s.bannerImg || s.bannerImageUrl || "";
  $("whatsappLink").value = s.whatsLink || "";
  $("buyBtnText").value = s.buyBtnText || "COMPRE AGORA!";

  updateImagePreview();
}

$("saveSettingsBtn").addEventListener("click", async (ev) => {
  ev.preventDefault?.();

  const payload = {
    title: $("siteTitle").value.trim(),
    subtitle: $("siteSubtitle").value.trim(),
    globalDesc: $("globalDesc").value.trim(),

    bannerTitle: $("bannerTitle").value.trim(),
    bannerDesc: $("bannerDesc").value.trim(),
    bannerImg: $("bannerImageUrl").value.trim(),
    whatsLink: $("whatsappLink").value.trim(),
    buyBtnText: $("buyBtnText").value.trim() || "COMPRE AGORA!",

    updatedAt: serverTimestamp()
  };

  try{
    await setDoc(settingsRef, payload, { merge:true });
    setMsg(settingsMsg, "Configurações salvas ✅", true);
  }catch(e){
    setMsg(settingsMsg, e?.message || "Erro ao salvar.", false);
  }
});

// ---------- PRODUCTS ----------
const productsCol = collection(db, "site", "data", "products");

function money(n){
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
}

function renderProductCard(p){
  const el = document.createElement("div");
  el.className = "card";

  const imgUrl = p.imageUrl || "";
  const x = clampPos(p.imagePosX, 50);
  const y = clampPos(p.imagePosY, 50);

  el.innerHTML = `
    <div class="img">
      ${imgUrl ? `<img src="${imgUrl}" alt="${(p.name||"").replaceAll('"','&quot;')}" style="object-position:${x}% ${y}%;">` : `<span class="small">Sem imagem</span>`}
    </div>
    <div class="body">
      <h3>${p.name || "Sem nome"}</h3>
      <div class="row" style="justify-content:space-between; gap:10px; align-items:center;">
        <div class="price">${money(p.price)}</div>
        <div class="badge">${p.active === false ? "Inativo" : "Ativo"}</div>
      </div>
      <p class="desc">${p.desc || ""}</p>
      <div class="actions">
        <button class="btn secondary" data-edit="${p.id}">Editar</button>
        <button class="btn danger" data-del="${p.id}">Excluir</button>
      </div>
    </div>
  `;
  return el;
}

let productsMap = new Map();
let unsubProducts = null;

function listenProducts(){
  const qy = query(productsCol, orderBy("createdAt", "desc"));
  unsubProducts = onSnapshot(qy, (snap) => {
    productsGrid.innerHTML = "";
    productsMap.clear();

    snap.forEach((docu) => {
      const data = docu.data();
      const p = { id: docu.id, ...data };
      productsMap.set(p.id, p);

      const card = renderProductCard(p);
      productsGrid.appendChild(card);
    });
  });
}

async function addProduct(payload){
  await addDoc(productsCol, { ...payload, createdAt: serverTimestamp() });
}

async function saveProduct(id, payload){
  const ref = doc(db, "site", "data", "products", id);
  await updateDoc(ref, payload);
}

async function removeProduct(id){
  const ref = doc(db, "site", "data", "products", id);
  await deleteDoc(ref);
}

// ---------- PRODUCT FORM ----------
function clearProductForm(){
  $("productId").value = "";
  $("pName").value = "";
  $("pPrice").value = "";
  $("pDesc").value = "";
  $("pOrder").value = "";
  $("pStock").value = "";
  $("pPromo").value = "";
  $("pActive").value = "true";
  $("pFeatured").value = "false";
  $("pImageUrl").value = "";
  if (pImagePosX) pImagePosX.value = "50";
  if (pImagePosY) pImagePosY.value = "50";
  updateImagePreview();
}

function fillProductForm(p){
  $("productId").value = p.id || "";
  $("pName").value = p.name || "";
  $("pPrice").value = p.price ?? "";
  $("pDesc").value = p.desc || "";
  $("pOrder").value = p.order ?? "";
  $("pStock").value = p.stock ?? "";
  $("pPromo").value = p.promo ?? "";
  $("pActive").value = String(p.active !== false);
  $("pFeatured").value = String(!!p.featured);
  $("pImageUrl").value = p.imageUrl || "";
  if (pImagePosX) pImagePosX.value = String(clampPos(p.imagePosX, 50));
  if (pImagePosY) pImagePosY.value = String(clampPos(p.imagePosY, 50));
  updateImagePreview();
}

$("clearFormBtn")?.addEventListener("click", (ev) => {
  ev.preventDefault?.();
  clearProductForm();
});

$("saveProductBtn")?.addEventListener("click", async (ev) => {
  ev.preventDefault?.();

  const id = $("productId").value.trim();
  const payload = {
    name: $("pName").value.trim(),
    price: parseOptionalNumber($("pPrice").value),
    desc: $("pDesc").value.trim(),
    order: parseOptionalNumber($("pOrder").value),
    stock: parseOptionalNumber($("pStock").value),
    promo: $("pPromo").value.trim(),
    active: $("pActive").value === "true",
    featured: $("pFeatured").value === "true",
    imageUrl: $("pImageUrl").value.trim(),
    imagePosX: clampPos(pImagePosX?.value, 50),
    imagePosY: clampPos(pImagePosY?.value, 50),
    updatedAt: serverTimestamp()
  };

  try{
    if (id) {
      await saveProduct(id, payload);
      setMsg(productMsg, "Produto atualizado ✅", true);
    } else {
      await addProduct(payload);
      setMsg(productMsg, "Produto criado ✅", true);
    }
    clearProductForm();
  }catch(e){
    setMsg(productMsg, e?.message || "Erro ao salvar produto.", false);
  }
});

$("deleteProductBtn")?.addEventListener("click", async (ev) => {
  ev.preventDefault?.();
  const id = $("productId").value.trim();
  if (!id) return setMsg(productMsg, "Selecione um produto para excluir.", false);

  const ok = confirm("Excluir este produto?");
  if (!ok) return;

  try{
    await removeProduct(id);
    setMsg(productMsg, "Produto excluído ✅", true);
    clearProductForm();
  }catch(e){
    setMsg(productMsg, e?.message || "Erro ao excluir.", false);
  }
});

productsGrid.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button");
  if (!btn) return;

  const editId = btn.getAttribute("data-edit");
  const delId = btn.getAttribute("data-del");

  try{
    if (editId){
      const p = productsMap.get(editId);
      if (p) fillProductForm(p);
      return;
    }
    if (delId){
      const ok = confirm("Excluir este produto?");
      if (!ok) return;
      await removeProduct(delId);
      setMsg(productMsg, "Produto excluído ✅", true);
      clearProductForm();
      return;
    }
  }catch(e){
    setMsg(productMsg, e?.message || "Erro na ação.", false);
  }
});

// ---------- BOOT ----------
let didBoot = false;
async function boot(){
  if (didBoot) return;
  didBoot = true;

  await loadSettingsOnce();
  listenProducts();
}

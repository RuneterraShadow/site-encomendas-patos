import { db } from "./firebase.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  onSnapshot as onDocSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ==========================
   MODO ADMIN
========================== */
const isAdminMode =
  new URLSearchParams(window.location.search).get("admin") === "true";

/* ==========================
   HELPERS
========================== */
const el = (id) => document.getElementById(id);

const money = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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
  }
}

function isPromo(p) {
  return (
    p.promoPrice &&
    Number(p.promoPrice) > 0 &&
    Number(p.promoPrice) < Number(p.price || 0)
  );
}

function shownPrice(p) {
  return isPromo(p) ? Number(p.promoPrice) : Number(p.price || 0);
}

/* ==========================
   MODAL EDITOR ADMIN
========================== */

const editorOverlay = document.createElement("div");
editorOverlay.style.cssText = `
position:fixed;
inset:0;
background:rgba(0,0,0,.85);
display:none;
align-items:center;
justify-content:center;
z-index:9999;
padding:20px;
`;

editorOverlay.innerHTML = `
<div style="
background:#111;
padding:20px;
max-width:700px;
width:100%;
border-radius:12px;
overflow:auto;
max-height:90vh;
color:#fff;
">
<h2>Editar Produto</h2>

<input id="edit_name" placeholder="Nome"><br><br>
<textarea id="edit_description" placeholder="Descrição"></textarea><br><br>
<input id="edit_category" placeholder="Categoria"><br><br>

<input id="edit_price" type="number" placeholder="Preço">
<input id="edit_promoPrice" type="number" placeholder="Promoção"><br><br>

<input id="edit_stock" type="number" placeholder="Estoque">
<input id="edit_sortOrder" type="number" placeholder="Ordem"><br><br>

<input id="edit_imageUrl" placeholder="URL imagem"><br><br>
<input id="edit_imageZoom" type="number" placeholder="Zoom">
<input id="edit_imagePosX" type="number" placeholder="PosX">
<input id="edit_imagePosY" type="number" placeholder="PosY"><br><br>

<label><input type="checkbox" id="edit_active"> Ativo</label>
<label><input type="checkbox" id="edit_featured"> Featured</label>
<label><input type="checkbox" id="edit_bestSeller"> BestSeller</label>

<br><br>
<button id="saveEditBtn">Salvar</button>
<button id="closeEditBtn">Cancelar</button>
</div>
`;

document.body.appendChild(editorOverlay);

let editingProduct = null;

function openEditModal(product) {
  editingProduct = product;

  el("edit_name").value = product.name || "";
  el("edit_description").value = product.description || "";
  el("edit_category").value = product.category || "";
  el("edit_price").value = product.price || 0;
  el("edit_promoPrice").value = product.promoPrice || "";
  el("edit_stock").value = product.stock || 0;
  el("edit_sortOrder").value = product.sortOrder || 0;
  el("edit_imageUrl").value = product.imageUrl || "";
  el("edit_imageZoom").value = product.imageZoom || 100;
  el("edit_imagePosX").value = product.imagePosX || 50;
  el("edit_imagePosY").value = product.imagePosY || 50;
  el("edit_active").checked = product.active ?? true;
  el("edit_featured").checked = product.featured ?? false;
  el("edit_bestSeller").checked = product.bestSeller ?? false;

  editorOverlay.style.display = "flex";
}

el("closeEditBtn").onclick = () => {
  editorOverlay.style.display = "none";
  editingProduct = null;
};

el("saveEditBtn").onclick = async () => {
  if (!editingProduct) return;

  await updateDoc(doc(db, "products", editingProduct.id), {
    name: el("edit_name").value,
    description: el("edit_description").value,
    category: el("edit_category").value,
    price: Number(el("edit_price").value),
    promoPrice: el("edit_promoPrice").value
      ? Number(el("edit_promoPrice").value)
      : null,
    stock: Number(el("edit_stock").value),
    sortOrder: Number(el("edit_sortOrder").value),
    imageUrl: el("edit_imageUrl").value,
    imageZoom: Number(el("edit_imageZoom").value),
    imagePosX: Number(el("edit_imagePosX").value),
    imagePosY: Number(el("edit_imagePosY").value),
    active: el("edit_active").checked,
    featured: el("edit_featured").checked,
    bestSeller: el("edit_bestSeller").checked,
    updatedAt: new Date(),
  });

  editorOverlay.style.display = "none";
  editingProduct = null;
};

/* ==========================
   RENDER PRODUCTS
========================== */

function renderProducts(items) {
  const grid = el("productsGrid");
  grid.innerHTML = "";

  items.forEach((p) => {
    const card = document.createElement("div");
    card.className = "card";

    const promo = isPromo(p);
    const shown = shownPrice(p);

    card.innerHTML = `
      <div class="img"><img src="${p.imageUrl || ""}"></div>
      <div class="body">
        <h3>${p.name}</h3>
        <p>${p.description || ""}</p>

        <div class="priceBlock">
          ${
            promo
              ? `<div>De: ${money(p.price)}</div>
                 <div>Por: ${money(shown)}</div>`
              : `<div>${money(shown)}</div>`
          }
        </div>

        ${
          isAdminMode
            ? `<button class="btn editBtn">Editar</button>`
            : ""
        }
      </div>
    `;

    const imgContainer = card.querySelector(".img");
    const imgEl = card.querySelector("img");

    applyImageView(imgEl, imgContainer, {
      x: p.imagePosX ?? 50,
      y: p.imagePosY ?? 50,
      zoom: p.imageZoom ?? 100,
    });

    if (isAdminMode) {
      card.querySelector(".editBtn").onclick = () =>
        openEditModal(p);
    }

    grid.appendChild(card);
  });
}

/* ==========================
   FIRESTORE
========================== */

const qy = query(collection(db, "products"), orderBy("sortOrder", "asc"));

onSnapshot(qy, (snap) => {
  const items = [];

  snap.forEach((d) => {
    const data = d.data();
    if (data.active === false) return;

    items.push({ id: d.id, ...data });
  });

  renderProducts(items);
});

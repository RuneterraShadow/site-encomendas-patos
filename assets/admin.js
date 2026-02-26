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
  if (s.startsWith("http")) return s;
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
  const z = clampZoom(zoom);
  const fit = z < 100 ? "contain" : "cover";

  if (imgEl) {
    imgEl.style.objectFit = fit;
    imgEl.style.objectPosition = `${clampPos(x)}% ${clampPos(y)}%`;
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
  if (loginBox) loginBox.style.display = isAuthed ? "none" : "block";
  if (adminBox) adminBox.style.display = isAuthed ? "block" : "none";
}

el("loginBtn")?.addEventListener("click", async () => {
  const email = el("email").value.trim();
  const pass = el("pass").value;

  if (!email || !pass)
    return showMsg("loginMsg", "Preencha email e senha.", false);

  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch {
    showMsg("loginMsg", "Falha no login.", false);
  }
});

el("logoutBtn")?.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  showAdmin(!!user);
  if (user) watchProducts();
});

/* ======================
   PRODUCTS GRID
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
}

function renderAdminProducts(items) {
  const grid = el("productsGrid");
  if (!grid) return;

  grid.innerHTML = "";

  items.forEach((p) => {
    const card = document.createElement("div");
    card.className = "card";

    const img = fixAssetPath(p.imageUrl || "");
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
        <p>${p.description || ""}</p>

        <div class="priceBlock">
          ${
            promo
              ? `
                <div class="priceLine">
                  <span>Preço normal</span>
                  <strong>${Number(p.price).toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}</strong>
                </div>

                <div class="priceLine promo">
                  <span>Preço promo</span>
                  <strong>${Number(p.promoPrice).toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}</strong>
                </div>
              `
              : `
                <div class="priceLine">
                  <span>Preço</span>
                  <strong>${Number(p.price || 0).toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}</strong>
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

    card.querySelector(".edit-btn").addEventListener("click", () => {
      fillProductForm(p);
    });

    grid.appendChild(card);
  });
}

/* ======================
   FILL FORM
====================== */

function fillProductForm(p) {
  el("productId").value = p.id || "";
  el("pName").value = p.name || "";
  el("pDesc").value = p.description || "";
  el("pPrice").value = p.price ?? "";
  el("pPromo").value = p.promoPrice ?? "";
  el("pStock").value = p.stock ?? "";
  el("pOrder").value = p.sortOrder ?? 100;
  el("pImageUrl").value = p.imageUrl || "";

  el("deleteProductBtn").disabled = false;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

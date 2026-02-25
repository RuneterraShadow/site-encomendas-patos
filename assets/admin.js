import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ================= LOGIN ================= */

const loginBox = document.getElementById("loginBox");
const adminBox = document.getElementById("adminBox");

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

loginBtn?.addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const pass = document.getElementById("pass").value;

  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    alert("Erro ao logar: " + err.message);
  }
});

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginBox.style.display = "none";
    adminBox.style.display = "block";
    loadProducts();
  } else {
    loginBox.style.display = "block";
    adminBox.style.display = "none";
  }
});

/* ================= PRODUTOS ================= */

const productsRef = collection(db, "products");

async function loadProducts() {
  const grid = document.getElementById("productsGrid");
  grid.innerHTML = "Carregando...";

  const snapshot = await getDocs(productsRef);
  grid.innerHTML = "";

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();

    const card = document.createElement("div");
    card.className = "card";
    card.style.padding = "16px";
    card.style.background = "#151a24";
    card.style.borderRadius = "12px";

    card.innerHTML = `
      <strong>${data.name}</strong><br>
      R$ ${data.price || 0}<br><br>
      <button class="btn small editBtn">Editar</button>
    `;

    card.querySelector(".editBtn").addEventListener("click", () => {
      document.getElementById("productId").value = docSnap.id;
      document.getElementById("pName").value = data.name || "";
      document.getElementById("pDesc").value = data.description || "";
      document.getElementById("pPrice").value = data.price || "";
      document.getElementById("pImageUrl").value = data.imageUrl || "";

      document.getElementById("deleteProductBtn").disabled = false;
    });

    grid.appendChild(card);
  });
}

/* ================= SALVAR ================= */

document.getElementById("saveProductBtn")?.addEventListener("click", async () => {
  const id = document.getElementById("productId").value;

  const productData = {
    name: document.getElementById("pName").value,
    description: document.getElementById("pDesc").value,
    price: Number(document.getElementById("pPrice").value),
    imageUrl: document.getElementById("pImageUrl").value
  };

  try {
    if (id) {
      await updateDoc(doc(db, "products", id), productData);
    } else {
      await addDoc(productsRef, productData);
    }

    clearForm();
    loadProducts();
  } catch (err) {
    alert("Erro ao salvar: " + err.message);
  }
});

/* ================= EXCLUIR ================= */

document.getElementById("deleteProductBtn")?.addEventListener("click", async () => {
  const id = document.getElementById("productId").value;
  if (!id) return;

  await deleteDoc(doc(db, "products", id));
  clearForm();
  loadProducts();
});

/* ================= LIMPAR ================= */

document.getElementById("clearFormBtn")?.addEventListener("click", clearForm);

function clearForm() {
  document.getElementById("productId").value = "";
  document.getElementById("pName").value = "";
  document.getElementById("pDesc").value = "";
  document.getElementById("pPrice").value = "";
  document.getElementById("pImageUrl").value = "";
  document.getElementById("deleteProductBtn").disabled = true;
}

import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ELEMENTOS */
const loginBox = document.getElementById("loginBox");
const adminBox = document.getElementById("adminBox");

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const saveBtn = document.getElementById("saveProductBtn");
const deleteBtn = document.getElementById("deleteProductBtn");
const clearBtn = document.getElementById("clearFormBtn");

const productsGrid = document.getElementById("productsGrid");

const pId = document.getElementById("productId");
const pName = document.getElementById("pName");
const pDesc = document.getElementById("pDesc");
const pPrice = document.getElementById("pPrice");
const pImage = document.getElementById("pImageUrl");

/* LOGIN */
loginBtn?.addEventListener("click", async () => {
  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("email").value,
      document.getElementById("pass").value
    );
  } catch (err) {
    alert("Erro ao logar: " + err.message);
  }
});

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, user => {
  if (user) {
    loginBox.style.display = "none";
    adminBox.style.display = "block";
    loadProducts();
  } else {
    loginBox.style.display = "block";
    adminBox.style.display = "none";
  }
});

/* FIRESTORE */
const productsRef = collection(db, "products");

async function loadProducts() {
  if (!productsGrid) return;

  productsGrid.innerHTML = "";

  const snap = await getDocs(productsRef);

  snap.forEach(docSnap => {
    const p = docSnap.data();

    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <img src="${p.imageUrl || ""}" 
           style="width:100%;height:180px;object-fit:cover;border-radius:8px;">
      <h3>${p.name}</h3>
      <p>R$ ${p.price}</p>
      <button class="btn smallBtn" data-id="${docSnap.id}">Editar</button>
    `;

    card.querySelector("button").addEventListener("click", () => {
      editProduct(docSnap.id);
    });

    productsGrid.appendChild(card);
  });
}

/* EDITAR */
async function editProduct(id) {
  const snap = await getDoc(doc(db, "products", id));
  const p = snap.data();

  pId.value = id;
  pName.value = p.name;
  pDesc.value = p.description;
  pPrice.value = p.price;
  pImage.value = p.imageUrl;

  deleteBtn.disabled = false;
}

/* SALVAR */
saveBtn?.addEventListener("click", async () => {
  const data = {
    name: pName.value,
    description: pDesc.value,
    price: Number(pPrice.value),
    imageUrl: pImage.value
  };

  if (pId.value) {
    await updateDoc(doc(db, "products", pId.value), data);
  } else {
    await addDoc(productsRef, data);
  }

  clearForm();
  loadProducts();
});

/* EXCLUIR */
deleteBtn?.addEventListener("click", async () => {
  if (!pId.value) return;

  await deleteDoc(doc(db, "products", pId.value));

  clearForm();
  loadProducts();
});

/* LIMPAR */
clearBtn?.addEventListener("click", clearForm);

function clearForm() {
  pId.value = "";
  pName.value = "";
  pDesc.value = "";
  pPrice.value = "";
  pImage.value = "";
  deleteBtn.disabled = true;
}

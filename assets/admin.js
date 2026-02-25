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

const productsRef = collection(db, "products");

async function loadProducts() {
  const list = document.getElementById("productsGrid");
  if (!list) return;

  list.innerHTML = "";

  const snap = await getDocs(productsRef);

  snap.forEach(docSnap => {
    const p = docSnap.data();

    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <img src="${p.imageUrl || ""}" 
           style="width:100%;height:180px;object-fit:cover;border-radius:8px;">
      <h3>${p.name}</h3>
      <p>R$ ${p.price}</p>
      <button onclick="editProduct('${docSnap.id}')">Editar</button>
    `;

    list.appendChild(div);
  });
}

window.editProduct = async id => {
  const snap = await getDoc(doc(db, "products", id));
  const p = snap.data();

  document.getElementById("productId").value = id;
  document.getElementById("pName").value = p.name;
  document.getElementById("pDesc").value = p.description;
  document.getElementById("pPrice").value = p.price;
  document.getElementById("pImageUrl").value = p.imageUrl;
};

document.getElementById("saveProductBtn")?.addEventListener("click", async () => {
  const id = document.getElementById("productId").value;

  const data = {
    name: document.getElementById("pName").value,
    description: document.getElementById("pDesc").value,
    price: Number(document.getElementById("pPrice").value),
    imageUrl: document.getElementById("pImageUrl").value
  };

  if (id) {
    await updateDoc(doc(db, "products", id), data);
  } else {
    await addDoc(productsRef, data);
  }

  loadProducts();
});

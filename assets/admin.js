import { db } from "./firebase.js";
import {
collection,
getDocs,
addDoc,
doc,
updateDoc,
deleteDoc,
getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const productsRef = collection(db, "products");

const nameInput = document.getElementById("name");
const descriptionInput = document.getElementById("description");
const categoryInput = document.getElementById("category");
const priceInput = document.getElementById("price");
const promoPriceInput = document.getElementById("promoPrice");
const stockInput = document.getElementById("stock");
const sortOrderInput = document.getElementById("sortOrder");
const imageUrlInput = document.getElementById("imageUrl");
const imageZoomInput = document.getElementById("imageZoom");
const imagePosXInput = document.getElementById("imagePosX");
const imagePosYInput = document.getElementById("imagePosY");
const activeInput = document.getElementById("active");
const featuredInput = document.getElementById("featured");
const bestSellerInput = document.getElementById("bestSeller");

const previewImage = document.getElementById("previewImage");
const saveBtn = document.getElementById("saveBtn");
const deleteBtn = document.getElementById("deleteBtn");
const productsGrid = document.getElementById("productsGrid");

let editingId = null;

function updatePreview() {
previewImage.src = imageUrlInput.value;
previewImage.style.transform = `scale(${(imageZoomInput.value || 100) / 100})`;
previewImage.style.objectPosition = `${imagePosXInput.value || 50}% ${imagePosYInput.value || 50}%`;
}

imageUrlInput.addEventListener("input", updatePreview);
imageZoomInput.addEventListener("input", updatePreview);
imagePosXInput.addEventListener("input", updatePreview);
imagePosYInput.addEventListener("input", updatePreview);

async function loadProducts() {
productsGrid.innerHTML = "";
const snapshot = await getDocs(productsRef);

snapshot.forEach(docSnap => {
const data = docSnap.data();
const card = document.createElement("div");
card.className = "product-card";

card.innerHTML = `
<img src="${data.imageUrl}" style="height:120px;object-fit:cover;width:100%">
<h3>${data.name}</h3>
<p>R$ ${data.price}</p>
<button data-id="${docSnap.id}">Editar</button>
`;

card.querySelector("button").onclick = () => loadProduct(docSnap.id);

productsGrid.appendChild(card);
});
}

async function loadProduct(id) {
const snap = await getDoc(doc(db, "products", id));
const data = snap.data();

editingId = id;

nameInput.value = data.name || "";
descriptionInput.value = data.description || "";
categoryInput.value = data.category || "";
priceInput.value = data.price || 0;
promoPriceInput.value = data.promoPrice || "";
stockInput.value = data.stock || 0;
sortOrderInput.value = data.sortOrder || 0;
imageUrlInput.value = data.imageUrl || "";
imageZoomInput.value = data.imageZoom || 100;
imagePosXInput.value = data.imagePosX || 50;
imagePosYInput.value = data.imagePosY || 50;
activeInput.checked = data.active || false;
featuredInput.checked = data.featured || false;
bestSellerInput.checked = data.bestSeller || false;

updatePreview();
}

saveBtn.onclick = async () => {
const productData = {
name: nameInput.value,
description: descriptionInput.value,
category: categoryInput.value,
price: Number(priceInput.value),
promoPrice: promoPriceInput.value ? Number(promoPriceInput.value) : null,
stock: Number(stockInput.value),
sortOrder: Number(sortOrderInput.value),
imageUrl: imageUrlInput.value,
imageZoom: Number(imageZoomInput.value),
imagePosX: Number(imagePosXInput.value),
imagePosY: Number(imagePosYInput.value),
active: activeInput.checked,
featured: featuredInput.checked,
bestSeller: bestSellerInput.checked,
updatedAt: new Date()
};

if (editingId) {
await updateDoc(doc(db, "products", editingId), productData);
} else {
await addDoc(productsRef, {
...productData,
createdAt: new Date()
});
}

editingId = null;
loadProducts();
alert("Salvo com sucesso");
};

deleteBtn.onclick = async () => {
if (!editingId) return;
await deleteDoc(doc(db, "products", editingId));
editingId = null;
loadProducts();
alert("Excluído");
};

loadProducts();

// assets/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDzdxKZqOgTjemtcRgM9arvGIYGcDdupGI",
  authDomain: "site-encomendas-patos.firebaseapp.com",
  projectId: "site-encomendas-patos",
  storageBucket: "site-encomendas-patos.firebasestorage.app",
  messagingSenderId: "144979472433",
  appId: "1:144979472433:web:234debcc30a5a27d56510",
  measurementId: "G-9VGE5DSF6Z"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);


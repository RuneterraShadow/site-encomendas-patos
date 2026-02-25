import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
 apiKey: "AIzaSyCYu5VZVYPbM8aDPgz66QmqXvBh8eZP5sg",
  authDomain: "site-encomendas-patos.firebaseapp.com",
  projectId: "site-encomendas-patos",
  storageBucket: "site-encomendas-patos.appspot.com",
  messagingSenderId: "1144979472433",
  appId: "1:1144979472433:web:234dbecc30a5a27d56510"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

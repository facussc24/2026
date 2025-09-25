import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "demo-key",
  authDomain: "demo-domain",
  projectId: "barackingenieria-e763c",
  storageBucket: "demo-bucket",
  messagingSenderId: "demo-sender-id",
  appId: "demo-app-id"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Connect to emulators if running locally
if (window.location.hostname === "127.0.0.1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9095");
  connectFirestoreEmulator(db, "127.0.0.1", 9085);
}

export { auth, db };
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAuoa6yU-S8bNR3QDI3DjTUvbKNyBu3_Fs",
  authDomain: "burgonomics-7faa8.firebaseapp.com",
  projectId: "burgonomics-7faa8",
  storageBucket: "burgonomics-7faa8.firebasestorage.app",
  messagingSenderId: "738930066637",
  appId: "1:738930066637:web:fc1aa0f0e2a52a19df9584",
  measurementId: "G-HQ218Q7CXF"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, limit, orderBy, query } = require('firebase/firestore');

const firebaseConfig = require('./firebase-applet-config.json');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkUsers() {
  const q = query(collection(db, "users"), limit(5));
  const snapshot = await getDocs(q);
  snapshot.forEach(doc => {
    console.log(doc.id, "=>", doc.data());
  });
}

checkUsers().catch(console.error);

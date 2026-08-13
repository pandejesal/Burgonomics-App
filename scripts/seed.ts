import { db } from "../src/core/config/firebase";
import { collection, doc, setDoc } from "firebase/firestore";
import { SAMPLE_CATEGORIES, SAMPLE_PRODUCTS } from "../src/features/menu/data/petpoojaSampleData";

async function run() {
  console.log("Seeding Categories...");
  const categoriesRef = collection(db, "petpooja_categories");
  for (const cat of SAMPLE_CATEGORIES) {
    // Exclude the 'itemCount' property from the uploaded document
    const { itemCount, ...categoryData } = cat as any;
    await setDoc(doc(categoriesRef, categoryData.id), categoryData);
  }

  console.log("Seeding Products...");
  const productsRef = collection(db, "petpooja_products");
  for (const prod of SAMPLE_PRODUCTS) {
    await setDoc(doc(productsRef, prod.id), prod);
  }

  console.log("Successfully seeded all categories and products to Firestore!");
  process.exit(0);
}

run().catch(e => {
  console.error("Error seeding:", e);
  process.exit(1);
});

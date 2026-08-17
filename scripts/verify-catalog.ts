import { db } from "../src/core/config/firebase";
import { collection, getDocs } from "firebase/firestore";

async function main() {
  console.log("Fetching collections from live Firestore...");
  const catSnap = await getDocs(collection(db, "petpooja_categories"));
  const prodSnap = await getDocs(collection(db, "petpooja_products"));

  console.log(`\n=== LIVE CATALOG VERIFICATION (burgonomics-7faa8) ===`);
  console.log(`Categories count: ${catSnap.size}`);
  catSnap.docs.forEach((d) => {
    const c = d.data();
    console.log(` - Category: [${d.id}] ${c.name}`);
  });

  console.log(`\nTotal Products count: ${prodSnap.size}`);
  const catMap: Record<string, number> = {};
  prodSnap.docs.forEach((d) => {
    const p = d.data();
    const cat = (p.categoryId as string) || "unknown";
    catMap[cat] = (catMap[cat] || 0) + 1;
  });

  console.log("Products per category:", JSON.stringify(catMap, null, 2));

  const sampleWithAddons = prodSnap.docs.find((d) => {
    const p = d.data();
    return p.customizationGroups && p.customizationGroups.length > 0;
  });

  if (sampleWithAddons) {
    const p = sampleWithAddons.data();
    console.log(
      `\nSample Item with Modifiers: ${p.name} (ID: ${sampleWithAddons.id}, Price: Rs ${p.price})`,
    );
    console.log(`Customization Groups (${p.customizationGroups.length}):`);
    p.customizationGroups.forEach((g: any) => {
      console.log(
        `  * ${g.name} (${g.min}-${g.max}): ${g.options.map((o: any) => `${o.name} (+Rs ${o.price})`).join(", ")}`,
      );
    });
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error verifying catalog:", err);
  process.exit(1);
});

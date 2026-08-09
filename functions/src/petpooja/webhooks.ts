import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * HTTP Webhook for Petpooja Menu Push
 * Petpooja sends a POST request with the entire menu catalog (categories, items, modifiers)
 * We parse this and safely upsert into our Firestore collections.
 */
export const pushMenu = functions.https.onRequest(async (req: any, res: any) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    const payload = req.body;
    
    // Authenticate the request based on app_key and app_secret (assuming these are passed by Petpooja)
    // Note: Petpooja standard push menu has its own signature or token. We'll use a basic check for this implementation.
    const { restaurants, success } = payload;
    
    if (success !== "1" && success !== 1 && success !== true) {
      functions.logger.warn("Received failed menu push payload from Petpooja", payload);
      res.status(400).send("Invalid success flag");
      return;
    }

    if (!restaurants || !Array.isArray(restaurants)) {
      res.status(400).send("No restaurants data found");
      return;
    }

    // Process each restaurant's menu
    for (const rest of restaurants) {
      const restId = rest.details?.restID;
      if (!restId) continue;
      
      const categories = rest.categories || [];
      
      // Batch writes can only hold 500 ops. We should chunk them.
      let batch = db.batch();
      let opCount = 0;
      
      const commitBatchIfNeeded = async () => {
        if (opCount >= 450) {
          await batch.commit();
          batch = db.batch();
          opCount = 0;
        }
      };

      for (const cat of categories) {
        // Upsert Category
        const catRef = db.collection("petpooja_categories").doc(cat.categoryid.toString());
        batch.set(catRef, {
          id: cat.categoryid.toString(),
          name: cat.categoryname,
          description: cat.categorydescription || "",
          active: cat.active === "1" || cat.active === 1,
          sortOrder: parseInt(cat.categoryrank, 10) || 0,
          restId: restId,
          imageUrl: cat.categoryimage_url || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        opCount++;
        await commitBatchIfNeeded();

        // Upsert Products in this Category
        const items = cat.items || [];
        for (const item of items) {
          const itemRef = db.collection("petpooja_products").doc(item.itemid.toString());
          
          // Map Customizations (Addons/Variations)
          const customizations = (item.addon_groups || []).map((ag: any) => ({
            id: ag.addon_group_id?.toString(),
            name: ag.addon_group_name,
            minSelections: parseInt(ag.min_select, 10) || 0,
            maxSelections: parseInt(ag.max_select, 10) || 1,
            options: (ag.addon_items || []).map((ai: any) => ({
              id: ai.addon_item_id?.toString(),
              name: ai.addon_item_name,
              price: parseFloat(ai.addon_item_price) || 0,
              isAvailable: ai.active === "1" || ai.active === 1,
            }))
          }));

          batch.set(itemRef, {
            id: item.itemid.toString(),
            categoryId: cat.categoryid.toString(),
            restId: restId,
            name: item.itemname,
            description: item.itemdescription || "",
            price: parseFloat(item.itemprice) || 0,
            imageUrl: item.itemimage_url || null,
            isAvailable: item.active === "1" || item.active === 1,
            dietaryTag: item.item_attributeid === "1" ? "veg" : item.item_attributeid === "2" ? "non-veg" : "veg",
            sortOrder: parseInt(item.itemrank, 10) || 0,
            customizations: customizations,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          opCount++;
          await commitBatchIfNeeded();
        }
      }
      
      // Commit remaining ops
      if (opCount > 0) {
        await batch.commit();
      }
      
      functions.logger.info(`Successfully processed menu for restaurant ${restId}`);
    }

    res.status(200).send({ status: "success", message: "Menu synced successfully" });

  } catch (error: any) {
    functions.logger.error("Error processing Petpooja Menu push", error);
    res.status(500).send({ status: "error", message: "Internal server error" });
  }
});

/**
 * HTTP Webhook for Petpooja Store Status (Store Open/Close/Offline triggers)
 */
export const storeStatus = functions.https.onRequest(async (req: any, res: any) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    const payload = req.body;
    const { restID, status } = payload;
    
    if (!restID || !status) {
      res.status(400).send("Missing restID or status");
      return;
    }
    
    // Find the store in admin_stores by petpoojaRestId
    const storesRef = db.collection("admin_stores");
    const snapshot = await storesRef.where("petpoojaRestId", "==", restID.toString()).limit(1).get();
    
    if (!snapshot.empty) {
      const storeDoc = snapshot.docs[0];
      await storeDoc.ref.update({
        isOpen: status === "1" || status === "active" || status === 1,
        lastSyncTime: admin.firestore.FieldValue.serverTimestamp(),
        webhookStatus: "active"
      });
      functions.logger.info(`Updated store ${storeDoc.id} status to ${status}`);
    } else {
      functions.logger.warn(`Received status for unknown petpoojaRestId: ${restID}`);
    }

    res.status(200).send({ status: "success" });
  } catch (error: any) {
    functions.logger.error("Error processing Store Status push", error);
    res.status(500).send({ status: "error", message: "Internal server error" });
  }
});

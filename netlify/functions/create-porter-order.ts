import * as admin from "firebase-admin";
import express, { Request, Response } from "express";
import serverless from "serverless-http";

// Initialize Firebase Admin SDK if needed
if (!admin.apps.length) {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountRaw) {
    try {
      const serviceAccount = JSON.parse(serviceAccountRaw);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } catch {
      admin.initializeApp();
    }
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();

export interface CreatePorterOrderResult {
  status: "success" | "skipped" | "error";
  orderId?: string;
  porterOrderId?: string;
  skipped?: boolean;
  reason?: string;
  wouldCreate?: boolean;
  dryRun?: boolean;
  payload?: any;
  error?: string;
}

export function buildPorterPayload(order: any, branch: any) {
  const city = branch.city || process.env.PORTER_CITY || "Ahmedabad";
  const pickupAddress = branch.address || branch.addressLine1 || "Burgonomics Store";
  const dropAddress = order.address?.line1 || "Customer Delivery Address";
  const customerName = order.address?.name || "Customer";
  const customerPhone = order.address?.phone || "9876543210";
  const branchPhone = branch.phone || "07912345678";

  return {
    request_id: `req_${order.id || Date.now()}`,
    pickup_details: {
      address: {
        apartment_address: pickupAddress,
        street_address: pickupAddress,
        city,
        pincode: branch.pincode || "380009",
      },
      contact: {
        name: branch.name || "Burgonomics",
        mobile: {
          number: branchPhone.replace(/\D/g, "").slice(-10),
          country_code: "+91",
        },
      },
    },
    drop_details: {
      address: {
        apartment_address: order.address?.line2 || dropAddress,
        street_address: dropAddress,
        city: order.address?.city || city,
        pincode: order.address?.pincode || "380009",
      },
      contact: {
        name: customerName,
        mobile: {
          number: customerPhone.replace(/\D/g, "").slice(-10),
          country_code: "+91",
        },
      },
    },
    customer: {
      name: customerName,
      mobile: {
        number: customerPhone.replace(/\D/g, "").slice(-10),
        country_code: "+91",
      },
    },
    packages: {
      medium_count: order.items?.length || 1,
    },
  };
}

/**
 * Creates Porter delivery order if enabled for branch and credentials exist.
 */
export async function createPorterOrder(
  firestoreDb: admin.firestore.Firestore,
  orderId: string,
  options: {
    dryRun?: boolean;
    fetchFn?: typeof fetch;
  } = {},
): Promise<CreatePorterOrderResult> {
  const isDryRun = Boolean(options.dryRun);
  const fetchFn = options.fetchFn || globalThis.fetch;

  if (!orderId) {
    return { status: "error", error: "orderId is required" };
  }

  // 1. Fetch order document
  const orderRef = firestoreDb.collection("orders").doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    return { status: "error", error: `Order ${orderId} not found` };
  }

  const order = orderSnap.data() as any;
  const branchId = order.branchId || order.store?.id;

  // 2. Check branch features.porterEnabled
  let branchData: any = {};
  if (branchId) {
    const branchSnap = await firestoreDb.collection("branches").doc(branchId).get();
    if (branchSnap.exists) {
      branchData = branchSnap.data();
    }
  }

  const isBranchEnabled = branchData?.features?.porterEnabled === true;
  const isKeyConfigured = Boolean(process.env.PORTER_API_KEY);

  if (!isBranchEnabled || !isKeyConfigured) {
    return {
      status: "skipped",
      skipped: true,
      reason: "porter_disabled",
      orderId,
    };
  }

  const porterPayload = buildPorterPayload(order, branchData);

  // 3. Dry run mode
  if (isDryRun) {
    return {
      status: "success",
      wouldCreate: true,
      dryRun: true,
      orderId,
      payload: porterPayload,
    };
  }

  // 4. Live call to Porter API
  try {
    const endpoint = "https://api.porter.in/v1/orders";
    const response = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.PORTER_API_KEY || "",
        "x-customer-id": process.env.PORTER_CUSTOMER_ID || "",
      },
      body: JSON.stringify(porterPayload),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "Porter API error");
      await orderRef.update({
        "delivery.porter.status": "porter_failed",
        "delivery.porter.lastError": errBody,
        deliveryStatus: "porter_failed",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { status: "error", orderId, error: errBody };
    }

    const data = await response.json().catch(() => ({}));
    const porterOrderId = data.order_id || data.orderId || `ptr_${Date.now()}`;
    const porterCost = data.fare?.total_fare || data.cost || 45;

    await orderRef.update({
      "delivery.porter": {
        orderId: porterOrderId,
        cost: porterCost,
        status: "open",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      deliveryStatus: "porter_open",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      status: "success",
      orderId,
      porterOrderId,
    };
  } catch (err: any) {
    await orderRef.update({
      "delivery.porter.status": "porter_failed",
      "delivery.porter.lastError": err?.message || "Network error",
      deliveryStatus: "porter_failed",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { status: "error", orderId, error: err?.message };
  }
}

const app = express();
app.use(express.json());

app.post(
  [
    "/",
    "/create",
    "/createPorterOrder",
    "/.netlify/functions/create-porter-order",
    "/api/porter/create",
  ],
  async (req: Request, res: Response) => {
    const { orderId } = req.body;
    const isDryRun = req.query.dryRun === "1" || req.query.dryRun === "true" || req.body?.dryRun === true;

    const result = await createPorterOrder(db, orderId, { dryRun: isDryRun });
    res.status(result.status === "error" ? 400 : 200).send(result);
  },
);

export const handler = serverless(app);

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const projectId = "burgonomics-test-rules";
const rootRulesPath = process.env.CANDIDATE_RULES_PATH ?? "firestore.rules";
const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const status = { code: "PLACED", label: "Placed", kind: "upcoming", terminal: false };

describe("R1 orders security", () => {
  let environment: RulesTestEnvironment;
  beforeAll(async () => {
    const candidate = readFileSync(rootRulesPath);
    expect(hash(readFileSync("firestore.rules"))).toBe(hash(candidate));
    environment = await initializeTestEnvironment({
      projectId,
      firestore: {
        rules: candidate.toString("utf8"),
        host: "127.0.0.1",
        port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080),
      },
    });
  });
  afterAll(async () => {
    if (environment) await environment.cleanup();
  });
  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await Promise.all([
        setDoc(doc(db, "admins", "support"), { role: "support" }),
        setDoc(doc(db, "admins", "regional"), { role: "regional_manager", branchIds: ["a", "b"] }),
        setDoc(doc(db, "admins", "empty"), { role: "regional_manager", branchIds: [] }),
        setDoc(doc(db, "admins", "malformed"), { role: "regional_manager", branchIds: "a" }),
        setDoc(doc(db, "admins", "noids"), { role: "regional_manager" }),
        setDoc(doc(db, "admins", "blank"), { role: "regional_manager", branchIds: [""] }),
        setDoc(doc(db, "admins", "mixed"), { role: "regional_manager", branchIds: ["a", 42] }),
        setDoc(doc(db, "admins", "wrongrole"), { role: "support", branchIds: ["a"] }),
        setDoc(doc(db, "admins", "staff"), { role: "branch_staff", branchId: "a" }),
        setDoc(doc(db, "admins", "brand"), { role: "brand_owner" }),
        // F06: staff authorization is fail-closed on `users/{uid}.active`.
        // Only the UIDs the suite expects to be ADMITTED get an active profile;
        // the deliberate negative fixtures (missing/empty/malformed/noids/blank/
        // wrongrole) and the forged `users/missing` doc stay absent or inactive.
        setDoc(doc(db, "users", "support"), { role: "support", active: true }),
        setDoc(doc(db, "users", "regional"), { role: "regional_manager", active: true }),
        setDoc(doc(db, "users", "mixed"), { role: "regional_manager", active: true }),
        setDoc(doc(db, "users", "staff"), { role: "branch_staff", active: true }),
        setDoc(doc(db, "users", "brand"), { role: "brand_owner", active: true }),
        setDoc(doc(db, "orders", "a"), {
          customerId: "customer",
          userId: "customer",
          branchId: "a",
          store: { id: "a" },
          status,
        }),
        setDoc(doc(db, "orders", "b"), {
          customerId: "other",
          userId: "other",
          branchId: "b",
          store: { id: "b" },
          status,
        }),
        setDoc(doc(db, "orders", "foreign"), {
          customerId: "other",
          userId: "other",
          branchId: "c",
          store: { id: "c" },
          status,
        }),
      ]);
    });
  });
  const db = (uid: string, claims: Record<string, unknown> = {}) =>
    environment.authenticatedContext(uid, claims).firestore();
  const scoped = (uid: string, ids: string[]) =>
    getDocs(query(collection(db(uid), "orders"), where("branchId", "in", ids)));

  it("support can query all orders without gaining write access", async () => {
    expect((await assertSucceeds(getDocs(collection(db("support"), "orders")))).size).toBe(3);
    await assertFails(updateDoc(doc(db("support"), "orders", "a"), { notes: "forged" }));
  });
  it("regional assigned in-query succeeds and foreign, unbounded and store-only queries fail", async () => {
    expect((await assertSucceeds(scoped("regional", ["a", "b"]))).size).toBe(2);
    await assertFails(scoped("regional", ["a", "c"]));
    await assertFails(getDocs(collection(db("regional"), "orders")));
    await assertFails(
      getDocs(query(collection(db("regional"), "orders"), where("store.id", "==", "a"))),
    );
  });
  it("missing, empty and malformed authoritative assignments deny", async () => {
    for (const uid of ["missing", "empty", "malformed", "noids", "blank"])
      await assertFails(scoped(uid, ["a"]));
  });
  it("mixed registry retains only matching string assignments", async () => {
    await assertSucceeds(getDoc(doc(db("mixed"), "orders", "a")));
    expect((await assertSucceeds(scoped("mixed", ["a"]))).size).toBe(1);
    await assertFails(scoped("mixed", ["c"]));
  });
  it("stale regional claims and client-forged profiles do not confer authority", async () => {
    const stale = db("missing", { role: "regional_manager", branchIds: ["a"] });
    await assertFails(getDocs(query(collection(stale, "orders"), where("branchId", "in", ["a"]))));
    await assertFails(
      setDoc(doc(stale, "admins", "missing"), { role: "regional_manager", branchIds: ["a"] }),
    );
    await assertFails(
      setDoc(doc(stale, "users", "missing"), { role: "regional_manager", branchIds: ["a"] }),
    );
    await assertFails(updateDoc(doc(db("regional"), "admins", "regional"), { branchIds: ["c"] }));
    await assertFails(scoped("regional", ["c"]));
  });
  it("sentinel walk-in is denied to every client regardless of payment status", async () => {
    for (const uid of ["brand", "staff", "support", "regional", "customer", "cust_walkin"]) {
      for (const paymentStatus of ["pending", "completed", "failed"]) {
        await assertFails(
          setDoc(doc(db(uid), "orders", `${uid}_${paymentStatus}`), {
            customerId: "cust_walkin",
            userId: uid,
            branchId: "a",
            status,
            paymentStatus,
          }),
        );
      }
    }
  });
  it("customer COD create and own read, brand and branch reads remain available", async () => {
    const customer = db("customer");
    await assertSucceeds(
      setDoc(doc(customer, "orders", "cod"), {
        customerId: "customer",
        userId: "customer",
        branchId: "a",
        status,
        payment: { method: "cod", status: "pending" },
      }),
    );
    await assertSucceeds(getDoc(doc(customer, "orders", "cod")));
    await assertSucceeds(getDoc(doc(db("brand"), "orders", "foreign")));
    await assertSucceeds(getDoc(doc(db("staff"), "orders", "a")));
    await assertFails(getDoc(doc(db("staff"), "orders", "foreign")));
  });

  describe("server-owned walk-in replay metadata", () => {
    const roles = ["brand_owner", "developer", "branch_owner", "branch_staff"];
    const receipt = {
      orderId: "server-walkin",
      replayed: false,
      status,
      paymentStatus: "pending",
      totals: { grandTotal: 199, split: { branchAmountPaise: 19900 } },
    };
    const storedOrder = {
      customerId: "cust_walkin",
      userId: "operator",
      branchId: "a",
      status,
      paymentStatus: "pending",
      walkInRequestHash: "original-request-hash",
      walkInReceipt: receipt,
    };
    const attacks: Array<{ name: string; patch: () => Record<string, unknown> }> = [
      { name: "replace hash", patch: () => ({ walkInRequestHash: "forged-request-hash" }) },
      { name: "delete hash", patch: () => ({ walkInRequestHash: deleteField() }) },
      {
        name: "replace receipt",
        patch: () => ({ walkInReceipt: { ...receipt, orderId: "forged" } }),
      },
      { name: "delete receipt", patch: () => ({ walkInReceipt: deleteField() }) },
      { name: "nested order ID", patch: () => ({ "walkInReceipt.orderId": "forged" }) },
      {
        name: "nested payment state",
        patch: () => ({ "walkInReceipt.paymentStatus": "completed" }),
      },
      { name: "nested total", patch: () => ({ "walkInReceipt.totals.grandTotal": 1 }) },
      {
        name: "nested paise",
        patch: () => ({ "walkInReceipt.totals.split.branchAmountPaise": 1 }),
      },
      { name: "nested removal", patch: () => ({ "walkInReceipt.totals": deleteField() }) },
    ];
    const seed = async (role: string) =>
      environment.withSecurityRulesDisabled(async (context) => {
        const server = context.firestore();
        await setDoc(doc(server, "admins", "operator"), { role, branchId: "a", branchIds: ["a"] });
        // F06: staff authorization is fail-closed on `users/{uid}.active`, so every
        // seeded operator needs an ACTIVE profile carrying its role (and the same
        // branch scope as its registry row) to be admitted at all. `developer` is
        // in brandRoles(), so it resolves through the same brand arm as brand_owner.
        await setDoc(doc(server, "users", "operator"), {
          role,
          active: true,
          branchIds: ["a"],
        });
        await setDoc(doc(server, "orders", "server-walkin"), storedOrder);
      });

    for (const role of roles) {
      it(`${role} can still edit safe notes without altering the server receipt`, async () => {
        await seed(role);
        const target = doc(db("operator"), "orders", "server-walkin");
        await assertSucceeds(updateDoc(target, { notes: "Counter collection" }));
        expect((await assertSucceeds(getDoc(target))).data()?.walkInReceipt).toEqual(receipt);
      });
      for (const attack of attacks) {
        it(`denies ${role} ${attack.name}`, async () => {
          await seed(role);
          await assertFails(
            updateDoc(doc(db("operator"), "orders", "server-walkin"), attack.patch()),
          );
        });
      }
      it(`denies ${role} overwriting the whole document without replay metadata`, async () => {
        await seed(role);
        const {
          walkInReceipt: _receipt,
          walkInRequestHash: _hash,
          ...withoutMarkers
        } = storedOrder;
        await assertFails(setDoc(doc(db("operator"), "orders", "server-walkin"), withoutMarkers));
      });
      it(`denies ${role} planting replay markers onto an ordinary order`, async () => {
        await seed(role);
        await assertFails(
          updateDoc(doc(db("operator"), "orders", "a"), {
            walkInRequestHash: "forged-request-hash",
            walkInReceipt: receipt,
          }),
        );
      });
    }

    for (const field of ["walkInReceipt", "walkInRequestHash"]) {
      it(`customer creation still rejects ${field} injection with a valid COD control`, async () => {
        const valid = {
          customerId: "customer",
          userId: "customer",
          branchId: "a",
          status,
          payment: { method: "cod", status: "pending" },
        };
        const customer = db("customer");
        await assertSucceeds(setDoc(doc(customer, "orders", "plain-cod"), valid));
        await assertFails(
          setDoc(doc(customer, "orders", "injected-cod"), {
            ...valid,
            [field]: field === "walkInReceipt" ? receipt : "forged-request-hash",
          }),
        );
      });
    }
    it("the server lane can create, replace and remove replay markers", async () => {
      await seed("brand_owner");
      await environment.withSecurityRulesDisabled(async (context) => {
        const target = doc(context.firestore(), "orders", "server-walkin");
        await updateDoc(target, {
          walkInRequestHash: "server-updated",
          "walkInReceipt.replayed": true,
        });
        expect((await getDoc(target)).data()?.walkInRequestHash).toBe("server-updated");
        await updateDoc(target, { walkInRequestHash: deleteField(), walkInReceipt: deleteField() });
        expect((await getDoc(target)).data()).not.toHaveProperty("walkInReceipt");
      });
    });
  });
});

import { auth, db } from "@/core/config/firebase";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, collection } from "firebase/firestore";
import { getDeviceInfo } from "../../utils/deviceInfo";
import { secureStorage } from "@/core/storage/secureStorage";

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  avatar: string | null;
  role: {
    name: string;
    permissions: string[];
  };
  assignedStoreId?: string;
}

export interface LoginResponse {
  accessToken: string;
  admin: AdminUser;
}

class AdminAuthService {
  async login(email: string, password: string): Promise<LoginResponse> {
    try {
      // Sign in with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Check if they are an admin in Firestore
      const adminDocRef = doc(db, "admins", user.uid);
      const adminDocSnap = await getDoc(adminDocRef);

      if (!adminDocSnap.exists()) {
        await signOut(auth);
        throw new Error("Access Denied: You do not have administrative privileges.");
      }

      const adminData = adminDocSnap.data();

      const adminUser: AdminUser = {
        id: user.uid,
        email: user.email || email,
        fullName: adminData.fullName || "Admin",
        avatar: adminData.avatar || null,
        role: {
          name: adminData.role || "Developer",
          permissions: adminData.permissions || ["admin.system", "admin.stores", "admin.orders"],
        },
      };

      const accessToken = await user.getIdToken();

      // Session Tracking
      const { device, browser, os } = getDeviceInfo();
      const sessionRef = doc(collection(db, "admins", user.uid, "sessions"));
      await setDoc(sessionRef, {
        id: sessionRef.id,
        device,
        browser,
        os,
        ip: "Unknown",
        country: "Unknown",
        active: true,
        lastSeen: new Date().toISOString(),
      });
      await secureStorage.set("admin_session_id", sessionRef.id);

      return {
        accessToken,
        admin: adminUser,
      };
    } catch (error: any) {
      if (error.code === "auth/invalid-credential" || error.code === "auth/user-not-found" || error.code === "auth/wrong-password") {
        throw new Error("Invalid email or password.");
      }
      throw error;
    }
  }

  async logout(): Promise<void> {
    const user = auth.currentUser;
    const sessionId = await secureStorage.get("admin_session_id");

    if (user && sessionId) {
      try {
        const sessionRef = doc(db, "admins", user.uid, "sessions", sessionId);
        await updateDoc(sessionRef, { active: false });
      } catch (err) {
        console.warn("Failed to deactivate session on logout", err);
      }
    }
    
    await secureStorage.remove("admin_session_id");
    await signOut(auth);
  }

  async checkAuthState(): Promise<{ admin: AdminUser; accessToken: string } | null> {
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
        unsubscribe();
        if (user) {
          try {
            const adminDocRef = doc(db, "admins", user.uid);
            const adminDocSnap = await getDoc(adminDocRef);

            if (adminDocSnap.exists()) {
              const adminData = adminDocSnap.data();
              const accessToken = await user.getIdToken();
              resolve({
                admin: {
                  id: user.uid,
                  email: user.email || "",
                  fullName: adminData.fullName || "Admin",
                  avatar: adminData.avatar || null,
                  role: {
                    name: adminData.role || "Admin",
                    permissions: adminData.permissions || ["admin.system", "admin.stores", "admin.orders"],
                  },
                },
                accessToken,
              });
              return;
            } else {
              resolve(null);
            }
          } catch (e) {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });
  }
}

export const adminAuthService = new AdminAuthService();

import { db } from "@/core/config/firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

export interface UserProfile {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  favorites?: string[];
  addresses?: any[];
}

export const userService = {
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const docRef = doc(db, "users", userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as UserProfile;
    }
    return null;
  },

  async updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
    const docRef = doc(db, "users", userId);
    await updateDoc(docRef, data);
  },

  async toggleFavorite(userId: string, productId: string, isFavorite: boolean): Promise<void> {
    const profile = await this.getUserProfile(userId);
    if (!profile) return;
    
    let favorites = profile.favorites || [];
    if (isFavorite && !favorites.includes(productId)) {
      favorites.push(productId);
    } else if (!isFavorite) {
      favorites = favorites.filter(id => id !== productId);
    }

    await this.updateUserProfile(userId, { favorites });
  }
};

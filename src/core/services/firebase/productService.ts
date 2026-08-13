import { db } from "@/core/config/firebase";
import { collection, getDocs, doc, getDoc, query, where } from "firebase/firestore";
import { Product, MenuCategoryModel } from "@/features/menu/models";

export const productService = {
  async getCategories(): Promise<MenuCategoryModel[]> {
    const querySnapshot = await getDocs(collection(db, "petpooja_categories"));
    return querySnapshot.docs.map(doc => doc.data() as MenuCategoryModel);
  },

  async getProducts(): Promise<Product[]> {
    const querySnapshot = await getDocs(collection(db, "petpooja_products"));
    return querySnapshot.docs.map(doc => doc.data() as Product);
  },

  async getProductById(id: string): Promise<Product | null> {
    const docRef = doc(db, "petpooja_products", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as Product;
    }
    return null;
  },

  async getProductsByCategory(categoryId: string): Promise<Product[]> {
    const q = query(collection(db, "petpooja_products"), where("categoryId", "==", categoryId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Product);
  }
};

# BURGONOMICS — Cloud Image Storage & CDN (Layer 3 Constraint)

> **Reference Specification**: Firebase Cloud Storage directory layout, WebP image optimization, and CDN delivery.

---

## 1. 📁 Storage Bucket Layout
```
/burgonomics-storage/
  /menu/
    /{branchId}/{itemId}.webp      <- Product hero image (800x800)
    /customizer/{ingredientId}.png <- PNG alpha layer for burger builder
  /banners/
    /{bannerId}.webp               <- Home screen carousel hero banners (1200x500)
  /avatars/
    /{userId}.webp                 <- Profile thumbnails (200x200)
  /tickets/
    /{ticketId}/{fileId}.jpg       <- Customer defect photo attachments
```

---

## 2. ⚡ Optimization & Invariants
- **Format**: All product photos must be compressed to WebP format (< 150KB) before database URL commit.
- **Burger Builder Layers**: Burger customizer ingredients must maintain clean transparent PNG cutouts aligned to unified `500x500px` canvas.
- **Cache-Control**: Static menu images served with `public, max-age=31536000, immutable`.

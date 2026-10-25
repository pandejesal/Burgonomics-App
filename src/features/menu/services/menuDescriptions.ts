/**
 * Static menu descriptions (source: owner-provided "Descriptions of items.xlsx",
 * reviewed 2026-10-25). Firestore/Petpooja descriptions win when present; this
 * map fills the gap for products whose POS record carries no description, so the
 * customer never sees a blank card. Encoding/truncation issues in the source
 * spreadsheet were corrected against the public menu copy.
 */
export const MENU_DESCRIPTIONS: Record<string, string> = {
  "hero burger":
    "A crispy Veggie Aloo Patty topped with fresh tomatoes, onions, smoky Chipotle, and rich Burger sauce.",
  "jr hero burger":
    "A crispy Aloo Patty layered with fresh veggies and smooth Burger sauce, finished with a mild kick of spice.",
  "korean kimchi burger":
    "Get ready for a flavor explosion! A crispy Veggie Aloo Patty topped with tangy kimchi, spicy veggies, and bold Korean sauces.",
  "mexican mafia burger":
    "Mexican Patty, zesty sauce, fresh onions, tomatoes, and jalapeños.",
  "veggie loaded burger":
    "Loaded with fresh veggies like lettuce, tomatoes, and onions, paired with a savory veggie patty.",
  "kurkure momos burger":
    "Crispy Kurkure-coated momos, with fresh onion and lettuce, tucked into a soft toasted bun for a crunchy, flavour-packed bite.",
  "cheese jalapeno burger":
    "Crispy patty covered with cheese and spice, sliced jalapeños, crisp lettuce, and a bold ghost pepper sauce, all served in a soft toasted bun.",
  "american burger":
    "A crispy patty layered with fresh lettuce, juicy tomato, sliced jalapeños, black olives, and smoky chipotle dip, tucked into a soft toasted bun for a bold, zesty bite.",
  "tandoori paneer burger":
    "Double-layered paneer patties, mozzarella-filled Italian stuffing, fresh veggies, and bold tandoori flavor. A spicy, irresistible bite you won't forget.",
  "cheese burst burger":
    "A cheesy explosion with a cheese burst patty, fresh onions, tomatoes, lettuce, and our signature sauces. Perfectly melted, perfectly satisfying.",
  "super hero burger":
    "(Aloo Tikki + Cheese Burst) Three times the power, all in one bite.",
  "great indian burger":
    "Desi meets juicy! Jumbo veggie patty, fresh tomato, onion, lettuce, burger sauce & spicy kadhai gravy.",
  "gochuchang burger":
    "Crispy veg patty layered with spicy Gochujang sauce, fresh lettuce, tomato, and onion, all inside a soft toasted bun.",
  "galaxy seal hero burger":
    "A juicy patty layered with crisp lettuce, fresh tomato, and crunchy onion, sealed in a soft bun for an out-of-this-world galaxy-inspired bite.",
  "orbit x paneer burger":
    "An Italian stuffed patty layered with crisp lettuce, tomato, onion, paneer and green chilli, sealed in a soft bun for a bold, flavour-packed bite.",
  "cosmic lava cheese burger":
    "A cheese spicy patty stacked with fresh lettuce and tomato, and cheese slice tucked into a soft toasted bun for a deliciously out-of-this-world bite.",
  "classic dipper burger":
    "A crispy patty stacked with fresh lettuce, onion, tomato, tucked into a soft bun with creamy cheese dip sauce, and crunchy nachos — dip in sauce, dip in nachos, and bite away.",
  "cheese dipper burger":
    "A crispy patty layered with fresh lettuce, tomato, and a bold ghost pepper sauce, tucked into a soft toasted bun for a fiery kick, served with sauce and crunchy nachos — just dip in sauce and nachos and bite away.",
  "veg momos":
    "Crispy golden bites stuffed with fresh veggies, bursting with flavor in every crunch!",
  "veg cheese momos":
    "Golden-fried pockets oozing with melty cheese and sweet corn.",
  "kurkure momos":
    "Juicy vegetable momos coated in a crunchy Kurkure-style crust and fried golden for a crispy, irresistible bite.",
  "classic salted fries":
    "Crispy and golden salted fries to satisfy your savory cravings.",
  "peri peri fries":
    "Elevate your fry experience with our Peri Peri Seasoned Fries, delivering a spicy and flavorful kick to satisfy your taste buds.",
  "peri peri cheese fries":
    "Elevate your fry experience with our Cheesy Seasoned Fries, featuring a creamy indulgence that's perfect for cheese lovers.",
  "dirty fries":
    "Loaded fries smothered in signature sauces and topped with chopped jalapenos for a flavor-packed sensation.",
  "onion rings 5 pcs":
    "Crispy golden-fried onion rings coated in a seasoned crunchy batter, delivering the perfect combination of sweetness and crunch.",
  "mint fries":
    "Golden crispy fries tossed in refreshing mint seasoning and aromatic herbs for a crunchy, zesty twist on classic fries.",
  "any classic burger meal":
    "Enjoy any classic burger of your choice served with crispy fries and a refreshing drink.",
  "any big bang burger meal":
    "Choose any Big Bang Burger packed with bold flavors, served with fries and a cool beverage.",
  "jr hero burger meal":
    "A deliciously patty burger with a soft bun, juicy patty, and fresh onions for the perfect classic bite.",
  "2 jr hero burger":
    "Double the fun with two Jr. Hero burgers, packed with soft buns, juicy patties, and crunchy onions.",
  "white sauce pasta":
    "Creamy, rich pasta tossed in a smooth Alfredo cheese sauce for the ultimate comfort bite.",
  "arrabiata pasta":
    "A bold and spicy pasta made with tangy tomato sauce and a hint of chilli for a fiery kick.",
  "pink sauce pasta":
    "The perfect blend of creamy Alfredo and tangy tomato sauce, creating a rich and balanced flavor.",
  "margherita pizza":
    "A timeless favorite with fresh tomato sauce and melted cheese on a perfectly baked crust.",
  "the veg overload pizza":
    "Packed with a generous mix of fresh veggies for a colorful and flavorful pizza experience.",
  "cheese heaven pizza":
    "Loaded with rich, gooey cheese for the ultimate cheesy indulgence in every bite.",
  "tandoori paneer pizza":
    "Pizza topped with smoky tandoori paneer, onions, capsicum, and a rich, cheesy layer of flavour-packed goodness with flavorful tandoori sauce.",
  "irish cold coffee":
    "A smooth, rich blend of coffee with a hint of Irish cream, perfectly chilled.",
  "classic cold coffee":
    "The perfect mix of sweet, bold, and creamy.",
  "hazlenut cold coffee":
    "A decadent blend of bold espresso, creamy milk, and irresistible hazelnut syrup, served over ice. A nutty, smooth treat!",
  "peach iced tea":
    "A refreshing iced tea infused with sweet peach flavor, perfectly chilled.",
  "kokum iced tea":
    "A cooling, tangy kokum drink inspired by coastal flavors, perfect to beat the heat.",
  "masala coke":
    "Classic Coke with a spicy masala kick for a bold, refreshing taste.",
  "lemon iced tea":
    "Refreshing brewed tea shaken with zesty lemon, sugar syrup, and ice for a perfectly sweet and citrusy cooler.",
  "oreo shake":
    "Chilled milk and creamy vanilla flavour blended with Oreo biscuits and cookie syrup for a rich shake loaded with Oreo goodness.",
  "chocolate shake":
    "Rich chocolate flavour coco gourmet blended with chilled milk and luscious chocolate syrup for a thick, creamy, and indulgent shake.",
  "blueberry shake":
    "Creamy blend of chilled milk, vanilla flavour, blueberry syrup, and juicy blueberry taste, finished with a deliciously smooth texture.",
  "strawberry oreo shake":
    "Creamy milk and vanilla frappe blended with juicy strawberry, crunchy Oreo biscuits, and strawberry syrup for a rich, fruity treat.",
  "chocolate brownie":
    "Rich, fudgy chocolate brownie with an indulgent, melt-in-the-mouth taste.",
};

/** Normalize an item name for tolerant matching across POS spelling drift. */
export function normalizeMenuName(name: string | undefined | null): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function lookupMenuDescription(name: string | undefined | null): string {
  const key = normalizeMenuName(name);
  if (!key) return "";
  return MENU_DESCRIPTIONS[key] ?? "";
}

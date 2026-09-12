import { describe, it, expect } from 'vitest';

export interface ModifierOption {
  id: string;
  name: string;
  pricePaise: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
}

export interface SelectedModifier {
  groupId: string;
  optionId: string;
  name: string;
  pricePaise: number;
}

export interface CustomizerProduct {
  id: string;
  name: string;
  basePricePaise: number;
  modifierGroups: ModifierGroup[];
  comboUpgradePaise?: number; // e.g. ₹89 combo (fries + drink) = 8900 paise
}

export interface CustomizationState {
  productId: string;
  selectedModifiers: SelectedModifier[];
  isComboUpgraded: boolean;
  quantity: number;
  specialInstructions?: string;
}

/**
 * Validates whether all mandatory modifier groups have valid selections within bounds.
 */
export function validateCustomizationSelection(
  product: CustomizerProduct,
  selectedModifiers: SelectedModifier[]
): { isValid: boolean; missingGroups: string[] } {
  const missingGroups: string[] = [];

  for (const group of product.modifierGroups) {
    const selectedInGroup = selectedModifiers.filter((m) => m.groupId === group.id);

    if (selectedInGroup.length < group.minSelect) {
      missingGroups.push(group.name);
    } else if (selectedInGroup.length > group.maxSelect) {
      missingGroups.push(`${group.name} (exceeds max ${group.maxSelect})`);
    }
  }

  return {
    isValid: missingGroups.length === 0,
    missingGroups,
  };
}

/**
 * Calculates total line item price in paise.
 */
export function calculateCustomizedItemTotalPaise(
  product: CustomizerProduct,
  state: CustomizationState
): number {
  let unitPricePaise = product.basePricePaise;

  for (const mod of state.selectedModifiers) {
    unitPricePaise += mod.pricePaise;
  }

  if (state.isComboUpgraded && product.comboUpgradePaise) {
    unitPricePaise += product.comboUpgradePaise;
  }

  return unitPricePaise * Math.max(1, state.quantity);
}

/**
 * Generates a deterministic hash/key representing the customized configuration.
 */
export function generateCustomizationFingerprint(
  productId: string,
  selectedModifiers: SelectedModifier[],
  isComboUpgraded: boolean,
  specialInstructions = ''
): string {
  const sortedMods = [...selectedModifiers]
    .sort((a, b) => `${a.groupId}:${a.optionId}`.localeCompare(`${b.groupId}:${b.optionId}`))
    .map((m) => `${m.groupId}:${m.optionId}`)
    .join('|');

  const comboFlag = isComboUpgraded ? 'combo:1' : 'combo:0';
  const instructions = specialInstructions.trim().toLowerCase();

  return `${productId}#${sortedMods}#${comboFlag}#${instructions}`;
}

describe('Customer App — Product Customizer & Modifier Engine Suite', () => {
  const sampleBurger: CustomizerProduct = {
    id: 'prod_truffle_melt',
    name: 'Double Truffle Melt',
    basePricePaise: 29900, // ₹299.00
    comboUpgradePaise: 8900, // ₹89.00 (Fries + Coke)
    modifierGroups: [
      {
        id: 'grp_bun',
        name: 'Choose Your Bun',
        minSelect: 1,
        maxSelect: 1,
        options: [
          { id: 'opt_brioche', name: 'Toasted Brioche Bun', pricePaise: 0 },
          { id: 'opt_gluten_free', name: 'Gluten-Free Bun', pricePaise: 4000 }, // +₹40
          { id: 'opt_lettuce', name: 'Crisp Lettuce Wrap', pricePaise: 0 },
        ],
      },
      {
        id: 'grp_cheese',
        name: 'Extra Cheese & Toppings',
        minSelect: 0,
        maxSelect: 3,
        options: [
          { id: 'opt_cheddar', name: 'Smoked Cheddar Slice', pricePaise: 3000 }, // +₹30
          { id: 'opt_jalapenos', name: 'Pickled Jalapenos', pricePaise: 2000 }, // +₹20
          { id: 'opt_truffle_mayo', name: 'Extra Truffle Mayo', pricePaise: 3500 }, // +₹35
          { id: 'opt_caramelized_onions', name: 'Caramelized Onions', pricePaise: 2500 }, // +₹25
        ],
      },
    ],
  };

  it('fails validation when mandatory bun selection is missing', () => {
    const state: SelectedModifier[] = [];
    const validation = validateCustomizationSelection(sampleBurger, state);

    expect(validation.isValid).toBe(false);
    expect(validation.missingGroups).toContain('Choose Your Bun');
  });

  it('passes validation when mandatory bun is chosen and optional toppings are within max limit', () => {
    const state: SelectedModifier[] = [
      { groupId: 'grp_bun', optionId: 'opt_brioche', name: 'Toasted Brioche Bun', pricePaise: 0 },
      { groupId: 'grp_cheese', optionId: 'opt_cheddar', name: 'Smoked Cheddar Slice', pricePaise: 3000 },
      { groupId: 'grp_cheese', optionId: 'opt_jalapenos', name: 'Pickled Jalapenos', pricePaise: 2000 },
    ];

    const validation = validateCustomizationSelection(sampleBurger, state);
    expect(validation.isValid).toBe(true);
    expect(validation.missingGroups).toHaveLength(0);
  });

  it('fails validation if toppings exceed max selection limit', () => {
    const state: SelectedModifier[] = [
      { groupId: 'grp_bun', optionId: 'opt_brioche', name: 'Toasted Brioche Bun', pricePaise: 0 },
      { groupId: 'grp_cheese', optionId: 'opt_cheddar', name: 'Smoked Cheddar Slice', pricePaise: 3000 },
      { groupId: 'grp_cheese', optionId: 'opt_jalapenos', name: 'Pickled Jalapenos', pricePaise: 2000 },
      { groupId: 'grp_cheese', optionId: 'opt_truffle_mayo', name: 'Extra Truffle Mayo', pricePaise: 3500 },
      { groupId: 'grp_cheese', optionId: 'opt_caramelized_onions', name: 'Caramelized Onions', pricePaise: 2500 }, // 4th topping (max is 3)
    ];

    const validation = validateCustomizationSelection(sampleBurger, state);
    expect(validation.isValid).toBe(false);
    expect(validation.missingGroups[0]).toContain('exceeds max 3');
  });

  it('calculates dynamic pricing correctly with base price, modifiers, combo upgrade, and quantity', () => {
    const customState: CustomizationState = {
      productId: sampleBurger.id,
      quantity: 2,
      isComboUpgraded: true, // +₹89
      selectedModifiers: [
        { groupId: 'grp_bun', optionId: 'opt_gluten_free', name: 'Gluten-Free Bun', pricePaise: 4000 }, // +₹40
        { groupId: 'grp_cheese', optionId: 'opt_cheddar', name: 'Smoked Cheddar Slice', pricePaise: 3000 }, // +₹30
      ],
    };

    // Unit price = 299 + 40 + 30 + 89 = 458 (45,800 paise)
    // 2 Quantity = 91,600 paise (₹916.00)
    const totalPaise = calculateCustomizedItemTotalPaise(sampleBurger, customState);
    expect(totalPaise).toBe(91600);
  });

  it('generates identical fingerprints for same customizations in different selection orders to merge in cart', () => {
    const modsOrder1: SelectedModifier[] = [
      { groupId: 'grp_bun', optionId: 'opt_brioche', name: 'Brioche', pricePaise: 0 },
      { groupId: 'grp_cheese', optionId: 'opt_cheddar', name: 'Cheddar', pricePaise: 3000 },
      { groupId: 'grp_cheese', optionId: 'opt_jalapenos', name: 'Jalapenos', pricePaise: 2000 },
    ];

    const modsOrder2: SelectedModifier[] = [
      { groupId: 'grp_cheese', optionId: 'opt_jalapenos', name: 'Jalapenos', pricePaise: 2000 },
      { groupId: 'grp_bun', optionId: 'opt_brioche', name: 'Brioche', pricePaise: 0 },
      { groupId: 'grp_cheese', optionId: 'opt_cheddar', name: 'Cheddar', pricePaise: 3000 },
    ];

    const fp1 = generateCustomizationFingerprint('prod_truffle_melt', modsOrder1, true, 'extra crisp');
    const fp2 = generateCustomizationFingerprint('prod_truffle_melt', modsOrder2, true, 'extra crisp');

    expect(fp1).toBe(fp2);

    // Different instruction or different combo status creates a different fingerprint
    const fp3 = generateCustomizationFingerprint('prod_truffle_melt', modsOrder1, false, 'extra crisp');
    expect(fp1).not.toBe(fp3);
  });
});

// =============================================================================
// Unit Tests — Business Logic Calculations
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  calculateYieldPct,
  getYieldIndicator,
  calculateShiftYield,
  calculateBeratPerBatangGram,
  calculateTotalBatang,
  calculateWasteTotalKg,
  calculateWasteRatio,
  calculateInventoryAgeInDays,
  getInventoryAgeIndicator,
  type YieldRange,
} from "@/lib/calc";

// =============================================================================
// calculateYieldPct
// =============================================================================

describe("calculateYieldPct", () => {
  it("should return correct percentage for normal input", () => {
    expect(calculateYieldPct(16.85, 15.20)).toBe(110.86);
  });

  it("should return correct percentage for whole numbers", () => {
    expect(calculateYieldPct(110, 100)).toBe(110.0);
  });

  it("should handle decimal precision to 2 places", () => {
    expect(calculateYieldPct(33.33, 30)).toBe(111.1);
  });

  it("should throw if tsgWeightKg is 0", () => {
    expect(() => calculateYieldPct(10, 0)).toThrow("DIVIDE_BY_ZERO");
  });

  it("should throw if tsgWeightKg is negative", () => {
    expect(() => calculateYieldPct(10, -5)).toThrow("DIVIDE_BY_ZERO");
  });

  it("should handle very small weights", () => {
    expect(calculateYieldPct(0.5, 0.5)).toBe(100.0);
  });

  it("should handle typical 29-30 kg boks scenario", () => {
    // Real example: TSG 29.70 kg → output 33.15 kg
    expect(calculateYieldPct(33.15, 29.7)).toBe(111.62);
  });
});

// =============================================================================
// getYieldIndicator
// =============================================================================

describe("getYieldIndicator", () => {
  const range: YieldRange = { min: 110, max: 114 };

  it("should return NORMAL when yield is within range (lower bound)", () => {
    expect(getYieldIndicator(110, range)).toBe("NORMAL");
  });

  it("should return NORMAL when yield is within range (upper bound)", () => {
    expect(getYieldIndicator(114, range)).toBe("NORMAL");
  });

  it("should return NORMAL when yield is in middle of range", () => {
    expect(getYieldIndicator(112, range)).toBe("NORMAL");
  });

  it("should return WARNING when yield is below min", () => {
    expect(getYieldIndicator(109.99, range)).toBe("WARNING");
  });

  it("should return WARNING when yield is above max", () => {
    expect(getYieldIndicator(114.01, range)).toBe("WARNING");
  });

  it("should return WARNING for extreme yield", () => {
    expect(getYieldIndicator(353, range)).toBe("WARNING");
  });
});

// =============================================================================
// calculateShiftYield
// =============================================================================

describe("calculateShiftYield", () => {
  it("should calculate shift yield correctly from multiple boxes", () => {
    const result = calculateShiftYield({
      boxes: [
        { outputWeightKg: 33.15, tsgWeightKg: 29.7 },
        { outputWeightKg: 33.3, tsgWeightKg: 29.8 },
        { outputWeightKg: 33.1, tsgWeightKg: 29.75 },
      ],
    });
    // Total output: 99.55, Total TSG: 89.25 → 111.54%
    expect(result).toBe(111.54);
  });

  it("should return 0 for empty boxes", () => {
    const result = calculateShiftYield({ boxes: [] });
    expect(result).toBe(0);
  });

  it("should handle single box", () => {
    const result = calculateShiftYield({
      boxes: [{ outputWeightKg: 33, tsgWeightKg: 30 }],
    });
    expect(result).toBe(110.0);
  });
});

// =============================================================================
// calculateBeratPerBatangGram
// =============================================================================

describe("calculateBeratPerBatangGram", () => {
  it("should calculate correctly for standard HLP output", () => {
    // 820 packs × 20 batang + 147 reject = 16547 total batang
    // batch 16.5 kg → 16500 gram / 16547 batang
    const result = calculateBeratPerBatangGram(16.5, 820, 20, 147);
    expect(result).toBeCloseTo(0.997, 3);
  });

  it("should handle zero reject", () => {
    const result = calculateBeratPerBatangGram(16.5, 820, 20, 0);
    expect(result).toBeCloseTo(1.006, 3);
  });

  it("should throw if totalBatang is 0", () => {
    expect(() => calculateBeratPerBatangGram(10, 0, 20, 0)).toThrow(
      "DIVIDE_BY_ZERO"
    );
  });

  it("should handle high-reject scenario", () => {
    const result = calculateBeratPerBatangGram(16.5, 500, 20, 300);
    // totalBatang = 500*20 + 300 = 10300
    // 16500 / 10300 = 1.602
    expect(result).toBeCloseTo(1.602, 3);
  });
});

// =============================================================================
// calculateTotalBatang
// =============================================================================

describe("calculateTotalBatang", () => {
  it("should calculate total correctly", () => {
    expect(calculateTotalBatang(820, 20, 147)).toBe(16547);
  });

  it("should handle zero values", () => {
    expect(calculateTotalBatang(0, 20, 0)).toBe(0);
  });
});

// =============================================================================
// calculateWasteTotalKg + calculateWasteRatio
// =============================================================================

describe("calculateWasteTotalKg", () => {
  it("should sum all waste categories", () => {
    const total = calculateWasteTotalKg([
      { kg: 0.85 },
      { kg: 10.3 },
      { kg: 10.8 },
      { kg: 36.55 },
    ]);
    expect(total).toBe(58.5);
  });

  it("should return 0 for empty array", () => {
    expect(calculateWasteTotalKg([])).toBe(0);
  });
});

describe("calculateWasteRatio", () => {
  it("should calculate waste as percentage of TSG", () => {
    // 58.5 kg waste / 1420.5 kg TSG = 4.12%
    expect(calculateWasteRatio(58.5, 1420.5)).toBe(4.12);
  });

  it("should return 0 when TSG is 0", () => {
    expect(calculateWasteRatio(10, 0)).toBe(0);
  });

  it("should return 0 when TSG is negative", () => {
    expect(calculateWasteRatio(10, -5)).toBe(0);
  });
});

// =============================================================================
// calculateInventoryAgeInDays + getInventoryAgeIndicator
// =============================================================================

describe("calculateInventoryAgeInDays", () => {
  it("should return 0 for today", () => {
    const today = new Date();
    expect(calculateInventoryAgeInDays(today)).toBe(0);
  });

  it("should return correct age for older date", () => {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    expect(calculateInventoryAgeInDays(fiveDaysAgo)).toBe(5);
  });

  it("should return correct age for 30-day old inventory", () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const age = calculateInventoryAgeInDays(thirtyDaysAgo);
    expect(age).toBeGreaterThanOrEqual(29);
    expect(age).toBeLessThanOrEqual(31);
  });
});

describe("getInventoryAgeIndicator", () => {
  it("should return NORMAL for age 0-14", () => {
    expect(getInventoryAgeIndicator(0)).toBe("NORMAL");
    expect(getInventoryAgeIndicator(7)).toBe("NORMAL");
    expect(getInventoryAgeIndicator(14)).toBe("NORMAL");
  });

  it("should return CAUTION for age 15-30", () => {
    expect(getInventoryAgeIndicator(15)).toBe("CAUTION");
    expect(getInventoryAgeIndicator(22)).toBe("CAUTION");
    expect(getInventoryAgeIndicator(30)).toBe("CAUTION");
  });

  it("should return ALERT for age > 30", () => {
    expect(getInventoryAgeIndicator(31)).toBe("ALERT");
    expect(getInventoryAgeIndicator(60)).toBe("ALERT");
    expect(getInventoryAgeIndicator(365)).toBe("ALERT");
  });
});

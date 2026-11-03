import { describe, expect, it } from "vitest";
import { nearestStoreTitle } from "../src/features/stores/components/NearestStoreSheet";

// The iOS smoke showed "You're near Burgonomics Burgonomics DEMO": store names
// already carry the brand, and the sheet prefixed it again.
describe("nearest store sheet title", () => {
  it("does not repeat the brand when the store name already has it", () => {
    expect(nearestStoreTitle("Burgonomics DEMO")).toBe("You're near Burgonomics DEMO");
    expect(nearestStoreTitle("Burgonomics - Rajkot")).toBe("You're near Burgonomics - Rajkot");
    expect(nearestStoreTitle("BURGONOMICS Ayodhya")).toBe("You're near BURGONOMICS Ayodhya");
  });

  it("adds the brand to a bare outlet name", () => {
    expect(nearestStoreTitle("Satellite")).toBe("You're near Burgonomics Satellite");
  });
});

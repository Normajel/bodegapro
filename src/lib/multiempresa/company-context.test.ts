import { afterEach, describe, expect, it, vi } from "vitest";
import { getActiveCompany, publishActiveCompany, subscribeActiveCompany } from "./company-context";

afterEach(() => publishActiveCompany(null));

describe("single active-company context", () => {
  it("starts empty and shares a single selected company", () => {
    publishActiveCompany(null);
    expect(getActiveCompany()).toBeNull();
    publishActiveCompany("company-a");
    expect(getActiveCompany()).toBe("company-a");
    publishActiveCompany("company-b");
    expect(getActiveCompany()).toBe("company-b");
  });

  it("notifies subscribers on changes and clears on sign-out", () => {
    publishActiveCompany(null);
    const listener = vi.fn();
    const unsubscribe = subscribeActiveCompany(listener);
    publishActiveCompany("company-a");
    publishActiveCompany("company-a");
    publishActiveCompany(null);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getActiveCompany()).toBeNull();
    unsubscribe();
    publishActiveCompany("company-b");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

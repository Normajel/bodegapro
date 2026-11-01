import { describe, expect, it } from "vitest";
import {
  panelDisplayName,
  validatePanelName,
  validatePanelLogoFile,
  PANEL_LOGO_INPUT_MAX,
} from "@/lib/panel-branding";

describe("dashboard company identity validation", () => {
  it("normalizes names and permits exactly 20 characters", () => {
    expect(validatePanelName("  Empresa José  ")).toBe("Empresa José");
    expect(validatePanelName("e\u0301")).toBe("é");
    expect(validatePanelName("A".repeat(20))).toHaveLength(20);
    expect(() => validatePanelName("A".repeat(21))).toThrow("20");
  });
  it("uses the default identity for an empty name", () => {
    expect(panelDisplayName(null)).toBe("BodegaPro");
    expect(panelDisplayName("  ")).toBe("BodegaPro");
    expect(panelDisplayName("Mi Empresa")).toBe("Mi Empresa");
  });
  it("accepts raster images within the upload limit", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(() => validatePanelLogoFile({ type, size: PANEL_LOGO_INPUT_MAX })).not.toThrow();
    }
    expect(() =>
      validatePanelLogoFile({ type: "image/png", size: PANEL_LOGO_INPUT_MAX + 1 }),
    ).toThrow("2 MB");
    expect(() => validatePanelLogoFile({ type: "image/png", size: 0 })).toThrow();
    expect(() => validatePanelLogoFile({ type: "image/svg+xml", size: 10 })).toThrow();
    expect(() => validatePanelLogoFile({ type: "text/html", size: 10 })).toThrow();
  });
});

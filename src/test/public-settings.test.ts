import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, publicSettingsColumns } from "../lib/settings.functions";

describe("public app settings", () => {
  it("never selects the Nekpayment credentials for the public getAppSettings endpoint", () => {
    const columns = Object.keys(publicSettingsColumns);

    expect(columns).not.toContain("nek_api_key");
    expect(columns).not.toContain("nek_secret_key");
  });

  it("publishes exactly the fields the client defaults describe", () => {
    expect(Object.keys(publicSettingsColumns).sort()).toEqual(
      Object.keys(DEFAULT_APP_SETTINGS).sort(),
    );
  });
});

import { describe, expect, it } from "vitest";

import { siteConfig } from "@/lib/site";

describe("siteConfig", () => {
  it("exposes the TidyMate brand copy", () => {
    expect(siteConfig.name).toBe("TidyMate");
    expect(siteConfig.tagline).toBe(
      "Let local AI clean up the files you keep ignoring.",
    );
  });
});

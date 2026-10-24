import { describe, expect, it } from "vitest";

import { isLoopbackRequest, parseHostname } from "@/lib/server/local-request";

describe("parseHostname", () => {
  it.each([
    ["localhost:3000", "localhost"],
    ["LOCALHOST", "localhost"],
    ["127.0.0.1:3000", "127.0.0.1"],
    ["[::1]:3000", "::1"],
    ["[::1]", "::1"],
    ["example.com:443", "example.com"],
  ])("%s → %s", (host, expected) => {
    expect(parseHostname(host)).toBe(expected);
  });
});

describe("isLoopbackRequest", () => {
  it.each(["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "localhost"])(
    "accepts host %s",
    (host) => {
      expect(isLoopbackRequest(new Headers({ host }))).toBe(true);
    },
  );

  it.each([
    "192.168.1.20:3000",
    "0.0.0.0:3000",
    "tidymate.example.com",
    "localhost.attacker.test",
    "127.0.0.1.nip.io:3000",
  ])("rejects host %s", (host) => {
    expect(isLoopbackRequest(new Headers({ host }))).toBe(false);
  });

  it("rejects a missing host header", () => {
    expect(isLoopbackRequest(new Headers())).toBe(false);
  });

  it("rejects requests forwarded for a non-loopback host", () => {
    expect(
      isLoopbackRequest(
        new Headers({ host: "localhost:3000", "x-forwarded-host": "evil.test" }),
      ),
    ).toBe(false);
    expect(
      isLoopbackRequest(
        new Headers({ host: "localhost:3000", "x-forwarded-host": "localhost:3000, evil.test" }),
      ),
    ).toBe(false);
  });
});

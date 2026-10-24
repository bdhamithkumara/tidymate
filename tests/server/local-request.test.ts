import { describe, expect, it } from "vitest";

import { isLoopbackRequest, isSameOriginRequest, parseHostname } from "@/lib/server/local-request";

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

describe("isSameOriginRequest", () => {
  const base = {
    host: "localhost:3000",
    origin: "http://localhost:3000",
    "content-type": "application/json",
    "sec-fetch-site": "same-origin",
  };

  it("accepts a same-origin JSON request", () => {
    expect(isSameOriginRequest(new Headers(base))).toBe(true);
    expect(isSameOriginRequest(new Headers({ ...base, "content-type": "application/json; charset=utf-8" }))).toBe(true);
  });

  it("accepts a non-browser JSON request without Origin or Sec-Fetch-Site", () => {
    expect(isSameOriginRequest(new Headers({ host: "localhost:3000", "content-type": "application/json" }))).toBe(true);
  });

  it.each([
    ["a foreign origin", { origin: "http://evil.test" }],
    ["a different port", { origin: "http://localhost:4000" }],
    ["a malformed origin", { origin: "not a url" }],
    ["a cross-site fetch", { "sec-fetch-site": "cross-site" }],
    ["a same-site fetch", { "sec-fetch-site": "same-site" }],
    ["a form-encoded body", { "content-type": "application/x-www-form-urlencoded" }],
    ["a multipart body", { "content-type": "multipart/form-data; boundary=x" }],
    ["a text/plain body", { "content-type": "text/plain" }],
  ])("rejects %s", (_label, override) => {
    expect(isSameOriginRequest(new Headers({ ...base, ...override }))).toBe(false);
  });

  it("rejects a request with no content type", () => {
    const headers = new Headers(base);
    headers.delete("content-type");
    expect(isSameOriginRequest(headers)).toBe(false);
  });
});

import "server-only";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/** Hostname part of a `Host` header value, without port or IPv6 brackets. */
export function parseHostname(host: string): string {
  const value = host.trim().toLowerCase();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end === -1 ? value : value.slice(1, end);
  }
  return value.split(":")[0] ?? "";
}

/**
 * True only when every host the request claims to be addressed to is a
 * loopback name. This rejects requests that reached the server through a LAN
 * address, a proxy, or a DNS-rebinding domain.
 */
export function isLoopbackRequest(requestHeaders: Headers): boolean {
  const hosts = [requestHeaders.get("host"), requestHeaders.get("x-forwarded-host")]
    .filter((value): value is string => value !== null)
    .flatMap((value) => value.split(","));

  return (
    hosts.length > 0 &&
    hosts.every((host) => LOOPBACK_HOSTNAMES.has(parseHostname(host)))
  );
}

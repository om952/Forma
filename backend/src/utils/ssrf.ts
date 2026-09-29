/**
 * Outbound-request guard for user-supplied webhook URLs.
 *
 * Webhook destinations are chosen by tenants but fetched by our server, from
 * inside our network. Without a check, anyone could point a webhook at
 * `http://169.254.169.254/` (cloud instance metadata), at a service reachable
 * only from the private subnet, or back at Forma's own API — and read the
 * response status from the delivery log. That is server-side request forgery.
 *
 * The address rules are kept as pure functions so they are testable without
 * DNS or a network, which is where the real risk of an off-by-one lives.
 */

import dns from "node:dns/promises";
import net from "node:net";

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

/** Maximum redirect hops followed during delivery. */
export const MAX_WEBHOOK_REDIRECTS = 3;

const ipv4ToInt = (ip: string): number | null => {
  const parts = ip.split(".");

  if (parts.length !== 4) return null;

  let value = 0;

  for (const part of parts) {
    // Reject "01", "1e2", "0x7f" and friends — only plain decimal octets. Node's
    // resolver and libc disagree on exotic formats, and the gap between the two
    // is exactly where a bypass would hide.
    if (!/^\d{1,3}$/.test(part)) return null;

    const octet = Number(part);
    if (octet > 255) return null;

    value = value * 256 + octet;
  }

  return value;
};

/** CIDR blocks that must never be reachable from a webhook delivery. */
const BLOCKED_IPV4_RANGES: Array<{ cidr: string; label: string }> = [
  { cidr: "0.0.0.0/8", label: "this network" },
  { cidr: "10.0.0.0/8", label: "private network" },
  { cidr: "100.64.0.0/10", label: "carrier-grade NAT" },
  { cidr: "127.0.0.0/8", label: "loopback" },
  { cidr: "169.254.0.0/16", label: "link-local / cloud metadata" },
  { cidr: "172.16.0.0/12", label: "private network" },
  { cidr: "192.0.0.0/24", label: "IETF protocol assignments" },
  { cidr: "192.168.0.0/16", label: "private network" },
  { cidr: "198.18.0.0/15", label: "benchmarking" },
  { cidr: "224.0.0.0/4", label: "multicast" },
  { cidr: "240.0.0.0/4", label: "reserved" },
];

const parsedIpv4Ranges = BLOCKED_IPV4_RANGES.map(({ cidr, label }) => {
  const [base = "", bitsRaw = "0"] = cidr.split("/");
  const bits = Number(bitsRaw);
  const baseInt = ipv4ToInt(base) ?? 0;
  // `>>> 0` keeps the mask unsigned; a /0 would otherwise shift into -1.
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;

  return { baseInt: (baseInt & mask) >>> 0, mask, label };
});

/** Why this IPv4 address is off-limits, or null if it is publicly routable. */
export const blockedIpv4Reason = (ip: string): string | null => {
  const value = ipv4ToInt(ip);

  if (value === null) return "malformed IPv4 address";

  for (const range of parsedIpv4Ranges) {
    if (((value & range.mask) >>> 0) === range.baseInt) return range.label;
  }

  return null;
};

/** Why this IPv6 address is off-limits, or null if it is publicly routable. */
export const blockedIpv6Reason = (ip: string): string | null => {
  const normalized = ip.toLowerCase().split("%")[0] ?? "";

  // IPv4-mapped (::ffff:127.0.0.1) and IPv4-compatible forms tunnel the whole
  // v4 space through v6, so they have to be judged by the v4 rules.
  const mapped = /^(?:::ffff:|::)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  if (mapped?.[1]) return blockedIpv4Reason(mapped[1]);

  if (normalized === "::") return "unspecified address";
  if (normalized === "::1") return "loopback";

  // fc00::/7 — unique local addresses.
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return "unique local address";
  // fe80::/10 — link-local.
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return "link-local";
  // ff00::/8 — multicast.
  if (/^ff[0-9a-f]{2}:/.test(normalized)) return "multicast";

  return null;
};

/** Why this address is off-limits, or null if it is publicly routable. */
export const blockedAddressReason = (ip: string): string | null => {
  const family = net.isIP(ip);

  if (family === 4) return blockedIpv4Reason(ip);
  if (family === 6) return blockedIpv6Reason(ip);

  return "not an IP address";
};

/**
 * Structural checks that need no network: scheme, credentials, hostname shape.
 * Runs before DNS so an obviously bad URL is rejected without a lookup.
 *
 * @throws {BlockedUrlError}
 */
export const parseWebhookUrl = (raw: string): URL => {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("Webhook URL is not a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError(
      `Webhook URL must use http or https, not ${url.protocol.replace(":", "")}`
    );
  }

  // Credentials in the URL would be forwarded to whatever the hostname resolves
  // to, and they show up in our logs. Neither is acceptable.
  if (url.username || url.password) {
    throw new BlockedUrlError("Webhook URL must not contain credentials");
  }

  if (!url.hostname) {
    throw new BlockedUrlError("Webhook URL must include a hostname");
  }

  // `localhost` never reaches DNS on some hosts, so catch the name directly
  // rather than relying on resolution to surface 127.0.0.1.
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new BlockedUrlError("Webhook URL must not point at localhost");
  }

  return url;
};

/**
 * Resolves the hostname and rejects the URL if *any* returned address is
 * private. Every address is checked, not just the first: a hostname that
 * resolves to one public and one internal address is still a way in.
 *
 * Residual risk: the resolution below and the socket the HTTP client later
 * opens are two separate lookups, so a DNS entry with a very short TTL can in
 * principle change between them (DNS rebinding). Closing that fully means
 * pinning the validated IP into the connection itself via a custom agent —
 * worth doing if webhooks ever carry secrets, but out of scope for this pass.
 *
 * @throws {BlockedUrlError}
 */
export const assertPublicHost = async (url: URL): Promise<void> => {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  // An IP literal has nothing to resolve — judge it as written.
  if (net.isIP(hostname)) {
    const reason = blockedAddressReason(hostname);

    if (reason) {
      throw new BlockedUrlError(
        `Webhook URL resolves to a non-public address (${reason})`
      );
    }

    return;
  }

  let addresses: Array<{ address: string }>;

  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new BlockedUrlError(`Webhook hostname could not be resolved: ${hostname}`);
  }

  if (addresses.length === 0) {
    throw new BlockedUrlError(`Webhook hostname could not be resolved: ${hostname}`);
  }

  for (const { address } of addresses) {
    const reason = blockedAddressReason(address);

    if (reason) {
      throw new BlockedUrlError(
        `Webhook URL resolves to a non-public address (${reason})`
      );
    }
  }
};

/**
 * Full check — structure then DNS. Use this everywhere a user-supplied URL is
 * about to be stored or fetched.
 *
 * @throws {BlockedUrlError}
 */
export const assertDeliverableUrl = async (raw: string): Promise<URL> => {
  const url = parseWebhookUrl(raw);
  await assertPublicHost(url);
  return url;
};

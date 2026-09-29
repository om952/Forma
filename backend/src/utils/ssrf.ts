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

/**
 * Expands an IPv6 address into its eight 16-bit groups, or null if malformed.
 *
 * The rules below must see the address as numbers, not text: one address has
 * many spellings. `new URL()` rewrites `[::ffff:127.0.0.1]` to `::ffff:7f00:1`,
 * so a pattern written against the dotted form never sees what we actually
 * connect to.
 */
const ipv6ToHextets = (ip: string): number[] | null => {
  let text = ip;

  // A trailing dotted quad (::ffff:1.2.3.4) stands for the last two groups.
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);

  if (tail.includes(".")) {
    const v4 = ipv4ToInt(tail);
    if (v4 === null) return null;

    text = `${text.slice(0, lastColon + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;

  const groups = (part: string) => (part === "" ? [] : part.split(":"));
  const head = groups(halves[0] ?? "");
  const rest = halves.length === 2 ? groups(halves[1] ?? "") : [];

  if (halves.length === 1 && head.length !== 8) return null;
  if (halves.length === 2 && head.length + rest.length > 7) return null;

  const zeros: string[] = Array(8 - head.length - rest.length).fill("0");
  const hextets: number[] = [];

  for (const group of [...head, ...zeros, ...rest]) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    hextets.push(parseInt(group, 16));
  }

  return hextets;
};

/** Dotted form of the IPv4 address carried in two 16-bit groups. */
const embeddedIpv4 = (high: number, low: number): string =>
  `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;

/** Why this IPv6 address is off-limits, or null if it is publicly routable. */
export const blockedIpv6Reason = (ip: string): string | null => {
  const normalized = ip.toLowerCase().split("%")[0] ?? "";
  const h = ipv6ToHextets(normalized);

  if (!h) return "malformed IPv6 address";

  const [h0 = 0, h1 = 0, h2 = 0, , h4 = 0, h5 = 0, h6 = 0, h7 = 0] = h;
  const zeroUntil = (end: number) => h.slice(0, end).every((group) => group === 0);

  if (zeroUntil(8)) return "unspecified address";
  if (zeroUntil(7) && h7 === 1) return "loopback";

  // These prefixes carry a whole IPv4 address inside the IPv6 one, and the
  // host or a gateway on the path will deliver to that v4 address. They have
  // to be judged by the v4 rules or they become a tunnel around them.
  // ::ffff:0:0/96 — IPv4-mapped.
  if (zeroUntil(5) && h5 === 0xffff) return blockedIpv4Reason(embeddedIpv4(h6, h7));
  // ::/96 — IPv4-compatible (deprecated).
  if (zeroUntil(6)) return blockedIpv4Reason(embeddedIpv4(h6, h7));
  // ::ffff:0:0:0/96 — IPv4-translated (RFC 2765).
  if (zeroUntil(4) && h4 === 0xffff && h5 === 0) {
    return blockedIpv4Reason(embeddedIpv4(h6, h7));
  }
  // 64:ff9b::/96 — NAT64 well-known prefix.
  if (h0 === 0x64 && h1 === 0xff9b && h.slice(2, 6).every((group) => group === 0)) {
    return blockedIpv4Reason(embeddedIpv4(h6, h7));
  }
  // 2002::/16 — 6to4; the v4 address sits right after the prefix.
  if (h0 === 0x2002) return blockedIpv4Reason(embeddedIpv4(h1, h2));

  // 64:ff9b:1::/48 — NAT64 for local use only.
  if (h0 === 0x64 && h1 === 0xff9b && h2 === 1) return "local-use NAT64";
  // 2001::/32 — Teredo. The client address is obfuscated, and no legitimate
  // webhook endpoint lives behind a Teredo tunnel, so refuse the whole range.
  if (h0 === 0x2001 && h1 === 0) return "Teredo tunnel";
  // 2001:db8::/32 — documentation.
  if (h0 === 0x2001 && h1 === 0xdb8) return "documentation range";
  // 100::/64 — discard-only.
  if (h0 === 0x100 && h.slice(1, 4).every((group) => group === 0)) return "discard-only";
  // fc00::/7 — unique local addresses.
  if ((h0 & 0xfe00) === 0xfc00) return "unique local address";
  // fe80::/10 — link-local.
  if ((h0 & 0xffc0) === 0xfe80) return "link-local";
  // fec0::/10 — site-local (deprecated, but still routed internally by some).
  if ((h0 & 0xffc0) === 0xfec0) return "site-local";
  // ff00::/8 — multicast.
  if ((h0 & 0xff00) === 0xff00) return "multicast";

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

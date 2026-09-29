import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BlockedUrlError,
  assertDeliverableUrl,
  blockedAddressReason,
  blockedIpv4Reason,
  blockedIpv6Reason,
  parseWebhookUrl,
} from "./ssrf";

describe("blockedIpv4Reason", () => {
  it("allows publicly routable addresses", () => {
    assert.equal(blockedIpv4Reason("8.8.8.8"), null);
    assert.equal(blockedIpv4Reason("1.1.1.1"), null);
    assert.equal(blockedIpv4Reason("52.94.236.248"), null);
  });

  it("blocks the cloud metadata endpoint", () => {
    assert.equal(blockedIpv4Reason("169.254.169.254"), "link-local / cloud metadata");
  });

  it("blocks loopback and private ranges", () => {
    assert.equal(blockedIpv4Reason("127.0.0.1"), "loopback");
    assert.equal(blockedIpv4Reason("10.0.0.5"), "private network");
    assert.equal(blockedIpv4Reason("192.168.1.1"), "private network");
    assert.equal(blockedIpv4Reason("172.16.0.1"), "private network");
    assert.equal(blockedIpv4Reason("172.31.255.255"), "private network");
  });

  // 172.16/12 covers 172.16-172.31 only; the neighbours are public and a naive
  // "starts with 172." check would wrongly reject them.
  it("does not over-block around the 172.16/12 boundary", () => {
    assert.equal(blockedIpv4Reason("172.15.255.255"), null);
    assert.equal(blockedIpv4Reason("172.32.0.0"), null);
  });

  it("blocks the unspecified address and multicast", () => {
    assert.equal(blockedIpv4Reason("0.0.0.0"), "this network");
    assert.equal(blockedIpv4Reason("224.0.0.1"), "multicast");
    assert.equal(blockedIpv4Reason("255.255.255.255"), "reserved");
  });

  // Non-decimal octets resolve differently across libc and Node, so anything
  // that is not a plain decimal quad is refused rather than guessed at.
  it("rejects non-decimal and malformed octets", () => {
    assert.equal(blockedIpv4Reason("0x7f.0.0.1"), "malformed IPv4 address");
    assert.equal(blockedIpv4Reason("127.1"), "malformed IPv4 address");
    assert.equal(blockedIpv4Reason("999.0.0.1"), "malformed IPv4 address");
  });
});

describe("blockedIpv6Reason", () => {
  it("allows publicly routable addresses", () => {
    assert.equal(blockedIpv6Reason("2606:4700:4700::1111"), null);
  });

  it("blocks loopback, ULA, link-local and multicast", () => {
    assert.equal(blockedIpv6Reason("::1"), "loopback");
    assert.equal(blockedIpv6Reason("fd00::1"), "unique local address");
    assert.equal(blockedIpv6Reason("fe80::1"), "link-local");
    assert.equal(blockedIpv6Reason("ff02::1"), "multicast");
  });

  // The v4 space is reachable through v6 notation, so the v4 rules have to
  // apply there too — this is a classic filter bypass.
  it("applies the IPv4 rules to mapped addresses", () => {
    assert.equal(blockedIpv6Reason("::ffff:127.0.0.1"), "loopback");
    assert.equal(
      blockedIpv6Reason("::ffff:169.254.169.254"),
      "link-local / cloud metadata"
    );
    assert.equal(blockedIpv6Reason("::ffff:8.8.8.8"), null);
  });

  it("ignores a zone index", () => {
    assert.equal(blockedIpv6Reason("fe80::1%eth0"), "link-local");
  });

  // The URL parser rewrites the dotted tail to hex, so this is the form the
  // guard actually receives for `http://[::ffff:127.0.0.1]/`.
  it("applies the IPv4 rules to mapped addresses written in hex", () => {
    assert.equal(blockedIpv6Reason("::ffff:7f00:1"), "loopback");
    assert.equal(blockedIpv6Reason("::ffff:a9fe:a9fe"), "link-local / cloud metadata");
    assert.equal(blockedIpv6Reason("0:0:0:0:0:ffff:0a00:0001"), "private network");
    assert.equal(blockedIpv6Reason("::ffff:808:808"), null);
  });

  it("applies the IPv4 rules to IPv4-compatible and translated addresses", () => {
    assert.equal(blockedIpv6Reason("::7f00:1"), "loopback");
    assert.equal(blockedIpv6Reason("::127.0.0.1"), "loopback");
    assert.equal(blockedIpv6Reason("::ffff:0:7f00:1"), "loopback");
  });

  it("applies the IPv4 rules to NAT64 and 6to4 addresses", () => {
    assert.equal(blockedIpv6Reason("64:ff9b::7f00:1"), "loopback");
    assert.equal(blockedIpv6Reason("64:ff9b::a9fe:a9fe"), "link-local / cloud metadata");
    assert.equal(blockedIpv6Reason("64:ff9b::808:808"), null);
    assert.equal(blockedIpv6Reason("2002:7f00:1::"), "loopback");
    assert.equal(blockedIpv6Reason("2002:c0a8:101::1"), "private network");
    assert.equal(blockedIpv6Reason("2002:808:808::1"), null);
  });

  it("blocks other non-public ranges", () => {
    assert.equal(blockedIpv6Reason("0:0:0:0:0:0:0:0"), "unspecified address");
    assert.equal(blockedIpv6Reason("0:0:0:0:0:0:0:1"), "loopback");
    assert.equal(blockedIpv6Reason("64:ff9b:1::1"), "local-use NAT64");
    assert.equal(blockedIpv6Reason("2001:0:4136:e378::1"), "Teredo tunnel");
    assert.equal(blockedIpv6Reason("2001:db8::1"), "documentation range");
    assert.equal(blockedIpv6Reason("100::1"), "discard-only");
    assert.equal(blockedIpv6Reason("fec0::1"), "site-local");
    assert.equal(blockedIpv6Reason("FE80::1"), "link-local");
  });

  it("does not over-block public neighbours", () => {
    assert.equal(blockedIpv6Reason("2001:4860:4860::8888"), null);
    assert.equal(blockedIpv6Reason("2003::1"), null);
    assert.equal(blockedIpv6Reason("fbff::1"), null);
  });

  it("rejects malformed addresses", () => {
    assert.equal(blockedIpv6Reason("1::2::3"), "malformed IPv6 address");
    assert.equal(blockedIpv6Reason("1:2:3"), "malformed IPv6 address");
    assert.equal(blockedIpv6Reason("::ffff:999.0.0.1"), "malformed IPv6 address");
  });
});

// End to end through the URL parser, which is what delivery actually uses. IP
// literals never reach DNS, so these run without a network.
describe("assertDeliverableUrl with IP literals", () => {
  const blocked = [
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:169.254.169.254]/latest/meta-data/",
    "http://[::127.0.0.1]/",
    "http://[64:ff9b::127.0.0.1]/",
    "http://[2002:7f00:1::]/",
    "http://[::1]:5001/api",
    "http://[fd00::1]/",
    "http://2130706433/",
    "http://0x7f.1/",
    "http://169.254.169.254/",
  ];

  for (const raw of blocked) {
    it(`blocks ${raw}`, async () => {
      await assert.rejects(assertDeliverableUrl(raw), BlockedUrlError);
    });
  }

  it("allows public literals", async () => {
    await assert.doesNotReject(assertDeliverableUrl("https://8.8.8.8/hook"));
    await assert.doesNotReject(assertDeliverableUrl("https://[2606:4700:4700::1111]/hook"));
  });
});

describe("blockedAddressReason", () => {
  it("dispatches on address family", () => {
    assert.equal(blockedAddressReason("8.8.8.8"), null);
    assert.equal(blockedAddressReason("::1"), "loopback");
  });

  it("rejects anything that is not an IP", () => {
    assert.equal(blockedAddressReason("example.com"), "not an IP address");
  });
});

describe("parseWebhookUrl", () => {
  it("accepts ordinary http and https URLs", () => {
    assert.equal(
      parseWebhookUrl("https://hooks.slack.com/services/A/B/C").hostname,
      "hooks.slack.com"
    );
    assert.equal(parseWebhookUrl("http://example.com/hook").protocol, "http:");
  });

  it("rejects non-HTTP schemes", () => {
    assert.throws(
      () => parseWebhookUrl("file:///etc/passwd"),
      BlockedUrlError
    );
    assert.throws(() => parseWebhookUrl("gopher://example.com"), BlockedUrlError);
  });

  it("rejects embedded credentials", () => {
    assert.throws(
      () => parseWebhookUrl("https://user:pass@example.com/hook"),
      BlockedUrlError
    );
  });

  it("rejects localhost by name", () => {
    assert.throws(() => parseWebhookUrl("http://localhost:5001/api"), BlockedUrlError);
    assert.throws(() => parseWebhookUrl("http://app.localhost/api"), BlockedUrlError);
  });

  it("rejects malformed URLs", () => {
    assert.throws(() => parseWebhookUrl("not a url"), BlockedUrlError);
  });
});

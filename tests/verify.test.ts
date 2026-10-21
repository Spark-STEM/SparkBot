import { describe, it, expect } from "bun:test";
import crypto from "crypto";
import { verifyDiscordRequest } from "../src/verify.ts";

describe("Request Verification (Ed25519)", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pubHex = publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");

  it("fails when signature headers are missing", async () => {
    const req = new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify({ type: 1 }),
    });

    const result = await verifyDiscordRequest(req, pubHex);
    expect(result.isValid).toBe(false);
  });

  it("fails when timestamp header is missing", async () => {
    const req = new Request("https://example.com", {
      method: "POST",
      headers: {
        "x-signature-ed25519": "dummy_signature",
      },
      body: JSON.stringify({ type: 1 }),
    });

    const result = await verifyDiscordRequest(req, pubHex);
    expect(result.isValid).toBe(false);
  });

  it("fails when signature is forged or invalid", async () => {
    const timestamp = "1600000000";
    const body = JSON.stringify({ type: 1 });
    const req = new Request("https://example.com", {
      method: "POST",
      headers: {
        "x-signature-ed25519": "00".repeat(64),
        "x-signature-timestamp": timestamp,
      },
      body,
    });

    const result = await verifyDiscordRequest(req, pubHex);
    expect(result.isValid).toBe(false);
  });

  it("succeeds when signature is valid", async () => {
    const timestamp = "1600000000";
    const body = JSON.stringify({ type: 1 });
    const message = Buffer.concat([Buffer.from(timestamp), Buffer.from(body)]);
    const signature = crypto.sign(null, message, privateKey).toString("hex");

    const req = new Request("https://example.com", {
      method: "POST",
      headers: {
        "x-signature-ed25519": signature,
        "x-signature-timestamp": timestamp,
      },
      body,
    });

    const result = await verifyDiscordRequest(req, pubHex);
    expect(result.isValid).toBe(true);
    expect(result.body).toBe(body);
  });

  it("fails when body has been tampered with after signing", async () => {
    const timestamp = "1600000000";
    const body = JSON.stringify({ type: 1 });
    const message = Buffer.concat([Buffer.from(timestamp), Buffer.from(body)]);
    const signature = crypto.sign(null, message, privateKey).toString("hex");

    const req = new Request("https://example.com", {
      method: "POST",
      headers: {
        "x-signature-ed25519": signature,
        "x-signature-timestamp": timestamp,
      },
      body: JSON.stringify({ type: 2 }), // tampered
    });

    const result = await verifyDiscordRequest(req, pubHex);
    expect(result.isValid).toBe(false);
  });
});

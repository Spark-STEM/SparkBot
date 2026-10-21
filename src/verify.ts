import { verifyKey } from "discord-interactions";

/**
 * Validates incoming Discord interaction HTTP requests using Ed25519 signature verification.
 */
export async function verifyDiscordRequest(
  request: Request,
  publicKey: string
): Promise<{ isValid: boolean; body: string }> {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");

  if (!signature || !timestamp) {
    return { isValid: false, body: "" };
  }

  const body = await request.text();
  const isValid = await verifyKey(body, signature, timestamp, publicKey);

  return { isValid, body };
}

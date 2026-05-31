import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyHmacSha256(rawBody: string, signingKey: string, signature: string): boolean {
  if (!signingKey || !signature) return false;
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const digest = createHmac('sha256', signingKey).update(rawBody, 'utf8').digest('hex');
  try {
    return timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

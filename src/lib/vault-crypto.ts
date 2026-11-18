export interface VaultSecretPayload {
  username: string;
  secretValue: string;
  notes: string;
}

export interface EncryptedVaultBundle {
  encryptedPayload: string;
  iv: string;
  salt: string;
}

export const MIN_VAULT_PASSWORD_LENGTH = 12;
const PBKDF2_ITERATIONS = 600_000;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getCrypto(): Crypto {
  if (typeof globalThis !== "undefined" && globalThis.crypto) {
    return globalThis.crypto;
  }
  throw new Error("Web Crypto API is unavailable in this environment.");
}

/** Unbiased CSPRNG index using rejection sampling over Uint32. */
function randomIndex(maxExclusive: number): number {
  const cryptoApi = getCrypto();
  const maxUint32 = 0x1_0000_0000;
  const limit = maxUint32 - (maxUint32 % maxExclusive);
  const buf = new Uint32Array(1);
  while (true) {
    cryptoApi.getRandomValues(buf);
    const val = buf[0] ?? 0;
    if (val < limit) return val % maxExclusive;
  }
}

export function generateRandomVaultPassword(length = 18): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*-_=+?";
  const all = upper + lower + digits + symbols;

  const pick = (pool: string) => pool[randomIndex(pool.length)] ?? "X";

  const chars: string[] = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const targetLen = Math.max(MIN_VAULT_PASSWORD_LENGTH, length);
  while (chars.length < targetLen) {
    chars.push(pick(all));
  }

  // Unbiased Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    const tmp = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = tmp;
  }

  return chars.join("");
}

async function deriveAesKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = getCrypto().subtle;
  const keyMaterial = await subtle.importKey("raw", TEXT_ENCODER.encode(secret), "PBKDF2", false, [
    "deriveKey",
  ]);

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptVaultPayload(
  payload: VaultSecretPayload,
  password: string,
): Promise<EncryptedVaultBundle> {
  if (password.length < MIN_VAULT_PASSWORD_LENGTH) {
    throw new Error(`Vault passphrase must be at least ${MIN_VAULT_PASSWORD_LENGTH} characters.`);
  }
  const cryptoApi = getCrypto();
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveAesKey(password, salt);

  const encoded = TEXT_ENCODER.encode(JSON.stringify(payload));
  const cipherBuffer = await cryptoApi.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    aesKey,
    encoded,
  );

  return {
    encryptedPayload: bytesToBase64(new Uint8Array(cipherBuffer)),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
  };
}

export async function decryptVaultPayload(
  encryptedPayload: string,
  iv: string,
  salt: string,
  password: string,
): Promise<{ ok: true; data: VaultSecretPayload } | { ok: false; error: string }> {
  try {
    if (!password) {
      return { ok: false, error: "Enter a valid vault passphrase." };
    }
    const cryptoApi = getCrypto();
    const cipherBytes = base64ToBytes(encryptedPayload);
    const ivBytes = base64ToBytes(iv);
    const saltBytes = base64ToBytes(salt);

    const aesKey = await deriveAesKey(password, saltBytes);
    const plainBuffer = await cryptoApi.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes as BufferSource },
      aesKey,
      cipherBytes as BufferSource,
    );

    const parsed = JSON.parse(TEXT_DECODER.decode(plainBuffer)) as Partial<VaultSecretPayload>;
    return {
      ok: true,
      data: {
        username: parsed.username ?? "",
        secretValue: parsed.secretValue ?? "",
        notes: parsed.notes ?? "",
      },
    };
  } catch {
    return {
      ok: false,
      error: "Incorrect vault password or passphrase. Decryption failed.",
    };
  }
}

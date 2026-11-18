export const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const MAX_IMAGE_INPUT_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_PROOF_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const BLOCKED_FILE_EXTENSIONS = new Set([
  "svg",
  "svgz",
  "html",
  "htm",
  "xhtml",
  "js",
  "mjs",
  "cjs",
  "ts",
  "exe",
  "bat",
  "cmd",
  "sh",
  "ps1",
  "vbs",
  "php",
  "jsp",
  "asp",
  "aspx",
]);

export const PASSWORD_POLICY_ERROR =
  "Password must be at least 12 characters and include uppercase, lowercase, number, and symbol.";

export function isStrongPassword(password: string): boolean {
  if (password.length < 12 || password.length > 128) return false;
  return (
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

/**
 * Restrict external links and proof URLs to safe http/https protocols.
 * Blocks javascript:, data:, vbscript:, file:, etc.
 */
export function sanitizeExternalUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Validate proof image data URLs or https URLs before rendering in <img> tags.
 * Explicitly blocks image/svg+xml and arbitrary protocols.
 */
export function isSafeImageSrc(src: string | null | undefined): boolean {
  if (!src || typeof src !== "string") return false;
  const trimmed = src.trim();
  if (
    /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed) &&
    trimmed.length <= 750_000
  ) {
    return true;
  }
  return sanitizeExternalUrl(trimmed) !== null;
}

/**
 * Neutralize spreadsheet CSV formula injection (=, +, -, @, tab, CR) and escape quotes.
 */
export function sanitizeCsvCell(value: unknown): string {
  const str = String(value ?? "");
  const trimmedLeading = str.replace(/^\s+/, "");
  const formulaSafe = /^[=+\-@\t\r]/.test(str) || /^[=+\-@]/.test(trimmedLeading) ? `'${str}` : str;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

async function hasValidImageMagicBytes(file: File): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (header.length < 4) return false;

  // JPEG: FF D8 FF
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return file.type === "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  ) {
    return file.type === "image/png";
  }
  // WEBP: RIFF....WEBP
  if (
    header.length >= 12 &&
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return file.type === "image/webp";
  }

  return false;
}

/**
 * Validate MIME type, magic bytes, and byte size, then re-encode via Canvas
 * to strip EXIF metadata and bound storage size (no SVG / arbitrary Base64 blobs).
 */
export async function validateAndNormalizeImage(
  file: File,
  options: { maxDim?: number; squareCrop?: boolean; quality?: number } = {},
): Promise<string> {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
    throw new Error("Unsupported image format. Only JPEG, PNG, and WebP are permitted.");
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_INPUT_BYTES) {
    throw new Error("Image must be larger than 0 bytes and under 2 MB.");
  }
  if (!(await hasValidImageMagicBytes(file))) {
    throw new Error("File signature does not match a valid JPEG, PNG, or WebP image.");
  }

  const maxDim = options.maxDim ?? 960;
  const quality = options.quality ?? 0.8;
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas image processing is unavailable.");

    if (options.squareCrop) {
      const targetSize = Math.min(maxDim, 256);
      canvas.width = targetSize;
      canvas.height = targetSize;
      const side = Math.min(bitmap.width, bitmap.height);
      ctx.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        targetSize,
        targetSize,
      );
    } else {
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    }

    const encoded = canvas.toDataURL("image/webp", quality);
    if (encoded.length > 500_000) {
      return canvas.toDataURL("image/jpeg", 0.72);
    }
    return encoded;
  } finally {
    bitmap.close();
  }
}

export function validateProofDocumentFile(file: File): { safeName: string } {
  if (file.size <= 0 || file.size > MAX_PROOF_FILE_BYTES) {
    throw new Error("Uploaded file must be between 1 byte and 10 MB.");
  }
  const cleanName = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  const ext = cleanName.split(".").pop()?.toLowerCase() ?? "";
  if (BLOCKED_FILE_EXTENSIONS.has(ext) || file.type === "image/svg+xml") {
    throw new Error("Active scripts, HTML, and SVG files are blocked for security.");
  }
  return { safeName: cleanName || "document" };
}

/**
 * Selectively purge SACE portal & auth cached keys on logout without wiping
 * unrelated browser localStorage entries.
 */
export function clearPortalClientStorage(userId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const exactLocalKeys = [
      "sace-portal-state-v3",
      "sace_custom_vision",
      "sace_vision_date",
      "sace_todos_guest",
    ];
    if (userId) {
      exactLocalKeys.push(
        `sace_todos_${userId}`,
        `sace_custom_vision_${userId}`,
        `sace_vision_date_${userId}`,
      );
    }
    for (const k of exactLocalKeys) {
      window.localStorage.removeItem(k);
    }

    const toDelete: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (
        k &&
        (k.startsWith("sace_todos_") ||
          k.startsWith("sace_custom_vision_") ||
          k.startsWith("sace_vision_date_") ||
          k.startsWith("sb-"))
      ) {
        toDelete.push(k);
      }
    }
    for (const k of toDelete) {
      window.localStorage.removeItem(k);
    }

    window.sessionStorage.removeItem("sace_portal_session_token");
    window.sessionStorage.removeItem("sace_vault_paste_draft");
    window.sessionStorage.removeItem("sace_vault_paste_recipient");
    window.sessionStorage.removeItem("sace_vision_dismissed");
  } catch {
    // Ignore storage access errors in private contexts
  }
}

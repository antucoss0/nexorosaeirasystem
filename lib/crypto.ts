import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MAGIC = Buffer.from("EIRAENC1");
let cached: Buffer | undefined;

// DATA_KEY (any secret string) should come from a secret manager in production.
// Without it a key file is created next to the data, which only protects
// copies of files/ that travel without that key file.
function key() {
  if (cached) return cached;
  if (process.env.DATA_KEY)
    return (cached = createHash("sha256").update(process.env.DATA_KEY).digest());
  const path = join(
    process.env.DATA_DIR || join(process.cwd(), "data"),
    "data.key",
  );
  if (!existsSync(path))
    try {
      writeFileSync(path, randomBytes(32), { flag: "wx", mode: 0o600 });
    } catch {}
  return (cached = readFileSync(path));
}

export function seal(bytes: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function open(bytes: Buffer) {
  if (!bytes.subarray(0, MAGIC.length).equals(MAGIC)) return bytes;
  const iv = bytes.subarray(8, 20);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(bytes.subarray(20, 36));
  return Buffer.concat([decipher.update(bytes.subarray(36)), decipher.final()]);
}

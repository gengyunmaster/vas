// Content-addressable storage: blob ids are the SHA-256 of their bytes, so
// inserting the same file twice (under any name, in any notebook) stores one
// copy and references merge/dedupe for free.
export async function hashBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

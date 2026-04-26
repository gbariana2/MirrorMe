function sanitizeFilenamePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function buildVideoPath(kind: "reference" | "submission", filename: string) {
  const extension = filename.includes(".")
    ? filename.slice(filename.lastIndexOf(".")).toLowerCase()
    : ".mp4";
  const stem = filename.includes(".")
    ? filename.slice(0, filename.lastIndexOf("."))
    : filename;

  const safeStem = sanitizeFilenamePart(stem) || "video";

  return `${kind}/${Date.now()}-${crypto.randomUUID()}-${safeStem}${extension}`;
}

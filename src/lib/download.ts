/**
 * Descarga un archivo Markdown en el navegador (Blob + ObjectURL).
 * Sin dependencias externas.
 */
export function downloadDocument(filename: string, content: string): void {
  const safeName = sanitizeFilename(filename.endsWith(".md") ? filename : `${filename}.md`);
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function sanitizeFilename(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 120) || "documento";
}

export function buildProductSlug(productName?: string): string {
  const base = productName?.trim() || "Producto";
  return sanitizeFilename(base);
}

"use strict";

const ALLOWED_STATUSES = new Set(["active", "inactive", "out_of_stock"]);

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&middot;/gi, "·")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return stripTags(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/([A-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Z])/g, "$1 $2")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function normalizeProductName(value) {
  return normalizeText(value)
    .replace(/\bMOTS C\b/g, "MOTS")
    .replace(/\bSLU PP\b/g, "SLUPP")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeNextFlightChunks(html) {
  const decoded = [];
  const scripts = String(html || "").matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi);

  for (const scriptMatch of scripts) {
    const script = scriptMatch[1];
    const pushes = script.matchAll(/self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g);
    for (const push of pushes) {
      try {
        decoded.push(JSON.parse(push[1]));
      } catch (error) {
        throw new Error(`Falha ao decodificar um bloco Next Flight: ${error.message}`);
      }
    }
  }

  if (!decoded.length) {
    throw new Error("A página da fonte não contém blocos Next Flight reconhecíveis.");
  }

  return decoded.join("");
}

function extractJsonArrayAfter(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return null;

  const start = text.indexOf("[", markerIndex + marker.length);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

function normalizeProduct(product) {
  const finalPrice = Number(product.finalPrice);
  return {
    id: String(product.id || "").trim(),
    category: String(product.category || "").trim(),
    group: String(product.group || product.category || "").trim(),
    brand: String(product.brand || "").trim(),
    name: String(product.name || "").trim(),
    presentation: String(product.presentation || "").trim(),
    finalPrice: Number.isFinite(finalPrice) ? finalPrice : null,
    rawPrice: product.rawPrice == null ? null : String(product.rawPrice),
    status: String(product.status || "active").trim(),
    sortOrder: Number.isFinite(Number(product.sortOrder)) ? Number(product.sortOrder) : 0,
    isDeleted: Boolean(product.isDeleted),
  };
}

function validateProducts(products, options = {}) {
  const minimumProducts = Number(options.minimumProducts || 500);
  const previousTotal = Number(options.previousTotal || 0);
  const minimumFromPrevious = previousTotal > 0 ? Math.floor(previousTotal * 0.8) : 0;
  const requiredTotal = Math.max(minimumProducts, minimumFromPrevious);
  const errors = [];
  const ids = new Set();
  let duplicateIds = 0;
  let invalidProducts = 0;
  let invalidStatuses = 0;

  for (const product of products) {
    if (!product.id || !product.name || !product.brand || !product.group) invalidProducts += 1;
    if (!ALLOWED_STATUSES.has(product.status)) invalidStatuses += 1;
    if (ids.has(product.id)) duplicateIds += 1;
    ids.add(product.id);
  }

  if (products.length < requiredTotal) {
    errors.push(`Total implausível: ${products.length}; mínimo exigido: ${requiredTotal}.`);
  }
  if (duplicateIds) errors.push(`${duplicateIds} IDs duplicados.`);
  if (invalidProducts) errors.push(`${invalidProducts} produtos sem identidade completa.`);
  if (invalidStatuses) errors.push(`${invalidStatuses} produtos com status desconhecido.`);

  return {
    ok: errors.length === 0,
    errors,
    total: products.length,
    uniqueIds: ids.size,
    active: products.filter((item) => item.status === "active" && !item.isDeleted).length,
    unavailable: products.filter((item) => item.status !== "active" && !item.isDeleted).length,
    deleted: products.filter((item) => item.isDeleted).length,
  };
}

function parseSourceCatalog(html, options = {}) {
  const flight = decodeNextFlightChunks(html);
  const arrayText = extractJsonArrayAfter(flight, '"products":');
  if (!arrayText) throw new Error('O campo público "products" não foi encontrado na fonte.');

  let rawProducts;
  try {
    rawProducts = JSON.parse(arrayText);
  } catch (error) {
    throw new Error(`O catálogo público não contém um array de produtos válido: ${error.message}`);
  }

  const products = rawProducts.map(normalizeProduct);
  const validation = validateProducts(products, options);
  if (!validation.ok) throw new Error(`Snapshot rejeitado: ${validation.errors.join(" ")}`);

  return { products, validation };
}

module.exports = {
  ALLOWED_STATUSES,
  decodeNextFlightChunks,
  extractJsonArrayAfter,
  normalizeProduct,
  normalizeProductName,
  normalizeText,
  parseSourceCatalog,
  stripTags,
  validateProducts,
};

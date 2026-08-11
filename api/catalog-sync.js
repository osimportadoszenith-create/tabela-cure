"use strict";

const crypto = require("crypto");
const https = require("https");
const { parseSourceCatalog } = require("../lib/catalog-parser.cjs");
const catalogMap = require("../py/catalog-map.json");

const SOURCE_URL = "https://curepharmaceuticalspy.com/";
const CACHE_MS = 30_000;
const REQUEST_TIMEOUT_MS = 20_000;
const mappedSourceIds = new Set(catalogMap.mappings.map((item) => item.sourceId));

let snapshot = null;
let lastAttemptAt = null;
let lastSuccessAt = null;
let lastChangedAt = null;
let lastError = null;
let refreshing = null;

function requestText(url, redirects = 0) {
  if (redirects > 3) return Promise.reject(new Error("Redirecionamentos demais na fonte."));
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Cache-Control": "no-cache",
        "User-Agent": "CURE-Catalog-Sync/1.0",
      },
      timeout: REQUEST_TIMEOUT_MS,
    }, (response) => {
      const status = Number(response.statusCode || 0);
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        resolve(requestText(new URL(response.headers.location, url).toString(), redirects + 1));
        return;
      }
      if (status !== 200) {
        response.resume();
        reject(new Error(`A fonte respondeu HTTP ${status}.`));
        return;
      }
      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > 8 * 1024 * 1024) {
          request.destroy(new Error("Resposta da fonte excedeu 8 MB."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("Tempo esgotado ao consultar a fonte.")));
    request.on("error", reject);
  });
}

function hashProducts(products) {
  return crypto.createHash("sha256").update(JSON.stringify(products.map((item) => [
    item.id,
    item.category,
    item.group,
    item.brand,
    item.name,
    item.presentation,
    item.descriptionText,
    item.finalPrice,
  ]))).digest("hex");
}

function validateCoverage(products) {
  const ids = new Set(products.map((item) => item.id));
  let mappedPresent = 0;
  for (const id of mappedSourceIds) if (ids.has(id)) mappedPresent += 1;
  const coverage = mappedSourceIds.size ? mappedPresent / mappedSourceIds.size : 0;
  if (coverage < 0.9) {
    throw new Error(`Snapshot rejeitado: cobertura dos vínculos em ${(coverage * 100).toFixed(1)}%.`);
  }
  return { mappedPresent, mappedTotal: mappedSourceIds.size, coverage };
}

async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    lastAttemptAt = new Date().toISOString();
    try {
      const html = await requestText(SOURCE_URL);
      const parsed = parseSourceCatalog(html, {
        minimumProducts: 500,
        previousTotal: snapshot?.products.length || catalogMap.sourceTotal,
      });
      const coverage = validateCoverage(parsed.products);
      const hash = hashProducts(parsed.products);
      const now = new Date().toISOString();
      if (hash !== snapshot?.hash) lastChangedAt = now;
      snapshot = {
        complete: true,
        sourceUrl: SOURCE_URL,
        fetchedAt: now,
        hash,
        products: parsed.products,
        validation: { ...parsed.validation, ...coverage },
      };
      lastSuccessAt = now;
      lastError = null;
    } catch (error) {
      lastError = { at: new Date().toISOString(), message: error.message };
    } finally {
      refreshing = null;
    }
    return snapshot;
  })();
  return refreshing;
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  if (!snapshot || Date.now() - Date.parse(lastAttemptAt || 0) >= CACHE_MS) await refresh();
  response.status(snapshot ? 200 : 503).json({
    ok: Boolean(snapshot),
    snapshot,
    lastAttemptAt,
    lastSuccessAt,
    lastChangedAt,
    lastError,
  });
};

module.exports._test = { hashProducts, refresh, requestText, validateCoverage };

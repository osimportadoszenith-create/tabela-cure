(function () {
  "use strict";

  var map = window.__CURE_CATALOG_MAP__ || { mappings: [], unmappedLocalRows: [] };
  var attached = false;

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/([A-Z])(\d)/g, "$1 $2")
      .replace(/(\d)([A-Z])/g, "$1 $2")
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
  }

  function attachStableIds() {
    if (attached) return;
    var claimed = new Set();

    map.mappings.forEach(function (entry) {
      var card = document.getElementById(entry.cardId);
      if (!card) return;
      var candidates = Array.from(card.querySelectorAll("li.product-row")).filter(function (row) {
        if (claimed.has(row)) return false;
        return normalize(row.querySelector(".name")?.textContent) === normalize(entry.name);
      });
      var exact = candidates.filter(function (row) {
        return normalize(row.querySelector(".sub")?.textContent) === normalize(entry.presentation);
      });
      var selected = exact.length === 1 ? exact[0] : candidates.length === 1 ? candidates[0] : null;
      if (!selected) return;
      selected.dataset.sourceId = entry.sourceId;
      claimed.add(selected);
    });

    attached = true;
  }

  function hideLegacyUnmappedRows() {
    (map.unmappedLocalRows || []).forEach(function (entry) {
      var card = document.getElementById(entry.cardId);
      if (!card) return;
      var candidates = Array.from(card.querySelectorAll("li.product-row:not([data-source-id])")).filter(function (row) {
        return normalize(row.querySelector(".name")?.textContent) === normalize(entry.name)
          && normalize(row.querySelector(".sub")?.textContent) === normalize(entry.presentation);
      });
      if (candidates.length !== 1) return;
      candidates[0].hidden = true;
      candidates[0].dataset.syncLegacy = "unmapped";
    });
  }

  function categoryIdFor(product) {
    var category = normalize(product.category);
    if (category.indexOf("EMAGRECEDOR") >= 0) return "emagrecedores";
    if (category.indexOf("PEPTIDEO") >= 0) return "peptidios";
    if (category.indexOf("PREMIUM") >= 0) return "premium";
    if (category.indexOf("IMPORTAD") >= 0) return "importadas";
    if (category.indexOf("FARMAC") >= 0) return "farmacia";
    return "";
  }

  function slug(value) {
    return normalize(value).toLowerCase().replace(/\s+/g, "-");
  }

  function createBrandCard(category, product) {
    var card = document.createElement("details");
    var brandSlug = slug(product.brand);
    card.className = "brand-card sync-created-card";
    card.id = category.id + "-" + brandSlug;
    card.dataset.syncBrand = product.brand;

    var summary = document.createElement("summary");
    var kicker = document.createElement("div");
    kicker.className = "brand-kicker";
    var left = document.createElement("span");
    left.className = "brand-kicker-left";
    var seal = document.createElement("span");
    seal.className = "mini-seal";
    seal.setAttribute("role", "img");
    seal.setAttribute("aria-label", "CURE Pharmaceuticals");
    var categoryLabel = document.createElement("span");
    categoryLabel.textContent = category.querySelector("h2")?.textContent || product.category;
    left.append(seal, categoryLabel);
    var name = document.createElement("span");
    name.className = "brand-kicker-name";
    kicker.append(left, name);

    var feature = document.createElement("div");
    feature.className = "brand-feature logo-" + brandSlug;
    var logo = document.createElement("span");
    logo.className = "logo-img logo-" + brandSlug;
    logo.setAttribute("role", "img");
    logo.setAttribute("aria-label", product.brand);
    feature.appendChild(logo);
    summary.append(kicker, feature);

    var list = document.createElement("ul");
    list.className = "product-list";
    card.append(summary, list);
    category.querySelector(".category-body")?.appendChild(card);
    return card;
  }

  function ensureTargetCard(product) {
    var categoryId = categoryIdFor(product);
    var category = categoryId ? document.getElementById(categoryId) : null;
    if (!category) return null;
    var cardId = categoryId + "-" + slug(product.brand);
    return document.getElementById(cardId) || createBrandCard(category, product);
  }

  function createProductRow(product) {
    var row = document.createElement("li");
    row.className = "product-row sync-created-row";
    row.dataset.sourceId = product.id;
    var info = document.createElement("div");
    info.className = "product-info";
    var name = document.createElement("span");
    name.className = "name";
    var sub = document.createElement("span");
    sub.className = "sub";
    info.append(name, sub);
    var price = document.createElement("span");
    price.className = "price";
    row.append(info, price);
    return row;
  }

  function formatPrice(value) {
    var number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "CONSULTE";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number);
  }

  function setUnavailable(row, unavailable) {
    row.classList.toggle("is-unavailable", unavailable);
    row.dataset.syncStatus = unavailable ? "unavailable" : "active";
    var badge = row.querySelector(".sync-unavailable-badge");
    if (unavailable && !badge) {
      badge = document.createElement("span");
      badge.className = "sync-unavailable-badge";
      badge.textContent = "INDISPONÍVEL";
      row.querySelector(".product-info")?.appendChild(badge);
    }
    if (!unavailable && badge) badge.remove();
  }

  function updateRow(row, product) {
    row.dataset.sourceId = product.id;
    row.dataset.syncOrder = String(product.sortOrder || 0);
    row.hidden = Boolean(product.isDeleted);
    row.querySelector(".name").textContent = product.name;
    var sub = row.querySelector(".sub");
    if (!sub && product.presentation) {
      sub = document.createElement("span");
      sub.className = "sub";
      row.querySelector(".product-info")?.appendChild(sub);
    }
    if (sub) {
      sub.textContent = product.presentation || "";
      sub.hidden = !product.presentation;
    }
    row.querySelector(".price").textContent = formatPrice(product.finalPrice);
    setUnavailable(row, product.status === "inactive" || product.status === "out_of_stock");
  }

  function updateCounts() {
    document.querySelectorAll("details.category:not(#frete)").forEach(function (category) {
      var visibleCards = 0;
      var visibleProducts = 0;
      category.querySelectorAll(":scope > .category-body > details.brand-card").forEach(function (card) {
        var rows = Array.from(card.querySelectorAll(":scope > ul.product-list > li.product-row"));
        var count = rows.filter(function (row) { return !row.hidden; }).length;
        card.hidden = count === 0;
        if (!card.hidden) visibleCards += 1;
        visibleProducts += count;
        var current = card.querySelector(".brand-kicker-name");
        if (current) {
          var brand = card.dataset.syncBrand || current.textContent.replace(/^\s*\d+\s+PRODUTOS?\s*-\s*/i, "").trim();
          current.textContent = count + (count === 1 ? " PRODUTO - " : " PRODUTOS - ") + brand;
        }
      });
      var summary = category.querySelector(":scope > summary small");
      if (summary) summary.textContent = visibleProducts + " produtos · " + visibleCards + " marcas";
    });
  }

  function sortRows() {
    document.querySelectorAll("ul.product-list").forEach(function (list) {
      var rows = Array.from(list.querySelectorAll(":scope > li.product-row"));
      rows.sort(function (a, b) {
        var aOrder = a.dataset.syncOrder === undefined ? Number.MAX_SAFE_INTEGER : Number(a.dataset.syncOrder);
        var bOrder = b.dataset.syncOrder === undefined ? Number.MAX_SAFE_INTEGER : Number(b.dataset.syncOrder);
        return aOrder - bOrder;
      });
      rows.forEach(function (row) { list.appendChild(row); });
    });
  }

  function applySnapshot(snapshot) {
    if (!snapshot || !snapshot.complete || !Array.isArray(snapshot.products)) return;
    attachStableIds();
    hideLegacyUnmappedRows();
    var productsById = new Map(snapshot.products.map(function (product) { return [product.id, product]; }));

    document.querySelectorAll("li.product-row[data-source-id]").forEach(function (row) {
      var product = productsById.get(row.dataset.sourceId);
      if (!product) {
        setUnavailable(row, true);
        return;
      }
      var card = ensureTargetCard(product);
      if (!card) return;
      var list = card.querySelector("ul.product-list");
      if (list && row.parentElement !== list) list.appendChild(row);
      updateRow(row, product);
    });

    snapshot.products.forEach(function (product) {
      var escapedId = window.CSS && CSS.escape ? CSS.escape(product.id) : product.id.replace(/"/g, "\\\"");
      if (document.querySelector('li.product-row[data-source-id="' + escapedId + '"]')) return;
      var card = ensureTargetCard(product);
      if (!card) return;
      var row = createProductRow(product);
      updateRow(row, product);
      card.querySelector("ul.product-list")?.appendChild(row);
    });

    sortRows();
    updateCounts();
    document.documentElement.dataset.catalogSyncHash = snapshot.hash;
    document.documentElement.dataset.catalogSyncAt = snapshot.fetchedAt;
  }

  async function poll() {
    try {
      var response = await fetch("/api/catalog-sync", { cache: "no-store" });
      if (!response.ok) return;
      var payload = await response.json();
      if (payload.ok) applySnapshot(payload.snapshot);
    } catch (_) {
      // Mantém silenciosamente o último estado válido exibido.
    }
  }

  poll();
  window.setInterval(poll, 10_000);
})();

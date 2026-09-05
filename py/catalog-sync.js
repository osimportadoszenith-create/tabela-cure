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
        if (row.dataset.sourceId && row.dataset.sourceId !== entry.sourceId) return false;
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
      candidates[0].remove();
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

  function brandCardSlug(value) {
    var brandSlug = slug(value);
    if (brandSlug === "one-1-pharma") return "one1-pharma";
    return brandSlug;
  }

  function createBrandCard(category, product) {
    var card = document.createElement("details");
    var brandSlug = brandCardSlug(product.brand);
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
    var cardId = categoryId + "-" + brandCardSlug(product.brand);
    return document.getElementById(cardId) || createBrandCard(category, product);
  }

  function usesProductDivisions(card) {
    var category = card?.closest("details.category");
    return category?.id === "premium" || category?.id === "importadas";
  }

  function productDivisionName(product) {
    return normalize(product.group).indexOf("ORAIS") >= 0 ? "ORAIS" : "INJETÁVEIS";
  }

  function ensureProductDivision(card, divisionName) {
    var container = card.querySelector(":scope > .brand-divisions");
    if (!container) {
      container = document.createElement("div");
      container.className = "brand-divisions";
      card.querySelector(":scope > summary")?.after(container);
    }

    var divisionSlug = divisionName === "ORAIS" ? "orais" : "injetaveis";
    var division = container.querySelector('[data-product-division="' + divisionSlug + '"]');
    if (!division) {
      division = document.createElement("details");
      division.className = "product-division";
      division.dataset.productDivision = divisionSlug;
      var summary = document.createElement("summary");
      summary.textContent = divisionName;
      var list = document.createElement("ul");
      list.className = "product-list";
      division.append(summary, list);
      container.appendChild(division);
    }
    return division.querySelector(":scope > .product-list");
  }

  function productListFor(card, product) {
    if (!usesProductDivisions(card)) return card.querySelector(":scope > ul.product-list");
    return ensureProductDivision(card, productDivisionName(product));
  }

  function prepareDividedCards() {
    document.querySelectorAll("#premium .brand-card, #importadas .brand-card").forEach(function (card) {
      if (card.dataset.divisionToggleReady) return;
      card.dataset.divisionToggleReady = "true";
      card.addEventListener("toggle", function () {
        if (!card.open) return;
        card.querySelectorAll(":scope > .brand-divisions > .product-division").forEach(function (division) {
          division.open = false;
        });
      });
    });
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

  function updateRow(row, product) {
    row.dataset.sourceId = product.id;
    row.hidden = false;
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
    var isGh = normalize(product.group) === "GH";
    var brandMark = row.querySelector(".sync-brand-mark");
    if (!brandMark && isGh && product.displayBrand) {
      brandMark = document.createElement("span");
      brandMark.className = "sync-brand-mark";
      row.querySelector(".product-info")?.appendChild(brandMark);
    }
    if (brandMark) {
      var displayBrand = product.displayBrand || product.brand || "";
      brandMark.className = "sync-brand-mark";
      brandMark.textContent = "MARCA: " + displayBrand;
      brandMark.setAttribute("aria-label", "Marca " + displayBrand);
      brandMark.hidden = !isGh || !displayBrand;
    }
    var description = row.querySelector(".sync-description");
    if (!description && product.descriptionText) {
      description = document.createElement("span");
      description.className = "sync-description";
      row.querySelector(".product-info")?.appendChild(description);
    }
    if (description) {
      description.textContent = product.descriptionText || "";
      description.hidden = !product.descriptionText;
    }
    row.querySelector(".price").textContent = formatPrice(product.finalPrice);
  }

  function brandNameFromLabel(value) {
    return String(value || "").replace(/^\s*\d+\s+PRODUTOS?\s*-\s*/i, "").trim();
  }

  function showBrandNamesOnly() {
    document.querySelectorAll(".brand-card .brand-kicker-name").forEach(function (current) {
      var card = current.closest(".brand-card");
      var brand = card?.dataset.syncBrand || brandNameFromLabel(current.textContent);
      if (!brand) return;
      if (card && !card.dataset.syncBrand) card.dataset.syncBrand = brand;
      current.textContent = brand;
      current.setAttribute("aria-label", "Marca " + brand);
    });
  }

  function updateCounts() {
    document.querySelectorAll("details.category:not(#frete)").forEach(function (category) {
      var visibleCards = 0;
      var visibleProducts = 0;
      category.querySelectorAll(":scope > .category-body > details.brand-card").forEach(function (card) {
        var rows = Array.from(card.querySelectorAll("li.product-row"));
        var count = rows.filter(function (row) { return !row.hidden; }).length;
        card.hidden = count === 0;
        if (!card.hidden) visibleCards += 1;
        visibleProducts += count;
        var current = card.querySelector(".brand-kicker-name");
        if (current) {
          var brand = card.dataset.syncBrand || brandNameFromLabel(current.textContent);
          current.textContent = brand;
          current.setAttribute("aria-label", "Marca " + brand);
        }
        card.querySelectorAll(":scope > .brand-divisions > .product-division").forEach(function (division) {
          division.hidden = division.querySelectorAll(":scope > ul.product-list > li.product-row:not([hidden])").length === 0;
        });
      });
      var summary = category.querySelector(":scope > summary small");
      if (summary) summary.textContent = visibleProducts + " produtos · " + visibleCards + " marcas";
    });
  }

  function applyBrandLogos(brands, sourceUrl) {
    var byName = new Map((brands || []).map(function (brand) {
      return [normalize(brand.name), brand];
    }));
    document.querySelectorAll("details.brand-card").forEach(function (card) {
      var kicker = card.querySelector(".brand-kicker-name");
      var cardBrand = card.dataset.syncBrand || (kicker
        ? brandNameFromLabel(kicker.textContent)
        : "");
      var brand = byName.get(normalize(cardBrand));
      if (!brand) return;
      var logo = card.querySelector(".brand-feature .logo-img");
      if (!logo) return;
      var imageUrl = brand.imageData ? new URL(brand.imageData, sourceUrl || window.location.href).toString() : "";
      logo.style.backgroundImage = imageUrl ? 'url("' + imageUrl.replace(/["\\]/g, "\\$&") + '")' : "none";
      logo.style.backgroundPosition = brand.imagePosition || "center";
      logo.dataset.syncBrandLogo = brand.name;
    });
  }

  function attachGhRowsByDisplayedBrand(products) {
    var card = document.getElementById("farmacia-gh");
    if (!card) return;
    products.filter(function (product) {
      return normalize(product.group) === "GH" && product.displayBrand;
    }).forEach(function (product) {
      if (card.querySelector('li.product-row[data-source-id="' + product.id.replace(/"/g, '\\"') + '"]')) return;
      var expectedBrand = normalize("MARCA: " + product.displayBrand);
      var candidates = Array.from(card.querySelectorAll("li.product-row:not([data-source-id])")).filter(function (row) {
        return normalize(row.querySelector(".name")?.textContent) === normalize(product.name)
          && normalize(row.querySelector(".sub")?.textContent) === expectedBrand;
      });
      if (candidates.length === 1) candidates[0].dataset.sourceId = product.id;
    });
  }

  function applySnapshot(snapshot) {
    if (!snapshot || !snapshot.complete || !Array.isArray(snapshot.products)) return;
    attachGhRowsByDisplayedBrand(snapshot.products);
    attachStableIds();
    hideLegacyUnmappedRows();
    var productsById = new Map(snapshot.products.map(function (product) { return [product.id, product]; }));

    document.querySelectorAll("li.product-row[data-source-id]").forEach(function (row) {
      var product = productsById.get(row.dataset.sourceId);
      if (!product) {
        row.remove();
        return;
      }
      var card = ensureTargetCard(product);
      if (!card) return;
      var list = productListFor(card, product);
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
      productListFor(card, product)?.appendChild(row);
    });

    var ghCard = document.getElementById("farmacia-gh");
    if (ghCard) {
      ghCard.querySelectorAll("li.product-row").forEach(function (row) {
        if (!row.dataset.sourceId || !productsById.has(row.dataset.sourceId)) row.remove();
      });
    }

    document.querySelectorAll("#premium .brand-card, #importadas .brand-card").forEach(function (card) {
      var legacyList = card.querySelector(":scope > ul.product-list");
      if (legacyList) legacyList.remove();
    });

    prepareDividedCards();
    updateCounts();
    applyBrandLogos(snapshot.brands, snapshot.sourceUrl);
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

  showBrandNamesOnly();
  poll();
  window.setInterval(poll, 10_000);
})();

document.addEventListener("DOMContentLoaded", async () => {
    const CLIENT_PAGE_SIZE = 8;
    const pageShell = document.getElementById("listing-page-shell");
    const filterRoot = document.getElementById("airbnb-filters");
    const filterPrevButton = document.getElementById("filter-rail-prev");
    const filterNextButton = document.getElementById("filter-rail-next");
    const filterPanel = document.getElementById("advanced-filters-panel");
    const filterPanelToggle = document.getElementById("filter-panel-toggle");
    const listingGrid = document.getElementById("listing-grid");
    const listingSkeletons = document.getElementById("listing-skeletons");
    const noResultsMessage = document.getElementById("no-listings-message");
    const noResultsResetButton = document.getElementById("no-results-reset-btn");
    const taxToggle = document.getElementById("tax-toggle-input");
    const searchInput = document.getElementById("navbar-search-input");
    const countryFilter = document.getElementById("country-filter");
    const locationFilter = document.getElementById("location-filter");
    const countryFilterBadge = document.getElementById("country-filter-badge");
    const locationFilterBadge = document.getElementById("location-filter-badge");
    const minPriceFilter = document.getElementById("min-price-filter");
    const maxPriceFilter = document.getElementById("max-price-filter");
    const clearFiltersButton = document.getElementById("clear-filters-btn");
    const activeFiltersBadge = document.getElementById("active-filters-badge");
    const navbarSearchForm = document.querySelector(".navbar-airbnb-search");
    const sortSelect = document.getElementById("sort");
    const saveSearchForm = document.getElementById("save-search-form");
    const sortHiddenInputs = Array.from(document.querySelectorAll("[data-sort-hidden]"));
    const saveInputs = Array.from(document.querySelectorAll("[data-save-input]"));
    const paginationShell = document.getElementById("client-pagination");
    const paginationPrev = document.getElementById("pagination-prev");
    const paginationNext = document.getElementById("pagination-next");
    const paginationPages = document.getElementById("pagination-pages");
    const amenityLabels = Array.from(document.querySelectorAll(".amenity-pill"));
    const resultsStatus = document.getElementById("listing-results-status");

    if (!pageShell || !filterRoot || !listingGrid) return;

    const TAX_RATE = 0.18;
    const initialFilters = parseInitialFilters(pageShell.dataset.initialFilters);
    const preservedAmenities = Array.isArray(initialFilters.amenities) ? initialFilters.amenities : [];
    const preservedCheckIn = initialFilters.checkIn || "";
    const preservedCheckOut = initialFilters.checkOut || "";
    let currentPage = getInitialPage();
    const categories = [
        { id: "all", label: "All", icon: "fa-border-all", keywords: [] },
        { id: "trending", label: "Trending", icon: "fa-fire", keywords: [] },
        { id: "beach", label: "Beach", icon: "fa-umbrella-beach", keywords: ["beach", "coast", "sea", "ocean", "goa"] },
        { id: "mountain", label: "Mountain", icon: "fa-mountain", keywords: ["mountain", "hill", "valley", "manali", "shimla", "himalaya"] },
        { id: "city", label: "Iconic Cities", icon: "fa-city", keywords: ["mumbai", "delhi", "bangalore", "kolkata", "pune", "hyderabad", "city"] },
        { id: "rooms", label: "Rooms", icon: "fa-door-open", keywords: ["room", "studio", "apartment", "flat"] },
        { id: "luxury", label: "Luxury", icon: "fa-gem", keywords: ["luxury", "premium", "palace", "villa", "resort"] },
        { id: "camping", label: "Camping", icon: "fa-campground", keywords: ["camp", "tent", "forest", "woods"] },
        { id: "farm", label: "Farms", icon: "fa-wheat-awn", keywords: ["farm", "fields", "village", "rural"] }
    ];

    let activeCategory = categories.some((item) => item.id === initialFilters.category) ? initialFilters.category : "all";

    const listings = Array.from(listingGrid.querySelectorAll(".listing-item")).map(createListingEntry);

    showLoadingState();
    await loadRemainingListings();

    const trendingMinPrice = getTrendingMinPrice(listings);
    const minPriceInData = getMinPrice(listings);
    const maxPriceInData = getMaxPrice(listings);

    renderCategoryChips();
    setupFilterRail();
    setupFilterPanel();
    populateCountryOptions();
    hydrateInitialFilters();
    updateDisplayedPrices();
    syncFormState();

    window.setTimeout(() => {
        applyFilters();
        hideLoadingState();
    }, 160);

    filterRoot.addEventListener("click", (event) => {
        const chip = event.target.closest(".airbnb-filter-chip");
        if (!chip) return;

        currentPage = 1;
        activeCategory = chip.dataset.category;
        setActiveChip(chip);
        scrollChipIntoView(chip);
        applyFilters();
    });

    if (taxToggle) taxToggle.addEventListener("change", updateDisplayedPrices);
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            currentPage = 1;
            applyFilters();
        });
    }
    if (navbarSearchForm) {
        navbarSearchForm.addEventListener("submit", (event) => {
            event.preventDefault();
            currentPage = 1;
            applyFilters();
        });
    }

    if (countryFilter) {
        countryFilter.addEventListener("change", () => {
            currentPage = 1;
            populateLocationOptions(countryFilter.value);
            applyFilters();
        });
    }

    if (locationFilter) {
        locationFilter.addEventListener("change", () => {
            currentPage = 1;
            applyFilters();
        });
    }
    if (minPriceFilter) {
        minPriceFilter.addEventListener("input", () => {
            currentPage = 1;
            applyFilters();
        });
    }
    if (maxPriceFilter) {
        maxPriceFilter.addEventListener("input", () => {
            currentPage = 1;
            applyFilters();
        });
    }
    if (clearFiltersButton) clearFiltersButton.addEventListener("click", resetAllFilters);
    if (noResultsResetButton) noResultsResetButton.addEventListener("click", resetAllFilters);

    if (saveSearchForm) {
        saveSearchForm.addEventListener("submit", () => {
            const state = getState();
            const parts = [state.category !== "all" ? capitalize(state.category) : "", state.location || state.country || state.q].filter(Boolean);
            setDataValue(saveInputs, "label", parts.join(" - ") || "Saved search");
        });
    }

    function hydrateInitialFilters() {
        if (searchInput && initialFilters.q) {
            searchInput.value = initialFilters.q;
        }

        if (countryFilter) {
            countryFilter.value = initialFilters.country || "";
        }

        populateLocationOptions(initialFilters.country || "");

        if (locationFilter) {
            locationFilter.value = initialFilters.location || "";
        }

        if (minPriceFilter) {
            minPriceFilter.min = "0";
            minPriceFilter.max = String(maxPriceInData);
            minPriceFilter.value = initialFilters.minPrice || String(minPriceInData);
        }

        if (maxPriceFilter) {
            maxPriceFilter.min = "0";
            maxPriceFilter.max = String(maxPriceInData);
            maxPriceFilter.value = initialFilters.maxPrice || String(maxPriceInData);
        }
    }

    function renderCategoryChips() {
        filterRoot.innerHTML = categories.map((category) => `
            <button
                type="button"
                class="airbnb-filter-chip ${category.id === activeCategory ? "active" : ""}"
                aria-pressed="${category.id === activeCategory ? "true" : "false"}"
                data-category="${category.id}">
                <i class="fa-solid ${category.icon}"></i>
                <span>${category.label}</span>
            </button>
        `).join("");
        updateFilterRailControls();
    }

    function setActiveChip(activeChipNode) {
        filterRoot.querySelectorAll(".airbnb-filter-chip").forEach((chip) => {
            chip.classList.toggle("active", chip === activeChipNode);
            chip.setAttribute("aria-pressed", String(chip === activeChipNode));
        });
    }

    function setupFilterRail() {
        if (!filterPrevButton || !filterNextButton) return;

        const scrollAmount = () => Math.max(filterRoot.clientWidth * 0.68, 180);

        filterPrevButton.addEventListener("click", () => {
            filterRoot.scrollBy({ left: -scrollAmount(), behavior: "smooth" });
        });

        filterNextButton.addEventListener("click", () => {
            filterRoot.scrollBy({ left: scrollAmount(), behavior: "smooth" });
        });

        filterRoot.addEventListener("scroll", updateFilterRailControls, { passive: true });
        window.addEventListener("resize", updateFilterRailControls);
        window.setTimeout(updateFilterRailControls, 0);
    }

    function setupFilterPanel() {
        if (!filterPanel || !filterPanelToggle) return;

        const shouldOpenInitially = filterPanel.dataset.hasActiveFilters === "true";
        setFilterPanelOpen(shouldOpenInitially);
        filterPanelToggle.addEventListener("click", () => {
            const isExpanded = filterPanelToggle.getAttribute("aria-expanded") === "true";
            setFilterPanelOpen(!isExpanded);
        });
    }

    function setFilterPanelOpen(isOpen) {
        if (!filterPanel || !filterPanelToggle) return;
        filterPanel.classList.toggle("is-collapsed", !isOpen);
        filterPanelToggle.classList.toggle("is-open", isOpen);
        filterPanelToggle.setAttribute("aria-expanded", String(isOpen));
    }

    function updateFilterRailControls() {
        if (!filterPrevButton || !filterNextButton) return;
        const maxScrollLeft = Math.max(filterRoot.scrollWidth - filterRoot.clientWidth, 0);
        const atStart = filterRoot.scrollLeft <= 4;
        const atEnd = filterRoot.scrollLeft >= maxScrollLeft - 4;

        filterPrevButton.classList.toggle("is-disabled", atStart);
        filterNextButton.classList.toggle("is-disabled", atEnd || maxScrollLeft === 0);
        filterPrevButton.setAttribute("aria-disabled", String(atStart));
        filterNextButton.setAttribute("aria-disabled", String(atEnd || maxScrollLeft === 0));
    }

    function scrollChipIntoView(chip) {
        if (!chip || typeof chip.scrollIntoView !== "function") return;
        chip.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        window.setTimeout(updateFilterRailControls, 180);
    }

    function populateCountryOptions() {
        if (!countryFilter) return;
        const countries = getUniqueSorted(listings.map((listing) => listing.country));
        countryFilter.innerHTML = `<option value="">All countries</option>`;
        countries.forEach((country) => {
            countryFilter.insertAdjacentHTML("beforeend", `<option value="${escapeAttr(country)}">${escapeHtml(country)}</option>`);
        });
    }

    function populateLocationOptions(selectedCountry) {
        if (!locationFilter) return;

        const normalizedCountry = (selectedCountry || "").toLowerCase();
        const filteredListings = normalizedCountry
            ? listings.filter((listing) => listing.countryLower === normalizedCountry)
            : listings;
        const locations = getUniqueSorted(filteredListings.map((listing) => listing.location));

        locationFilter.innerHTML = `<option value="">All locations</option>`;
        locations.forEach((location) => {
            locationFilter.insertAdjacentHTML("beforeend", `<option value="${escapeAttr(location)}">${escapeHtml(location)}</option>`);
        });
    }

    function applyFilters() {
        const state = getState();
        const category = categories.find((item) => item.id === state.category) || categories[0];
        const keywords = category.keywords;
        const matchedListings = listings.filter((listing) => {
            const matchesCategory = state.category === "trending"
                ? isTrending(listing)
                : matchesKeywordCategory(listing.searchableText, keywords);
            const matchesSearch = !state.q || listing.searchableText.includes(state.q);
            const matchesCountry = !state.country || listing.countryLower === state.country;
            const matchesLocation = !state.location || listing.locationLower === state.location;
            const matchesPrice = listing.price >= state.minPrice && listing.price <= state.maxPrice;
            return matchesCategory && matchesSearch && matchesCountry && matchesLocation && matchesPrice;
        });
        const visibleCount = matchedListings.length;
        const totalPages = Math.max(1, Math.ceil(visibleCount / CLIENT_PAGE_SIZE));

        currentPage = Math.min(Math.max(currentPage, 1), totalPages);

        const pageStart = (currentPage - 1) * CLIENT_PAGE_SIZE;
        const pageEnd = pageStart + CLIENT_PAGE_SIZE;
        const visibleListingIds = new Set(matchedListings.slice(pageStart, pageEnd).map((listing) => listing.card));

        listings.forEach((listing) => {
            listing.card.classList.toggle("d-none", !visibleListingIds.has(listing.card));
        });

        if (noResultsMessage) {
            noResultsMessage.classList.toggle("d-none", visibleCount > 0);
        }

        if (resultsStatus) {
            resultsStatus.textContent = visibleCount === 1 ? "1 stay available" : `${visibleCount} stays available`;
        }

        updateFilterVisualState(state, visibleCount);
        syncFormState();
        renderPagination(state, totalPages, visibleCount);
        syncUrl(state);
    }

    function resetAllFilters() {
        activeCategory = "all";
        renderCategoryChips();

        if (searchInput) searchInput.value = "";
        if (countryFilter) countryFilter.value = "";
        populateLocationOptions("");
        if (locationFilter) locationFilter.value = "";
        if (minPriceFilter) minPriceFilter.value = String(minPriceInData);
        if (maxPriceFilter) maxPriceFilter.value = String(maxPriceInData);

        currentPage = 1;
        applyFilters();
    }

    function updateFilterVisualState(state, visibleCount) {
        const hasCountry = Boolean(state.country);
        const hasLocation = Boolean(state.location);
        const hasSearch = Boolean(state.q);
        const hasCategory = state.category !== "all";
        const hasPrice = state.minPrice !== minPriceInData || state.maxPrice !== maxPriceInData;
        const activeCount = [hasSearch, hasCategory, hasCountry, hasLocation, hasPrice].filter(Boolean).length;

        if (countryFilterBadge) countryFilterBadge.textContent = hasCountry ? "1" : "0";
        if (locationFilterBadge) locationFilterBadge.textContent = hasLocation ? "1" : "0";
        if (activeFiltersBadge) activeFiltersBadge.textContent = String(activeCount);

        const countryPill = countryFilter?.closest(".filter-pill");
        const locationPill = locationFilter?.closest(".filter-pill");
        const pricePill = minPriceFilter?.closest(".price-pill");

        if (countryPill) countryPill.classList.toggle("has-selection", hasCountry);
        if (locationPill) locationPill.classList.toggle("has-selection", hasLocation);
        if (pricePill) pricePill.classList.toggle("has-selection", hasPrice);

        if (clearFiltersButton) {
            clearFiltersButton.classList.toggle("is-disabled", activeCount === 0);
            clearFiltersButton.setAttribute("aria-disabled", String(activeCount === 0));
        }

        if (visibleCount === 0 && noResultsMessage) {
            noResultsMessage.classList.remove("d-none");
        }
    }

    amenityLabels.forEach((label) => {
        const input = label.querySelector("input[type='checkbox']");
        if (!input) return;

        const syncAmenityState = () => {
            label.classList.toggle("is-checked", input.checked);
        };

        syncAmenityState();
        input.addEventListener("change", syncAmenityState);
    });

    function updateDisplayedPrices() {
        const showPriceWithTax = taxToggle && taxToggle.checked;
        listings.forEach((listing) => {
            if (!listing.priceNode) return;
            const finalPrice = showPriceWithTax ? Math.round(listing.price * (1 + TAX_RATE)) : listing.price;
            listing.priceNode.textContent = `\u20B9 ${finalPrice.toLocaleString("en-IN")}`;
        });
    }

    function syncFormState() {
        const state = getState();
        setDataValue(sortHiddenInputs, "q", searchInput?.value.trim() || "");
        setDataValue(sortHiddenInputs, "category", activeCategory);
        setDataValue(sortHiddenInputs, "country", countryFilter?.value || "");
        setDataValue(sortHiddenInputs, "location", locationFilter?.value || "");
        setDataValue(sortHiddenInputs, "minPrice", minPriceFilter?.value || "");
        setDataValue(sortHiddenInputs, "maxPrice", maxPriceFilter?.value || "");

        setDataValue(saveInputs, "q", searchInput?.value.trim() || "");
        setDataValue(saveInputs, "sort", sortSelect?.value || "newest");
        setDataValue(saveInputs, "category", activeCategory);
        setDataValue(saveInputs, "country", countryFilter?.value || "");
        setDataValue(saveInputs, "location", locationFilter?.value || "");
        setDataValue(saveInputs, "minPrice", String(state.minPrice));
        setDataValue(saveInputs, "maxPrice", String(state.maxPrice));
    }

    function syncUrl(state) {
        const params = new URLSearchParams(window.location.search);
        setParam(params, "q", searchInput?.value.trim() || "");
        setParam(params, "sort", sortSelect?.value || "newest");
        setParam(params, "category", activeCategory === "all" ? "" : activeCategory);
        setParam(params, "country", countryFilter?.value || "");
        setParam(params, "location", locationFilter?.value || "");
        setParam(params, "minPrice", state.minPrice === minPriceInData ? "" : String(state.minPrice));
        setParam(params, "maxPrice", state.maxPrice === maxPriceInData ? "" : String(state.maxPrice));
        setParam(params, "checkIn", preservedCheckIn);
        setParam(params, "checkOut", preservedCheckOut);
        params.delete("amenities");
        preservedAmenities.forEach((amenity) => params.append("amenities", amenity));
        params.set("page", String(currentPage));
        const nextUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({}, "", nextUrl);
    }

    function renderPagination(state, totalPages, visibleCount) {
        if (!paginationShell || !paginationPrev || !paginationNext || !paginationPages) return;

        paginationShell.classList.toggle("d-none", visibleCount <= CLIENT_PAGE_SIZE);
        paginationPages.innerHTML = "";

        if (visibleCount <= CLIENT_PAGE_SIZE) {
            paginationPrev.classList.add("disabled");
            paginationNext.classList.add("disabled");
            paginationPrev.setAttribute("aria-disabled", "true");
            paginationNext.setAttribute("aria-disabled", "true");
            paginationPrev.href = "#";
            paginationNext.href = "#";
            return;
        }

        for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
            const link = document.createElement("a");
            link.className = `pagination-page ${pageNumber === currentPage ? "active" : ""}`;
            link.dataset.pageNumber = String(pageNumber);
            link.href = buildListingHref(pageNumber, state);
            link.textContent = String(pageNumber);
            paginationPages.appendChild(link);
        }

        const isFirstPage = currentPage === 1;
        const isLastPage = currentPage === totalPages;

        paginationPrev.href = isFirstPage ? "#" : buildListingHref(currentPage - 1, state);
        paginationNext.href = isLastPage ? "#" : buildListingHref(currentPage + 1, state);
        paginationPrev.classList.toggle("disabled", isFirstPage);
        paginationNext.classList.toggle("disabled", isLastPage);
        paginationPrev.setAttribute("aria-disabled", String(isFirstPage));
        paginationNext.setAttribute("aria-disabled", String(isLastPage));
    }

    function buildListingHref(pageNumber, state) {
        const params = new URLSearchParams();
        setParam(params, "q", searchInput?.value.trim() || "");
        setParam(params, "sort", sortSelect?.value || "newest");
        setParam(params, "category", activeCategory === "all" ? "" : activeCategory);
        setParam(params, "country", countryFilter?.value || "");
        setParam(params, "location", locationFilter?.value || "");
        setParam(params, "minPrice", state.minPrice === minPriceInData ? "" : String(state.minPrice));
        setParam(params, "maxPrice", state.maxPrice === maxPriceInData ? "" : String(state.maxPrice));
        setParam(params, "checkIn", preservedCheckIn);
        setParam(params, "checkOut", preservedCheckOut);
        preservedAmenities.forEach((amenity) => params.append("amenities", amenity));
        params.set("page", String(pageNumber));
        return `/listings?${params.toString()}`;
    }

    function getState() {
        const selectedCountry = (countryFilter?.value || "").trim().toLowerCase();
        const selectedLocation = (locationFilter?.value || "").trim().toLowerCase();
        let minPrice = parsePriceInput(minPriceFilter?.value, minPriceInData);
        let maxPrice = parsePriceInput(maxPriceFilter?.value, maxPriceInData);

        if (minPrice > maxPrice) {
            const temp = minPrice;
            minPrice = maxPrice;
            maxPrice = temp;
        }

        return {
            q: (searchInput?.value || "").trim().toLowerCase(),
            category: activeCategory,
            country: selectedCountry,
            location: selectedLocation,
            minPrice,
            maxPrice,
        };
    }

    function showLoadingState() {
        if (listingSkeletons) listingSkeletons.classList.remove("d-none");
        if (listingGrid) listingGrid.classList.add("d-none");
        if (noResultsMessage) noResultsMessage.classList.add("d-none");
    }

    function hideLoadingState() {
        if (listingSkeletons) listingSkeletons.classList.add("d-none");
        if (listingGrid) listingGrid.classList.remove("d-none");
    }

    async function loadRemainingListings() {
        const targetCount = getServerListingCount();
        if (targetCount <= listings.length) return;

        const parser = new DOMParser();
        const baseParams = new URLSearchParams(window.location.search);
        const serverPageSize = Math.max(listings.length, 1);
        const totalServerPages = Math.max(1, Math.ceil(targetCount / serverPageSize));

        for (let pageNumber = 1; pageNumber <= totalServerPages && listings.length < targetCount; pageNumber += 1) {
            if (pageNumber === currentPage) continue;
            const params = new URLSearchParams(baseParams);
            params.set("page", String(pageNumber));

            try {
                const response = await fetch(`${window.location.pathname}?${params.toString()}`, {
                    credentials: "same-origin",
                    headers: {
                        "X-Requested-With": "XMLHttpRequest",
                    },
                });

                if (!response.ok) break;

                const html = await response.text();
                const documentFragment = parser.parseFromString(html, "text/html");
                const nextCards = Array.from(documentFragment.querySelectorAll("#listing-grid .listing-item"));

                if (!nextCards.length) break;

                nextCards.forEach((card) => {
                    const importedCard = document.importNode(card, true);
                    listingGrid.appendChild(importedCard);
                    listings.push(createListingEntry(importedCard));
                });
            } catch (error) {
                break;
            }
        }
    }

    function createListingEntry(card) {
        const title = (card.dataset.title || "").trim();
        const location = (card.dataset.location || "").trim();
        const country = (card.dataset.country || "").trim();
        const price = Number(card.dataset.price) || 0;

        return {
            card,
            title,
            location,
            country,
            titleLower: title.toLowerCase(),
            locationLower: location.toLowerCase(),
            countryLower: country.toLowerCase(),
            searchableText: `${title} ${location} ${country}`.toLowerCase().trim(),
            price,
            priceNode: card.querySelector(".price-value"),
        };
    }

    function getServerListingCount() {
        const statusText = resultsStatus?.textContent || "";
        const match = statusText.match(/(\d+)/);
        return match ? Number(match[1]) : listings.length;
    }

    function getInitialPage() {
        const params = new URLSearchParams(window.location.search);
        const parsed = Number.parseInt(params.get("page") || initialFilters.page || "1", 10);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
    }

    function matchesKeywordCategory(searchableText, keywords) {
        if (!keywords || !keywords.length) return true;
        return keywords.some((word) => searchableText.includes(word));
    }

    function getTrendingMinPrice(items) {
        const prices = items
            .map((item) => item.price)
            .filter((price) => price > 0)
            .sort((a, b) => b - a);

        if (!prices.length) return 0;
        const cutoffIndex = Math.max(0, Math.ceil(prices.length * 0.3) - 1);
        return prices[cutoffIndex];
    }

    function isTrending(listing) {
        const trendingWords = ["popular", "trending", "famous", "best", "iconic"];
        return listing.price >= trendingMinPrice || trendingWords.some((word) => listing.searchableText.includes(word));
    }

    function getUniqueSorted(values) {
        return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    }

    function getMinPrice(items) {
        const prices = items.map((item) => item.price).filter((price) => price > 0);
        return prices.length ? Math.min(...prices) : 0;
    }

    function getMaxPrice(items) {
        const prices = items.map((item) => item.price).filter((price) => price > 0);
        return prices.length ? Math.max(...prices) : 0;
    }

    function parsePriceInput(rawValue, fallback) {
        const normalizedValue = String(rawValue ?? "").trim();
        if (normalizedValue === "") {
            return fallback;
        }

        const parsed = Number(normalizedValue);
        return Number.isNaN(parsed) ? fallback : parsed;
    }

    function parseInitialFilters(rawValue) {
        try {
            return JSON.parse(rawValue || "{}");
        } catch (error) {
            return {};
        }
    }

    function setDataValue(nodes, key, value) {
        const node = nodes.find((entry) => entry.dataset.saveInput === key || entry.dataset.sortHidden === key);
        if (node) node.value = value;
    }

    function setParam(params, key, value) {
        if (value) {
            params.set(key, value);
        } else {
            params.delete(key);
        }
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function escapeAttr(value) {
        return escapeHtml(value);
    }

    function capitalize(value) {
        return String(value || "").charAt(0).toUpperCase() + String(value || "").slice(1);
    }
});

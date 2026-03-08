document.addEventListener("DOMContentLoaded", () => {
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
    const paginationLinks = Array.from(document.querySelectorAll("[data-page-number]"));

    if (!pageShell || !filterRoot || !listingGrid) return;

    const TAX_RATE = 0.18;
    const initialFilters = parseInitialFilters(pageShell.dataset.initialFilters);
    const preservedAmenities = Array.isArray(initialFilters.amenities) ? initialFilters.amenities : [];
    const preservedCheckIn = initialFilters.checkIn || "";
    const preservedCheckOut = initialFilters.checkOut || "";
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

    const listings = Array.from(listingGrid.querySelectorAll(".listing-item")).map((card) => {
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
    });

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

    showLoadingState();
    window.setTimeout(() => {
        applyFilters();
        hideLoadingState();
    }, 160);

    filterRoot.addEventListener("click", (event) => {
        const chip = event.target.closest(".airbnb-filter-chip");
        if (!chip) return;

        activeCategory = chip.dataset.category;
        setActiveChip(chip);
        scrollChipIntoView(chip);
        applyFilters();
    });

    if (taxToggle) taxToggle.addEventListener("change", updateDisplayedPrices);
    if (searchInput) searchInput.addEventListener("input", applyFilters);
    if (navbarSearchForm) {
        navbarSearchForm.addEventListener("submit", (event) => {
            event.preventDefault();
            applyFilters();
        });
    }

    if (countryFilter) {
        countryFilter.addEventListener("change", () => {
            populateLocationOptions(countryFilter.value);
            applyFilters();
        });
    }

    if (locationFilter) locationFilter.addEventListener("change", applyFilters);
    if (minPriceFilter) minPriceFilter.addEventListener("input", applyFilters);
    if (maxPriceFilter) maxPriceFilter.addEventListener("input", applyFilters);
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
        let visibleCount = 0;

        listings.forEach((listing) => {
            const matchesCategory = state.category === "trending"
                ? isTrending(listing)
                : matchesKeywordCategory(listing.searchableText, keywords);
            const matchesSearch = !state.q || listing.searchableText.includes(state.q);
            const matchesCountry = !state.country || listing.countryLower === state.country;
            const matchesLocation = !state.location || listing.locationLower === state.location;
            const matchesPrice = listing.price >= state.minPrice && listing.price <= state.maxPrice;
            const shouldShow = matchesCategory && matchesSearch && matchesCountry && matchesLocation && matchesPrice;

            listing.card.classList.toggle("d-none", !shouldShow);
            if (shouldShow) visibleCount += 1;
        });

        if (noResultsMessage) {
            noResultsMessage.classList.toggle("d-none", visibleCount > 0);
        }

        updateFilterVisualState(state, visibleCount);
        syncFormState();
        syncUrl(state);
        updatePaginationLinks(state);
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
        params.set("page", "1");
        const nextUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({}, "", nextUrl);
    }

    function updatePaginationLinks(state) {
        paginationLinks.forEach((link) => {
            const pageNumber = Number(link.dataset.pageNumber || "1");
            if (!Number.isInteger(pageNumber) || pageNumber < 1 || link.classList.contains("disabled")) return;

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
            link.href = `/listings?${params.toString()}`;
        });
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

document.addEventListener("DOMContentLoaded", () => {
    const filterRoot = document.getElementById("airbnb-filters");
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

    if (!filterRoot || !listingGrid) return;

    const TAX_RATE = 0.18;
    let activeCategory = "all";

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

    const listings = Array.from(listingGrid.querySelectorAll(".listing-item")).map((card) => {
        const title = (card.dataset.title || "").trim();
        const location = (card.dataset.location || "").trim();
        const country = (card.dataset.country || "").trim();
        const price = Number(card.dataset.price) || 0;

        return {
            card,
            titleLower: title.toLowerCase(),
            locationLower: location.toLowerCase(),
            countryLower: country.toLowerCase(),
            searchableText: `${title} ${location} ${country}`.toLowerCase().trim(),
            location,
            country,
            price,
            priceNode: card.querySelector(".price-value")
        };
    });

    const trendingMinPrice = getTrendingMinPrice(listings);
    const minPriceInData = getMinPrice(listings);
    const maxPriceInData = getMaxPrice(listings);

    renderCategoryChips();
    populateCountryOptions();
    populateLocationOptions("");
    initializePriceInputs();
    updateDisplayedPrices();

    showLoadingState();
    window.setTimeout(() => {
        applyFilters();
        hideLoadingState();
    }, 220);

    filterRoot.addEventListener("click", (event) => {
        const chip = event.target.closest(".airbnb-filter-chip");
        if (!chip) return;

        activeCategory = chip.dataset.category;
        setActiveChip(chip);
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

    if (clearFiltersButton) {
        clearFiltersButton.addEventListener("click", resetAllFilters);
    }

    if (noResultsResetButton) {
        noResultsResetButton.addEventListener("click", resetAllFilters);
    }

    function renderCategoryChips() {
        filterRoot.innerHTML = categories
            .map((category) => `
                <button
                    type="button"
                    class="airbnb-filter-chip ${category.id === activeCategory ? "active" : ""}"
                    data-category="${category.id}">
                    <i class="fa-solid ${category.icon}"></i>
                    <span>${category.label}</span>
                </button>
            `)
            .join("");
    }

    function setActiveChip(activeChipNode) {
        filterRoot.querySelectorAll(".airbnb-filter-chip").forEach((chip) => {
            chip.classList.toggle("active", chip === activeChipNode);
        });
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

    function initializePriceInputs() {
        if (!minPriceFilter || !maxPriceFilter) return;

        minPriceFilter.value = String(minPriceInData);
        maxPriceFilter.value = String(maxPriceInData);

        minPriceFilter.min = "0";
        maxPriceFilter.min = "0";
        minPriceFilter.max = String(maxPriceInData);
        maxPriceFilter.max = String(maxPriceInData);
    }

    function applyFilters() {
        const query = (searchInput?.value || "").trim().toLowerCase();
        const selectedCountry = (countryFilter?.value || "").trim().toLowerCase();
        const selectedLocation = (locationFilter?.value || "").trim().toLowerCase();

        let minPrice = parsePriceInput(minPriceFilter?.value, minPriceInData);
        let maxPrice = parsePriceInput(maxPriceFilter?.value, maxPriceInData);
        if (minPrice > maxPrice) {
            const temp = minPrice;
            minPrice = maxPrice;
            maxPrice = temp;
        }

        const category = categories.find((item) => item.id === activeCategory) || categories[0];
        const keywords = category.keywords;
        let visibleCount = 0;

        listings.forEach((listing) => {
            const matchesCategory =
                activeCategory === "trending"
                    ? isTrending(listing)
                    : matchesKeywordCategory(listing.searchableText, keywords);

            const matchesSearch = !query || listing.searchableText.includes(query);
            const matchesCountry = !selectedCountry || listing.countryLower === selectedCountry;
            const matchesLocation = !selectedLocation || listing.locationLower === selectedLocation;
            const matchesPrice = listing.price >= minPrice && listing.price <= maxPrice;

            const shouldShow = matchesCategory && matchesSearch && matchesCountry && matchesLocation && matchesPrice;
            listing.card.classList.toggle("d-none", !shouldShow);
            if (shouldShow) visibleCount += 1;
        });

        if (noResultsMessage) noResultsMessage.classList.toggle("d-none", visibleCount > 0);
        updateFilterVisualState(query, selectedCountry, selectedLocation, minPrice, maxPrice, visibleCount);
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

    function updateFilterVisualState(query, selectedCountry, selectedLocation, minPrice, maxPrice, visibleCount) {
        const hasCountry = Boolean(selectedCountry);
        const hasLocation = Boolean(selectedLocation);
        const hasSearch = Boolean(query);
        const hasCategory = activeCategory !== "all";
        const hasPrice = minPrice !== minPriceInData || maxPrice !== maxPriceInData;
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
            clearFiltersButton.title = activeCount === 0 ? "No filters selected" : "Clear all filters";
        }

        if (visibleCount === 0 && noResultsMessage) {
            noResultsMessage.classList.remove("d-none");
        }
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
        if (!keywords || keywords.length === 0) return true;
        return keywords.some((word) => searchableText.includes(word));
    }

    function getTrendingMinPrice(items) {
        const pricesDesc = items
            .map((item) => item.price)
            .filter((price) => price > 0)
            .sort((a, b) => b - a);

        if (!pricesDesc.length) return 0;
        const cutoffIndex = Math.max(0, Math.ceil(pricesDesc.length * 0.3) - 1);
        return pricesDesc[cutoffIndex];
    }

    function isTrending(listing) {
        const trendingWords = ["popular", "trending", "famous", "best", "iconic"];
        const hasTrendingWord = trendingWords.some((word) => listing.searchableText.includes(word));
        return listing.price >= trendingMinPrice || hasTrendingWord;
    }

    function updateDisplayedPrices() {
        const showPriceWithTax = taxToggle && taxToggle.checked;

        listings.forEach((listing) => {
            if (!listing.priceNode) return;
            const finalPrice = showPriceWithTax
                ? Math.round(listing.price * (1 + TAX_RATE))
                : listing.price;
            listing.priceNode.textContent = `\u20B9 ${finalPrice.toLocaleString("en-IN")}`;
        });
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
        const value = String(rawValue ?? "").trim();
        if (value === "") return fallback;
        const parsed = Number(value);
        return Number.isNaN(parsed) ? fallback : parsed;
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
});

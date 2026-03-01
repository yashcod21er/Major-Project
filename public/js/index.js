document.addEventListener("DOMContentLoaded", () => {
    const filterRoot = document.getElementById("airbnb-filters");
    const listingGrid = document.getElementById("listing-grid");
    const noResultsMessage = document.getElementById("no-listings-message");
    const taxToggle = document.getElementById("tax-toggle-input");

    const searchInput = document.getElementById("navbar-search-input");
    const countryFilter = document.getElementById("country-filter");
    const locationFilter = document.getElementById("location-filter");
    const minPriceFilter = document.getElementById("min-price-filter");
    const maxPriceFilter = document.getElementById("max-price-filter");
    const clearFiltersButton = document.getElementById("clear-filters-btn");
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

    applyFilters();
    updateDisplayedPrices();

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
        clearFiltersButton.addEventListener("click", () => {
            activeCategory = "all";
            renderCategoryChips();

            if (searchInput) searchInput.value = "";
            if (countryFilter) countryFilter.value = "";
            populateLocationOptions("");
            if (locationFilter) locationFilter.value = "";
            if (minPriceFilter) minPriceFilter.value = String(minPriceInData);
            if (maxPriceFilter) maxPriceFilter.value = String(maxPriceInData);

            applyFilters();
        });
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

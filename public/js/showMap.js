(() => {
    const mapEl = document.getElementById("listing-map");
    if (!mapEl) return;

    const title = (mapEl.dataset.title || "Listing").trim();
    const location = (mapEl.dataset.location || "").trim();
    const country = (mapEl.dataset.country || "").trim();
    const query = [location, country].filter(Boolean).join(", ");

    const showFallback = (message) => {
        mapEl.classList.add("map-fallback");
        mapEl.textContent = message;
    };

    if (!query) {
        showFallback("Location is not available for this listing.");
        return;
    }

    if (typeof L === "undefined") {
        showFallback("Map library failed to load.");
        return;
    }

    const endpoint = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;

    fetch(endpoint, { headers: { Accept: "application/json" } })
        .then((response) => {
            if (!response.ok) throw new Error("Geocoding failed");
            return response.json();
        })
        .then((results) => {
            if (!Array.isArray(results) || results.length === 0) {
                showFallback("Could not find this location on OpenStreetMap.");
                return;
            }

            const lat = Number(results[0].lat);
            const lon = Number(results[0].lon);
            if (Number.isNaN(lat) || Number.isNaN(lon)) {
                showFallback("Invalid coordinates returned for this listing.");
                return;
            }

            const map = L.map(mapEl, { scrollWheelZoom: false });
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);

            map.setView([lat, lon], 13);

            const marker = L.marker([lat, lon]).addTo(map);
            marker.bindPopup(`<strong>${escapeHtml(title)}</strong><br>${escapeHtml(query)}`).openPopup();
        })
        .catch(() => {
            showFallback("Unable to load map right now.");
        });

    function escapeHtml(value) {
        return value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})();

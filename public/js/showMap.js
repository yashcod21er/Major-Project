(() => {
    const mapEl = document.getElementById("listing-map");
    if (!mapEl) return;

    const title = (mapEl.dataset.title || "Listing").trim();
    const location = (mapEl.dataset.location || "").trim();
    const country = (mapEl.dataset.country || "").trim();
    const label = (mapEl.dataset.label || [location, country].filter(Boolean).join(", ")).trim();
    const rawLat = (mapEl.dataset.lat || "").trim();
    const rawLng = (mapEl.dataset.lng || "").trim();
    const lat = Number(rawLat);
    const lng = Number(rawLng);

    const showFallback = (message) => {
        mapEl.classList.add("map-fallback");
        mapEl.textContent = message;
    };

    if (typeof L === "undefined") {
        showFallback("Map library failed to load.");
        return;
    }

    if (!rawLat || !rawLng || Number.isNaN(lat) || Number.isNaN(lng)) {
        showFallback("Location coordinates are not available for this listing yet.");
        return;
    }

    const map = L.map(mapEl, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    map.setView([lat, lng], 13);

    const marker = L.marker([lat, lng]).addTo(map);
    marker.bindPopup(`<strong>${escapeHtml(title)}</strong><br>${escapeHtml(label)}`).openPopup();

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})();

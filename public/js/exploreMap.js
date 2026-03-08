document.addEventListener("DOMContentLoaded", () => {
    const root = document.querySelector("[data-explore-root]");
    const mapEl = document.getElementById("explore-map");
    const cards = Array.from(document.querySelectorAll("[data-listing-card]"));

    if (!root || !mapEl || typeof window.L === "undefined") {
        return;
    }

    let listings = [];
    try {
        listings = JSON.parse(root.dataset.listings || "[]").filter((listing) => typeof listing.lat === "number" && typeof listing.lng === "number");
    } catch (error) {
        listings = [];
    }

    if (!listings.length) {
        mapEl.textContent = "No geocoded listings available for map explore yet.";
        return;
    }

    const map = window.L.map(mapEl, { scrollWheelZoom: false });
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const bounds = [];
    const markers = new Map();

    listings.forEach((listing) => {
        const marker = window.L.marker([listing.lat, listing.lng])
            .addTo(map)
            .bindPopup(`<strong>${escapeHtml(listing.title)}</strong><br>${escapeHtml(listing.location)}, ${escapeHtml(listing.country)}<br>Rs. ${Number(listing.price || 0).toLocaleString("en-IN")} / night`);

        markers.set(String(listing.id), marker);
        bounds.push([listing.lat, listing.lng]);
    });

    map.fitBounds(bounds, { padding: [30, 30] });

    cards.forEach((card) => {
        card.addEventListener("mouseenter", () => {
            const marker = markers.get(String(card.dataset.id));
            const lat = Number(card.dataset.lat);
            const lng = Number(card.dataset.lng);

            if (marker && Number.isFinite(lat) && Number.isFinite(lng)) {
                map.flyTo([lat, lng], Math.max(map.getZoom(), 12), { duration: 0.4 });
                marker.openPopup();
            }
        });
    });

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
});

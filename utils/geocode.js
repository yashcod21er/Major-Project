const buildQuery = (location, country) => [location, country].filter(Boolean).join(", ").trim();

module.exports = async function geocodeLocation(location, country) {
    const query = buildQuery(location, country);
    if (!query) {
        return null;
    }

    const endpoint = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;

    try {
        const response = await fetch(endpoint, {
            headers: {
                Accept: "application/json",
                "User-Agent": "UrbanStay/1.0",
            },
        });

        if (!response.ok) {
            return null;
        }

        const results = await response.json();
        if (!Array.isArray(results) || !results.length) {
            return null;
        }

        const lat = Number(results[0].lat);
        const lng = Number(results[0].lon);

        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            return null;
        }

        return {
            lat,
            lng,
            placeLabel: results[0].display_name || query,
            lastGeocodedAt: new Date(),
        };
    } catch (error) {
        return null;
    }
};

const OVERPASS_API_URL = process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter";

const escapeLabel = (value) => String(value || "").replace(/\s+/g, " ").trim();

module.exports = async function fetchNearbyPlaces(geo) {
    if (!geo || typeof geo.lat !== "number" || typeof geo.lng !== "number") {
        return [];
    }

    const query = `
        [out:json][timeout:25];
        (
          node["amenity"~"cafe|restaurant|bar|fast_food"](around:1800,${geo.lat},${geo.lng});
          node["tourism"~"attraction|museum|gallery|viewpoint"](around:2200,${geo.lat},${geo.lng});
          node["leisure"~"park|beach_resort"](around:2200,${geo.lat},${geo.lng});
        );
        out body;
    `;

    try {
        const response = await fetch(OVERPASS_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain",
            },
            body: query,
        });

        if (!response.ok) {
            return [];
        }

        const payload = await response.json();
        const places = (payload.elements || [])
            .map((element) => escapeLabel(element.tags?.name || element.tags?.brand || element.tags?.amenity || element.tags?.tourism))
            .filter(Boolean);

        return [...new Set(places)].slice(0, 6);
    } catch (error) {
        return [];
    }
};

const CACHE_NAME = "urbanstay-shell-v1";
const ASSETS = [
    "/",
    "/listings",
    "/css/style.css?v=20260301-12",
    "/assets/icon-192.svg",
    "/assets/icon-512.svg",
];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
        )
    );
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) =>
            cachedResponse || fetch(event.request).catch(() => caches.match("/listings"))
        )
    );
});

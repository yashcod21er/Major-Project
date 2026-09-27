if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map((registration) => registration.unregister()));

            if ("caches" in window) {
                const cacheKeys = await caches.keys();
                await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
            }
        } catch (error) {
            // Ignore cache cleanup failures in the browser.
        }
    });
}

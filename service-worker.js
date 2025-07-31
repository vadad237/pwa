/* Manifest version: J6PDzkdc */
/* Safe Long-Term Offline PWA Service Worker */
// Caution! Offline works until user clears data or storage runs out

self.importScripts('./service-worker-assets.js');

const cacheNamePrefix = 'offline-cache-';
const cacheName = `${cacheNamePrefix}${self.assetsManifest.version}`;
const offlineAssetsInclude = [
    /\.dll$/, /\.pdb$/, /\.wasm/, /\.html$/, /\.js$/, /\.json$/,
    /\.css$/, /\.woff$/, /\.png$/, /\.jpe?g$/, /\.gif$/, /\.ico$/,
    /\.blat$/, /\.dat$/
];
const offlineAssetsExclude = [/^service-worker\.js$/];

// Replace with your base path if hosting on subfolder
const base = "/pwa/";
const baseUrl = new URL(base, self.origin);
const manifestUrlList = self.assetsManifest.assets.map(asset => new URL(asset.url, baseUrl).href);

self.addEventListener('install', event => {
    console.info('Service worker: Install');
    event.waitUntil(onInstall());
});

self.addEventListener('activate', event => {
    console.info('Service worker: Activate');
    event.waitUntil(onActivate());
});

self.addEventListener('fetch', event => {
    event.respondWith(onFetch(event));
});

async function onInstall() {
    // Pre-cache app shell + static assets
    try {
        const assetsRequests = self.assetsManifest.assets
            .filter(asset => offlineAssetsInclude.some(pattern => pattern.test(asset.url)))
            .filter(asset => !offlineAssetsExclude.some(pattern => pattern.test(asset.url)))
            .map(asset => new Request(asset.url, { cache: 'no-cache' }));

        const cache = await caches.open(cacheName);
        await cache.addAll(assetsRequests);

        console.info('Service worker: Assets cached successfully.');
    } catch (err) {
        console.error('Service worker: Install failed', err);
    }
}

async function onActivate() {
    const cacheKeys = await caches.keys();
    // Remove old versions but keep current one
    await Promise.all(
        cacheKeys
            .filter(key => key.startsWith(cacheNamePrefix) && key !== cacheName)
            .map(key => caches.delete(key))
    );
    console.info('Service worker: Old caches removed.');
}

async function onFetch(event) {
    if (event.request.method !== 'GET') {
        return fetch(event.request);
    }

    const shouldServeIndexHtml =
        event.request.mode === 'navigate' &&
        !manifestUrlList.some(url => url === event.request.url);

    const request = shouldServeIndexHtml ? 'index.html' : event.request;
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
        // Serve from cache if available
        return cachedResponse;
    }

    try {
        // Try network if not in cache
        const networkResponse = await fetch(event.request);
        return networkResponse;
    } catch {
        // If network fails and it's a navigation request, serve index.html
        if (shouldServeIndexHtml) {
            return await cache.match('index.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
}

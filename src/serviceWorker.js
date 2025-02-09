self.addEventListener('fetch', event => {
    // Only handle http/https requests.
    if (!/^https?:/.test(event.request.url)) {
        // Let the request fall through without caching.
        return;
    }

    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request).then(networkResponse => {
                return caches.open('chrome-extension').then(cache => {
                    // Optionally check that the response is valid before caching
                    if (networkResponse.ok) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                });
            });
        }).catch(() => {
            // Optional: Return a fallback response if needed.
        })
    );
});
// Listen for a one-time message from the content script.



export async function triggerFilter(filter) {
    let platform = 'none'; // Default platform

    // Check the current URL to determine the platform
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tabUrl = tab.url;

    if (tabUrl.includes('linkedin.com/feed/')) {
        platform = 'linkedin';
    } else if (tabUrl.includes('twitter.com/home') || tabUrl.includes('x.com/home')) {
        platform = 'twitter';
    }
    const response = await chrome.tabs.sendMessage(tab.id, { platform, filter });
    // do something with response here, not outside the function
    console.log(response);
}
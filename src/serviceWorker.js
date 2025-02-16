// Global state
let isRunning = false;

// Cache handling
self.addEventListener('fetch', event => {
    if (!/^https?:/.test(event.request.url)) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request).then(networkResponse => {
                return caches.open('chrome-extension').then(cache => {
                    if (networkResponse.ok) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                });
            });
        }).catch(() => {
            // Handle fetch failures silently
        })
    );
});

// Helper functions
async function getCurrentTab() {
    const queryOptions = { active: true, lastFocusedWindow: true };
    const [tab] = await chrome.tabs.query(queryOptions);
    return tab;
}

async function isCSPDisabled() {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    const urls = rules.map(rule => rule.condition.urlFilter);
    const { url } = await getCurrentTab();
    return urls.some(item => item === url);
}

async function disableCSP(tabId) {
    if (isRunning) return;
    isRunning = true;

    const addRules = [];
    const removeRuleIds = [];
    const { url } = await getCurrentTab();

    if (!await isCSPDisabled()) {
        addRules.push({
            id: Math.floor(Math.random() * 2147483647),
            action: {
                type: 'modifyHeaders',
                responseHeaders: [{
                    header: 'content-security-policy',
                    operation: 'set',
                    value: ''
                }]
            },
            condition: {
                urlFilter: url,
                resourceTypes: ['main_frame', 'sub_frame']
            }
        });
        chrome.browsingData.remove({}, { serviceWorkers: true }, () => {
            // Reload the page after CSP rules are updated and service workers are removed
            chrome.tabs.reload(tabId);
        });
    } else {
        const rules = await chrome.declarativeNetRequest.getSessionRules();
        rules.forEach(rule => {
            if (rule.condition.urlFilter === url) {
                removeRuleIds.push(rule.id);
            }
        });
    }

    await chrome.declarativeNetRequest.updateSessionRules({ addRules, removeRuleIds });
    isRunning = false;
}

// Platform detection and message handling
async function handleTabUpdate(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tab.url) {
        if (tab.url.includes('linkedin.com/feed/')) {
            await disableCSP(tabId);
        }
    }
}

export async function triggerFilter(filter, mark) {
    let platform = 'none';

    const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true
    });

    const tabUrl = tab.url;

    if (tabUrl.includes('linkedin.com/feed/')) {
        platform = 'linkedin';
    } else if (tabUrl.includes('twitter.com/home') || tabUrl.includes('x.com/home')) {
        platform = 'twitter';
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
        platform,
        filter,
        mark
    });

    console.log(response);
}

// Initialize listeners
chrome.tabs.onUpdated.addListener(handleTabUpdate);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle any additional message passing here
    return true;
});
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	// The require scope
/******/ 	var __webpack_require__ = {};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
/*!******************************!*\
  !*** ./src/serviceWorker.js ***!
  \******************************/
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   triggerFilter: () => (/* binding */ triggerFilter)
/* harmony export */ });
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
            id: tabId,
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
        chrome.browsingData.remove({}, { serviceWorkers: true }, () => { });
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

async function triggerFilter(filter, mark) {
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
/******/ })()
;
//# sourceMappingURL=serviceWorker.bundle.js.map
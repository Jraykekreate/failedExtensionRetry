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



async function triggerFilter(filter, mark) {
    let platform = 'none'; // Default platform

    // Check the current URL to determine the platform
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tabUrl = tab.url;

    if (tabUrl.includes('linkedin.com/feed/')) {
        platform = 'linkedin';
    } else if (tabUrl.includes('twitter.com/home') || tabUrl.includes('x.com/home')) {
        platform = 'twitter';
    }
    const response = await chrome.tabs.sendMessage(tab.id, { platform, filter, mark });
    // do something with response here, not outside the function
    console.log(response);
}
/******/ })()
;
//# sourceMappingURL=serviceWorker.bundle.js.map
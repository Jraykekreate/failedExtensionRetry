import { semanticSimilarity } from "./semanticSimilarity";

// Global queue for sequential dismissals
let dismissalQueue = [];
let processingDismissals = false;

function enqueueDismissTask(task) {
    dismissalQueue.push(task);
    processDismissQueue();
}

function processDismissQueue() {
    if (processingDismissals) return;
    processingDismissals = true;
    (async () => {
        while (dismissalQueue.length > 0) {
            const task = dismissalQueue.shift();
            await task();
            // Instead of waiting 1000ms (too long), wait 100ms between tasks.
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        processingDismissals = false;
    })();
}

(function () {
    // Configuration with updated delays to ensure each dismiss is under 600ms total
    const MAX_POSTS = 10;
    const DISMISS_THRESHOLD = 0.4;
    // New timing settings (each delay is well below 600ms)
    const POPUP_TIMEOUT = 300;            // Reduced from 800ms to 300ms
    const POST_DISMISS_DELAY = 150;         // Reduced from 500ms to 150ms delay before dismissing posts
    const SEQUENTIAL_DISMISS_DELAY = 50;    // Reduced from 200ms to 50ms delay between sequential dismissals

    // Semantic similarity thresholds
    const SIMILARITY_THRESHOLDS = {
        HIGH: 0.7,    // Green
        MEDIUM: 0.4   // Yellow (below is Red)
    };

    // Platform-specific selectors
    const SELECTORS = {
        linkedin: {
            dismissButton: '[aria-label^="Dismiss post by"]',
            notInterested: '[aria-label^="I don\'t want to see"]',
            postContainer: '.feed-shared-update-v2',
            popupContainer: '.update-components-hidden-update-v2',
            postTitle: 'div.feed-shared-update-v2__description div.update-components-text span.break-words > span[dir="ltr"]'
        },
        twitter: {
            tweetText: 'div[data-testid="tweetText"] > span',
            moreButton: 'button[aria-label="More"][data-testid="caret"]',
            dropdown: 'div[data-testid="Dropdown"]',
            tweetArticle: 'article[data-testid="tweet"]'
        }
    };

    // Track processed posts and state
    let results = [];
    let processedCount = 0;
    let processedPosts = new Map(); // Store references to processed posts
    let filterKeyword = ''; // The current filter keyword
    let isDismissing = false; // Flag to track if we're currently dismissing posts
    let activeDropdown = null; // For Twitter dropdown tracking
    let shouldMark = false; // Flag to control whether to mark posts

    // Create controls for an individual post
    const createPostControls = (postElement, postInfo, platform) => {
        const controlsContainer = document.createElement('div');
        controlsContainer.style.cssText = `
            position: absolute;
            top: 40px;
            right: 10px;
            display: flex;
            flex-direction: column;
            gap: 5px;
            z-index: 1000;
        `;

        // Delete button
        const deleteButton = document.createElement('button');
        deleteButton.style.cssText = `
            padding: 4px 8px;
            background-color: #ff4444;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            opacity: 0.9;
            transition: opacity 0.3s;
        `;
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('mouseenter', () => deleteButton.style.opacity = '1');
        deleteButton.addEventListener('mouseleave', () => deleteButton.style.opacity = '0.9');
        deleteButton.onclick = async () => {
            if (platform === 'linkedin') {
                const dismissButton = postElement.querySelector(SELECTORS.linkedin.dismissButton);
                if (dismissButton) {
                    await dismissLinkedInPost(dismissButton, postInfo, postElement);
                }
            } else {
                await dismissTwitterPost(postElement, postInfo);
            }
        };

        // Unmark button
        const unmarkButton = document.createElement('button');
        unmarkButton.style.cssText = `
            padding: 4px 8px;
            background-color: #666666;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            opacity: 0.9;
            transition: opacity 0.3s;
        `;
        unmarkButton.textContent = 'Unmark';
        unmarkButton.addEventListener('mouseenter', () => unmarkButton.style.opacity = '1');
        unmarkButton.addEventListener('mouseleave', () => unmarkButton.style.opacity = '0.9');
        unmarkButton.onclick = () => {
            const data = processedPosts.get(postElement);
            if (data?.markers) {
                data.markers.marker.remove();
                data.markers.scoreDisplay.remove();
                controlsContainer.remove();
            }
            processedPosts.delete(postElement);
        };

        controlsContainer.appendChild(deleteButton);
        controlsContainer.appendChild(unmarkButton);

        // Only append the controls if marking is enabled
        if (shouldMark) {
            postElement.appendChild(controlsContainer);
        }

        return controlsContainer;
    };

    // Create and add a marker to the post based on the similarity score
    const addMarker = (postElement, score) => {
        const marker = document.createElement('div');
        marker.style.cssText = `
            position: absolute;
            top: 10px;
            left: 10px;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            z-index: 1000;
            border: 2px solid white;
            box-shadow: 0 0 3px rgba(0,0,0,0.3);
        `;

        let color;
        if (score >= SIMILARITY_THRESHOLDS.HIGH) {
            color = '#4CAF50';
        } else if (score >= SIMILARITY_THRESHOLDS.MEDIUM) {
            color = '#FFC107';
        } else {
            color = '#F44336';
        }
        marker.style.backgroundColor = color;

        const scoreDisplay = document.createElement('div');
        scoreDisplay.style.cssText = `
            position: absolute;
            top: 10px;
            left: 30px;
            font-size: 12px;
            font-weight: bold;
            color: ${color};
            background-color: rgba(255, 255, 255, 0.9);
            padding: 2px 6px;
            border-radius: 4px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            z-index: 1000;
        `;
        scoreDisplay.textContent = `${(score * 100).toFixed(1)}%`;

        marker.title = `Similarity Score: ${(score * 100).toFixed(1)}%`;

        // Ensure the post element is positioned relatively so markers show correctly
        if (getComputedStyle(postElement).position === 'static') {
            postElement.style.position = 'relative';
        }

        postElement.appendChild(marker);
        postElement.appendChild(scoreDisplay);
        return { marker, scoreDisplay };
    };

    // LinkedIn-specific: observe the popup and auto-click "Not Interested"
    const handleLinkedInPopup = (postContainer) => {
        if (!shouldMark) return;
        console.log("LinkedIn: Starting to observe popup for post:", postContainer);
        const observer = new MutationObserver((mutations, obs) => {
            const notInterestedBtn = postContainer.querySelector(SELECTORS.linkedin.notInterested);
            if (notInterestedBtn) {
                notInterestedBtn.click();
                console.log("LinkedIn: Clicked 'Not Interested' for post:", postContainer);
                obs.disconnect();
            }
        });

        observer.observe(postContainer, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            observer.disconnect();
            console.log("LinkedIn: Popup handling timeout");
        }, POPUP_TIMEOUT);
    };

    // Dismiss a LinkedIn post sequentially
    const dismissLinkedInPost = async (button, postInfo, postContainer) => {
        if (!shouldMark) return; // Only proceed if marking is enabled
        enqueueDismissTask(async () => {
            console.log(`LinkedIn: Will dismiss post ${postInfo.postNumber}: "${postInfo.title}" after ${POST_DISMISS_DELAY}ms`);
            postContainer.style.transition = 'background-color 0.3s ease';
            postContainer.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';

            await new Promise(resolve => setTimeout(resolve, POST_DISMISS_DELAY));

            button.click();
            postInfo.dismissed = true;
            handleLinkedInPopup(postContainer);
        });
    };

    // Twitter-specific: find the "Not Interested" button in the dropdown
    const findNotInterestedButton = (dropdown) => {
        if (!shouldMark) return null;
        const menuItems = dropdown.querySelectorAll('div[role="menuitem"]');
        for (const item of menuItems) {
            if (item.textContent.toLowerCase().includes('not interested in this')) {
                return item;
            }
        }
        return null;
    };

    // New helper function to handle Twitter dropdown ad options
    const handleTwitterAdDropdown = (dropdown) => {
        if (!dropdown) return;
        // Check if any descendant contains "why is ad ?"
        const hasAdText = Array.from(dropdown.querySelectorAll('*')).some(el =>
            el.textContent.toLowerCase().includes('why is ad ?')
        );
        if (hasAdText) {
            // Find the first element with text containing "mute"
            const muteOption = Array.from(dropdown.querySelectorAll('*')).find(el =>
                el.textContent.toLowerCase().includes('mute')
            );
            if (muteOption) {
                console.log('Twitter: Found ad text and clicking the mute option.');
                muteOption.click();
            } else {
                console.log('Twitter: "why is ad ?" was found but no "mute" option exists.');
            }
        }
    };

    // Updated dismissTwitterPost function
    const dismissTwitterPost = async (tweet, postInfo) => {
        if (!shouldMark) return;
        enqueueDismissTask(async () => {
            console.log(`Twitter: Will dismiss tweet ${postInfo.postNumber}: "${postInfo.title}" in ${POST_DISMISS_DELAY}ms`);
            tweet.style.transition = 'background-color 0.3s ease';
            tweet.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';

            const moreButton = tweet.querySelector(SELECTORS.twitter.moreButton);
            if (moreButton) {
                moreButton.click();

                await new Promise(resolve => {
                    const checkDropdown = setInterval(() => {
                        const dropdown = document.querySelector(SELECTORS.twitter.dropdown);
                        if (dropdown) {
                            clearInterval(checkDropdown);
                            activeDropdown = dropdown;
                            resolve();
                        }
                    }, 100);
                    setTimeout(() => {
                        clearInterval(checkDropdown);
                        resolve();
                    }, POPUP_TIMEOUT);
                });

                if (activeDropdown) {
                    // Check for ad text and click mute if found
                    handleTwitterAdDropdown(activeDropdown);

                    // Fallback: click the "not interested" option if available
                    const notInterestedButton = findNotInterestedButton(activeDropdown);
                    if (notInterestedButton) {
                        await new Promise(resolve => setTimeout(resolve, POST_DISMISS_DELAY));
                        notInterestedButton.click();
                        postInfo.dismissed = true;
                    }
                    activeDropdown = null;
                }
            }

            await new Promise(resolve => setTimeout(resolve, SEQUENTIAL_DISMISS_DELAY));
        });
    };

    // Delete all posts with a low (red) similarity score
    const deleteAllRedPosts = async () => {
        console.log(Array.from(processedPosts.entries()));
        const redPosts = Array.from(processedPosts.entries())
            .filter(([_, data]) => data.info.score < SIMILARITY_THRESHOLDS.MEDIUM);

        for (const [postElement, data] of redPosts) {
            const platform = window.location.href.includes('linkedin.com') ? 'linkedin' : 'twitter';
            if (platform === 'linkedin') {
                const dismissButton = postElement.querySelector(SELECTORS.linkedin.dismissButton);
                if (dismissButton) {
                    await dismissLinkedInPost(dismissButton, data.info, postElement);
                }
            } else {
                await dismissTwitterPost(postElement, data.info);
            }
        }
    };

    // Process a single post (LinkedIn or Twitter) based on the filter keyword
    const processPost = async (element, index, platform) => {
        if (!filterKeyword) return;

        let postContainer, postInfo;

        if (platform === 'linkedin') {
            postContainer = element.closest(SELECTORS.linkedin.postContainer);
            if (!postContainer || processedPosts.has(postContainer)) return;

            postInfo = {
                postNumber: index + 1,
                dismissed: false,
                notInterestedClicked: false,
                title: 'Unknown',
                score: 0
            };

            const titleElement = postContainer.querySelector(SELECTORS.linkedin.postTitle);
            postInfo.title = titleElement?.firstChild?.textContent.trim().slice(0, 60) + '...';
        } else {
            postContainer = element;
            if (processedPosts.has(postContainer)) return;

            postInfo = {
                postNumber: index + 1,
                dismissed: false,
                title: 'Unknown',
                score: 0
            };

            const tweetTextElement = postContainer.querySelector(SELECTORS.twitter.tweetText);
            postInfo.title = tweetTextElement?.textContent.trim().slice(0, 60) + '...';
        }

        try {
            const text = postContainer.textContent;
            postInfo.score = await semanticSimilarity(text, filterKeyword);
        } catch (error) {
            console.error('Error calculating semantic similarity:', error);
            postInfo.score = Math.random();
        }

        const markers = addMarker(postContainer, postInfo.score);
        const controls = createPostControls(postContainer, postInfo, platform);

        processedPosts.set(postContainer, {
            info: postInfo,
            markers: markers,
            controls: controls
        });

        if (shouldMark && postInfo.score < DISMISS_THRESHOLD) {
            if (platform === 'linkedin') {
                dismissLinkedInPost(element, postInfo, postContainer);
            } else {
                dismissTwitterPost(postContainer, postInfo);
            }
        }

        results.push(postInfo);
        processedCount++;

        if (processedCount === MAX_POSTS) {
            showFinalReport();
        }
    };

    // Log the final results to the console
    const showFinalReport = () => {
        console.log('%cProcessing Complete!', 'color: green; font-size: 16px;');
        console.table(results);
    };

    // Start processing posts on LinkedIn
    const startProcessingLinkedIn = () => {
        if (!filterKeyword) {
            console.log("LinkedIn: No filter keyword set, skipping processing.");
            return;
        }
        const dismissButtons = Array.from(document.querySelectorAll(SELECTORS.linkedin.dismissButton))
            .filter(btn => !processedPosts.has(btn.closest(SELECTORS.linkedin.postContainer)))
            .slice(0, MAX_POSTS);

        if (dismissButtons.length > 0) {
            dismissButtons.forEach((btn, index) => processPost(btn, index, 'linkedin'));
        }
    };

    // Start processing posts on Twitter
    const startProcessingTwitter = () => {
        if (!filterKeyword) {
            console.log("Twitter: No filter keyword set, skipping processing.");
            return;
        }
        const tweets = Array.from(document.querySelectorAll(SELECTORS.twitter.tweetArticle))
            .filter(tweet => !processedPosts.has(tweet))
            .slice(0, MAX_POSTS);

        if (tweets.length > 0) {
            tweets.forEach((tweet, index) => processPost(tweet, index, 'twitter'));
        }
    };

    // Event listener for scrolling to trigger processing
    window.addEventListener('scroll', () => {
        const currentURL = window.location.href;
        if (currentURL.includes("linkedin.com/feed/")) {
            startProcessingLinkedIn();
        } else if (currentURL.includes("x.com")) {
            startProcessingTwitter();
        }
    });

    // Event listener to clear the active Twitter dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (activeDropdown && !activeDropdown.contains(e.target)) {
            activeDropdown = null;
        }
    });

    // Message listener for runtime messages (e.g., from a background script)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log("Message received:", request);
        if (request.action === 'deleteRedPosts') {
            deleteAllRedPosts();
            return;
        }

        // Clear existing state
        processedPosts.forEach((data, post) => {
            if (data.markers) {
                data.markers.marker.remove();
                data.markers.scoreDisplay.remove();
            }
            const controls = post.querySelector('div[style*="position: absolute"][style*="right: 10px"]');
            if (controls) controls.remove();
            post.style.backgroundColor = '';
        });
        processedPosts.clear();
        results = [];
        processedCount = 0;
        isDismissing = false;
        activeDropdown = null;

        // Update filter and marking behavior based on the message
        filterKeyword = request.filter;
        shouldMark = request.mark;
        console.log(`New filter keyword set: ${filterKeyword}, Marking enabled: ${shouldMark}`);

        // Begin processing on the appropriate platform
        if (request.platform.includes("linkedin")) {
            console.log("LinkedIn: Initiating processing after message update.");
            startProcessingLinkedIn();
        } else if (request.platform.includes("twitter")) {
            console.log("Twitter: Initiating processing after message update.");
            startProcessingTwitter();
        }
    });
})();

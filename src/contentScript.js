import { semanticSimilarity } from "./semanticSimilarity";


(function () {
    // Configuration
    const MAX_POSTS = 20;
    const DISMISS_THRESHOLD = 0.4;
    const POPUP_TIMEOUT = 800;
    const POST_DISMISS_DELAY = 600;
    const SEQUENTIAL_DISMISS_DELAY = 200;

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

    // Helper function to search for a LinkedIn dropdown option that includes
    // the text "hide or report this ad"
    const findHideOrReportButton = (container) => {
        // First, attempt to locate the dropdown container using its selector
        const popup = container.querySelector(SELECTORS.linkedin.popupContainer);
        if (popup) {
            const options = popup.querySelectorAll('button, div, span');
            for (const option of options) {
                if (option.textContent && option.textContent.toLowerCase().includes('hide')) {
                    return option;
                }
            }
        }
        // Fallback: search in the entire container
        const options = container.querySelectorAll('button, div, span');
        for (const option of options) {
            if (option.textContent && option.textContent.toLowerCase().includes('hide')) {
                return option;
            }
        }
        return null;
    };

    // LinkedIn-specific: observe the popup and auto-click "Hide or Report This Ad"
    const handleLinkedInPopup = (postContainer) => {
        if (!shouldMark) return;
        console.log("LinkedIn: Starting to observe popup for post:", postContainer);

        const observer = new MutationObserver((mutations, obs) => {
            // Check for an option to "Hide or Report This Ad" first
            const hideReportBtn = findHideOrReportButton(postContainer);
            if (hideReportBtn) {
                hideReportBtn.click();
                console.log("LinkedIn: Clicked 'Hide or Report This Ad' for post:", postContainer);
                obs.disconnect();
                return;
            }

            // Fallback to the default "Not Interested" button if available
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

    // Dismiss a LinkedIn post
    const dismissLinkedInPost = async (button, postInfo, postContainer) => {
        if (!shouldMark || isDismissing) return;
        isDismissing = true;

        console.log(`LinkedIn: Will dismiss post ${postInfo.postNumber}: "${postInfo.title}" in ${POST_DISMISS_DELAY}ms`);
        postContainer.style.transition = 'background-color 0.3s ease';
        postContainer.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';

        await new Promise(resolve => setTimeout(resolve, POST_DISMISS_DELAY));

        button.click();
        postInfo.dismissed = true;
        handleLinkedInPopup(postContainer);

        await new Promise(resolve => setTimeout(resolve, SEQUENTIAL_DISMISS_DELAY));
        isDismissing = false;
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

    // Twitter-specific: find the "mute" button in the dropdown
    const findMuteButton = (dropdown) => {
        const menuItems = dropdown.querySelectorAll('div[role="menuitem"]');
        for (const item of menuItems) {
            if (item.textContent.toLowerCase().includes('mute')) {
                return item;
            }
        }
        return null;
    };

    // Add this helper function among the Twitter-specific functions
    const observeTwitterSheetDialog = () => {
        const observer = new MutationObserver((mutations, obs) => {
            const dialog = document.querySelector('div[data-testid="sheetDialog"]');
            if (dialog) {
                // Look for a button or link with text including "maybe later"
                const maybeLaterButton = Array.from(dialog.querySelectorAll('button, a'))
                    .find(btn => btn.textContent && btn.textContent.toLowerCase().includes('maybe later'));
                if (maybeLaterButton) {
                    maybeLaterButton.click();
                    console.log("Twitter: 'Maybe later' clicked in sheetDialog.");
                    obs.disconnect();
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
            observer.disconnect();
            console.log("Twitter: Sheet dialog observer timed out.");
        }, POPUP_TIMEOUT);
    };

    // Dismiss a Twitter post
    const dismissTwitterPost = async (tweet, postInfo) => {
        if (!shouldMark || isDismissing) return;
        isDismissing = true;

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
                const notInterestedButton = findNotInterestedButton(activeDropdown);
                if (notInterestedButton) {
                    await new Promise(resolve => setTimeout(resolve, POST_DISMISS_DELAY));
                    notInterestedButton.click();
                    postInfo.dismissed = true;
                } else {
                    const muteButton = findMuteButton(activeDropdown);
                    if (muteButton) {
                        await new Promise(resolve => setTimeout(resolve, POST_DISMISS_DELAY));
                        muteButton.click();

                        postInfo.dismissed = true;
                        observeTwitterSheetDialog()
                    }
                }
                activeDropdown = null;
            }
        }

        await new Promise(resolve => setTimeout(resolve, SEQUENTIAL_DISMISS_DELAY));
        isDismissing = false;
    };

    // Delete all posts with a low (red) similarity score
    const deleteAllRedPosts = async () => {
        // First pass: Get all posts with a similarity score below the MEDIUM threshold (i.e., "red" posts)
        const redPosts = Array.from(processedPosts.entries())
            .filter(([_, data]) => data.info.score < SIMILARITY_THRESHOLDS.MEDIUM);

        console.log(`First pass: Found ${redPosts.length} posts to delete`);

        // First pass - trigger delete buttons using the existing UI controls
        for (const [postElement, data] of redPosts) {
            const controls = data.controls;
            if (controls) {
                const deleteButton = controls.querySelector('button');
                if (deleteButton) {
                    deleteButton.click();
                    await new Promise(resolve => setTimeout(resolve, SEQUENTIAL_DISMISS_DELAY));
                }
            }
        }

        // Wait briefly to allow any animations and state updates to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Second pass - find any remaining marked posts that haven't been dismissed
        const remainingPosts = Array.from(processedPosts.entries())
            .filter(([_, data]) => data.info.score < SIMILARITY_THRESHOLDS.MEDIUM && !data.info.dismissed);

        console.log(`Second pass: Found ${remainingPosts.length} remaining posts to delete`);

        for (const [postElement, data] of remainingPosts) {
            const controls = data.controls;
            if (controls) {
                const deleteButton = controls.querySelector('button');
                if (deleteButton) {
                    deleteButton.click();
                    await new Promise(resolve => setTimeout(resolve, SEQUENTIAL_DISMISS_DELAY));
                }
            }
        }
    };

    // Process a single post (LinkedIn or Twitter) based on the filter keyword
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

            // Updated LinkedIn title element selector and text processing
            const titleElement = postContainer.querySelector('.update-components-update-v2__commentary');
            if (!titleElement) {
                console.warn("No title element found for LinkedIn post");
                return;
            }
            const titleText = titleElement.textContent.trim();
            console.log(titleText.slice(0, 60))
            postInfo.title = titleText.slice(0, 60) + (titleText.length > 60 ? '...' : '');

            try {
                // Use only title text for similarity calculation
                console.log("title", postInfo.title, filterKeyword)
                postInfo.score = await semanticSimilarity(postInfo.title, filterKeyword);
            } catch (error) {
                const modalBackdrop = document.createElement('div');
                modalBackdrop.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0, 0, 0, 0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 9999;
                    cursor: pointer;
                `;

                const modalContent = document.createElement('div');
                modalContent.style.cssText = `
                    background-color: white;
                    padding: 20px;
                    border-radius: 8px;
                    text-align: center;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
                    width: 300px; /* Adjusted width */
                    border: 1px solid #ccc; /* Added border */
                `;

                const retryButton = document.createElement('button');
                retryButton.textContent = 'Retry';
                retryButton.style.cssText = `
                    background-color: #4CAF50;
                    color: white;
                    padding: 10px 15px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-top: 15px; /* Added margin */
                `;
                retryButton.addEventListener('click', () => location.reload());

                modalContent.appendChild(document.createTextNode(
                    "Error processing request.  Click 'Retry' to refresh and try again."
                ));
                modalContent.appendChild(retryButton);

                modalBackdrop.appendChild(modalContent);
                // No need for separate event listener on modalBackdrop
                // The click event is now handled by the button.

                document.body.appendChild(modalBackdrop);
                document.body.appendChild(modalBackdrop);

                console.error('Error calculating semantic similarity:', error);
            }
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

            try {
                const text = postContainer.textContent.trim().slice(0, 60);
                postInfo.score = await semanticSimilarity(text, filterKeyword);
            } catch (error) {
                console.error('Error calculating semantic similarity:', error);
            }
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

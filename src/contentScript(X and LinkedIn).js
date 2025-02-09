import { semanticSimilarity } from "./semanticSimilarity";

(function () {
    alert("im here")
    // Configuration
    const MAX_POSTS = 10;
    const DISMISS_THRESHOLD = 0.6;
    const POPUP_TIMEOUT = 1500;
    const POST_DISMISS_DELAY = 1000; // 1 second delay before dismissing
    const SEQUENTIAL_DISMISS_DELAY = 500; // 0.5 second between dismissals

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

    // Track processed posts
    let results = [];
    let processedCount = 0;
    let processedPosts = new Map(); // Store references to processed posts
    let filterKeyword = ''; // Store the current filter keyword
    let isDismissing = false; // Flag to track if we're currently dismissing posts
    let activeDropdown = null; // For Twitter dropdown tracking

    // Create and add marker to post
    const addMarker = (postElement, score) => {
        const marker = document.createElement('div');
        marker.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            z-index: 1000;
            border: 2px solid white;
            box-shadow: 0 0 3px rgba(0,0,0,0.3);
        `;

        // Set color based on score
        if (score >= SIMILARITY_THRESHOLDS.HIGH) {
            marker.style.backgroundColor = '#4CAF50'; // Green
        } else if (score >= SIMILARITY_THRESHOLDS.MEDIUM) {
            marker.style.backgroundColor = '#FFC107'; // Yellow
        } else {
            marker.style.backgroundColor = '#F44336'; // Red
        }

        // Add tooltip
        marker.title = `Similarity Score: ${(score * 100).toFixed(1)}%`;

        // Ensure post element has relative positioning
        if (getComputedStyle(postElement).position === 'static') {
            postElement.style.position = 'relative';
        }

        postElement.appendChild(marker);
        return marker;
    };

    // LinkedIn-specific functions
    const handleLinkedInPopup = (postContainer) => {
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

    const dismissLinkedInPost = async (button, postInfo, postContainer) => {
        if (isDismissing) return;
        isDismissing = true;

        console.log(`LinkedIn: Will dismiss post ${postInfo.postNumber}: "${postInfo.title}" in ${POST_DISMISS_DELAY}ms`);
        postContainer.style.transition = 'background-color 0.3s ease';
        postContainer.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
        console.log("LinkedIn: Post background set for dismissal:", postContainer);

        await new Promise(resolve => setTimeout(resolve, POST_DISMISS_DELAY));

        button.click();
        console.log("LinkedIn: Dismiss button clicked for post", postInfo.postNumber);
        postInfo.dismissed = true;
        handleLinkedInPopup(postContainer);

        await new Promise(resolve => setTimeout(resolve, SEQUENTIAL_DISMISS_DELAY));
        isDismissing = false;
    };

    // Twitter-specific functions
    const findNotInterestedButton = (dropdown) => {
        const menuItems = dropdown.querySelectorAll('div[role="menuitem"]');
        for (const item of menuItems) {
            const text = item.textContent.toLowerCase();
            if (text.includes('not interested in this')) {
                return item;
            }
        }
        return null;
    };

    const dismissTwitterPost = async (tweet, postInfo) => {
        if (isDismissing) return;
        isDismissing = true;

        console.log(`Twitter: Will dismiss tweet ${postInfo.postNumber}: "${postInfo.title}" in ${POST_DISMISS_DELAY}ms`);
        tweet.style.transition = 'background-color 0.3s ease';
        tweet.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
        console.log("Twitter: Tweet background set for dismissal:", tweet);

        const moreButton = tweet.querySelector(SELECTORS.twitter.moreButton);
        if (moreButton) {
            moreButton.click();
            console.log("Twitter: More button clicked for tweet", postInfo.postNumber);

            await new Promise(resolve => {
                const checkDropdown = setInterval(() => {
                    const dropdown = document.querySelector(SELECTORS.twitter.dropdown);
                    if (dropdown) {
                        clearInterval(checkDropdown);
                        activeDropdown = dropdown;
                        console.log("Twitter: Dropdown found for tweet", postInfo.postNumber);
                        resolve();
                    }
                }, 100);
                setTimeout(() => {
                    clearInterval(checkDropdown);
                    console.log("Twitter: Dropdown check timed out for tweet", postInfo.postNumber);
                    resolve();
                }, POPUP_TIMEOUT);
            });

            if (activeDropdown) {
                const notInterestedButton = findNotInterestedButton(activeDropdown);
                if (notInterestedButton) {
                    console.log("Twitter: Not Interested button found in dropdown for tweet", postInfo.postNumber);
                    await new Promise(resolve => setTimeout(resolve, POST_DISMISS_DELAY));
                    notInterestedButton.click();
                    console.log("Twitter: Dismiss action executed for tweet", postInfo.postNumber);
                    postInfo.dismissed = true;
                }
                activeDropdown = null;
            }
        }

        await new Promise(resolve => setTimeout(resolve, SEQUENTIAL_DISMISS_DELAY));
        isDismissing = false;
    };

    // Process posts based on platform
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
            console.log(`LinkedIn: Processing post ${postInfo.postNumber} with title:`, postInfo.title);
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
            console.log(`Twitter: Processing tweet ${postInfo.postNumber} with title:`, postInfo.title);
        }

        try {
            const text = postContainer.textContent;
            postInfo.score = await semanticSimilarity(text, filterKeyword);
            console.log(
                `${platform === 'linkedin' ? 'LinkedIn' : 'Twitter'}: Semantic similarity score for post ${postInfo.postNumber}: ${postInfo.score}`
            );
        } catch (error) {
            console.error('Error calculating semantic similarity:', error);
            postInfo.score = Math.random();
        }

        const marker = addMarker(postContainer, postInfo.score);

        processedPosts.set(postContainer, {
            info: postInfo,
            marker: marker
        });

        if (postInfo.score < DISMISS_THRESHOLD) {
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

    // Function to show final results
    const showFinalReport = () => {
        console.log('%cProcessing Complete!', 'color: green; font-size: 16px;');
        console.table(results);
    };

    // Platform-specific processing starters
    const startProcessingLinkedIn = () => {
        if (!filterKeyword) {
            console.log("LinkedIn: No filter keyword set, skipping processing.");
            return;
        }
        console.log("LinkedIn: Starting processing of posts.");
        const dismissButtons = Array.from(document.querySelectorAll(SELECTORS.linkedin.dismissButton))
            .filter(btn => !processedPosts.has(btn.closest(SELECTORS.linkedin.postContainer)))
            .slice(0, MAX_POSTS);

        if (dismissButtons.length > 0) {
            console.log(`LinkedIn: Found ${dismissButtons.length} posts to process`);
            dismissButtons.forEach((btn, index) => processPost(btn, index, 'linkedin'));
        } else {
            console.log('LinkedIn: No dismiss buttons found');
        }
        alert("Content has been loaded for LinkedIn."); // Alert for LinkedIn content load
    };

    const startProcessingTwitter = () => {
        if (!filterKeyword) {
            console.log("Twitter: No filter keyword set, skipping processing.");
            return;
        }
        console.log("Twitter: Starting processing of tweets.");
        const tweets = Array.from(document.querySelectorAll(SELECTORS.twitter.tweetArticle))
            .filter(tweet => !processedPosts.has(tweet))
            .slice(0, MAX_POSTS);

        if (tweets.length > 0) {
            console.log(`Twitter: Found ${tweets.length} tweets to process`);
            tweets.forEach((tweet, index) => processPost(tweet, index, 'twitter'));
        } else {
            console.log('Twitter: No tweets found');
        }
        alert("Content has been loaded for Twitter."); // Alert for Twitter content load
    };

    // Scroll event handler
    window.addEventListener('scroll', () => {
        const currentURL = window.location.href;
        console.log("Scroll event detected, current URL:", currentURL);
        if (currentURL.includes("linkedin.com/feed/")) {
            console.log("LinkedIn: Detected feed on scroll event.");
            startProcessingLinkedIn();
        } else if (currentURL.includes("twitter.com")) {
            console.log("Twitter: Detected feed on scroll event.");
            startProcessingTwitter();
        }
    });

    // Twitter-specific click handler for dropdowns
    document.addEventListener('click', (e) => {
        if (activeDropdown && !activeDropdown.contains(e.target)) {
            console.log("Twitter: Click outside active dropdown, clearing dropdown state");
            activeDropdown = null;
        }
    });

    // Message listener
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log("Message received:", request);
        // Clear existing state
        processedPosts.forEach((data, post) => {
            if (data.marker && data.marker.parentNode) {
                data.marker.remove();
            }
            post.style.backgroundColor = '';
        });
        processedPosts.clear();
        results = [];
        processedCount = 0;
        isDismissing = false;
        activeDropdown = null;

        // Set new filter keyword
        filterKeyword = request.filter;
        console.log(`New filter keyword set: ${filterKeyword}`);

        // Alert the change
        alert(`${request.platform} ${request.filter} ${request.mark}`);

        // Start processing based on platform
        if (request.platform.includes("linkedin")) {
            console.log("LinkedIn: Initiating processing after message update.");
            startProcessingLinkedIn();
        } else if (request.platform.includes("twitter")) {
            console.log("Twitter: Initiating processing after message update.");
            startProcessingTwitter();
        }
    });
})();
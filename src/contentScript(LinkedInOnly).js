import { semanticSimilarity } from "./semanticSimilarity";

(function () {
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

    // Track processed posts
    let results = [];
    let processedCount = 0;
    let processedPosts = new Map(); // Store references to processed posts
    let filterKeyword = ''; // Store the current filter keyword
    let isDismissing = false; // Flag to track if we're currently dismissing posts

    // Robust selectors
    const SELECTORS = {
        dismissButton: '[aria-label^="Dismiss post by"]',
        notInterested: '[aria-label^="I don\'t want to see"]',
        postContainer: '.feed-shared-update-v2',
        popupContainer: '.update-components-hidden-update-v2'
    };

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

    // Function to handle the "Not Interested" popup
    const handlePopup = (postContainer) => {
        const observer = new MutationObserver((mutations, obs) => {
            const notInterestedBtn = postContainer.querySelector(SELECTORS.notInterested);
            if (notInterestedBtn) {
                notInterestedBtn.click();
                console.log('Clicked "Not Interested" for post');
                obs.disconnect();
            }
        });

        observer.observe(postContainer, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            observer.disconnect();
            console.log('Popup handling timeout');
        }, POPUP_TIMEOUT);
    };

    // Function to dismiss a post with delay
    const dismissPost = async (button, postInfo, postContainer) => {
        if (isDismissing) return; // Don't start new dismissal if one is in progress
        isDismissing = true;

        console.log(`Will dismiss post ${postInfo.postNumber}: "${postInfo.title}" in ${POST_DISMISS_DELAY}ms`);

        // Highlight the post that will be dismissed
        postContainer.style.transition = 'background-color 0.3s ease';
        postContainer.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';

        await new Promise(resolve => setTimeout(resolve, POST_DISMISS_DELAY));

        button.click();
        postInfo.dismissed = true;
        handlePopup(postContainer);

        // Wait a bit before allowing next dismissal
        await new Promise(resolve => setTimeout(resolve, SEQUENTIAL_DISMISS_DELAY));
        isDismissing = false;
    };

    // Function to process a single post
    const processPost = async (button, index) => {
        if (!filterKeyword) return;

        const postContainer = button.closest(SELECTORS.postContainer);
        if (!postContainer || processedPosts.has(postContainer)) return;

        const postInfo = {
            postNumber: index + 1,
            dismissed: false,
            notInterestedClicked: false,
            title: 'Unknown',
            score: 0
        };

        // Get post title/content
        const titleElement = postContainer.querySelector('div.feed-shared-update-v2__description div.update-components-text span.break-words > span[dir="ltr"]');
        postInfo.title = titleElement?.firstChild?.textContent.trim().slice(0, 60) + '...';

        // Calculate semantic similarity score using the filter keyword
        try {
            const text1 = postContainer.textContent;
            postInfo.score = await semanticSimilarity(text1, filterKeyword);
        } catch (error) {
            console.error('Error calculating semantic similarity:', error);
            postInfo.score = Math.random(); // Fallback for testing
        }

        // Add visual marker
        const marker = addMarker(postContainer, postInfo.score);

        // Store reference to post and its marker
        processedPosts.set(postContainer, {
            info: postInfo,
            marker: marker
        });

        if (postInfo.score < DISMISS_THRESHOLD) {
            dismissPost(button, postInfo, postContainer);
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

    // Function to start processing posts
    const startProcessingLinkedIn = () => {
        if (!filterKeyword) return;

        const dismissButtons = Array.from(document.querySelectorAll(SELECTORS.dismissButton))
            .filter(btn => !processedPosts.has(btn.closest(SELECTORS.postContainer)))
            .slice(0, MAX_POSTS);

        if (dismissButtons.length > 0) {
            console.log(`Found ${dismissButtons.length} posts to process`);
            dismissButtons.forEach((btn, index) => processPost(btn, index));
        } else {
            console.log('No dismiss buttons found');
        }
    };

    // Scroll event handler
    window.addEventListener('scroll', () => {
        if (window.location.href.includes("linkedin.com/feed/")) {
            startProcessing();
        }
    });

    // Message listener
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.platform.includes("linkedin")) {
            // Clear existing state
            processedPosts.forEach((data, post) => {
                if (data.marker && data.marker.parentNode) {
                    data.marker.remove();
                }
                // Reset any highlighting
                post.style.backgroundColor = '';
            });
            processedPosts.clear();
            results = [];
            processedCount = 0;
            isDismissing = false;

            // Set new filter keyword
            filterKeyword = request.filter;
            console.log(`New filter keyword set: ${filterKeyword}`);

            // Alert the change
            alert(`${request.platform} ${request.filter}`);

            // Start processing with new filter
            startProcessingLinkedIn();
        }
    });
})();
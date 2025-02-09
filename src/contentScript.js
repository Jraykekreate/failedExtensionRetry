(function () {
    // Configuration
    const MAX_POSTS = 10;
    const DISMISS_THRESHOLD = 0.6;
    const POPUP_TIMEOUT = 1500;

    // Semantic similarity thresholds
    const SIMILARITY_THRESHOLDS = {
        HIGH: 0.7,    // Green
        MEDIUM: 0.4   // Yellow (below is Red)
    };

    // Track processed posts
    const results = [];
    let processedCount = 0;
    const processedPosts = new Map(); // Store references to processed posts

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

    // Function to process a single post
    const processPost = async (button, index) => {
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
        const titleElement = postContainer.querySelector('span[dir="ltr"]');
        postInfo.title = titleElement?.firstChild?.textContent.trim().slice(0, 50) + '...';

        // Calculate semantic similarity score
        // Assuming semanticSimilarity is defined elsewhere
        try {
            // Replace these with your actual text comparison logic
            const text1 = postContainer.textContent;
            const text2 = "business"; // Define your reference text
            postInfo.score = await semanticSimilarity(text1, text2);
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
            console.log(`Dismissing post ${postInfo.postNumber}: "${postInfo.title}"`);
            button.click();
            postInfo.dismissed = true;
            handlePopup(postContainer);
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

    // Scroll event handler
    window.addEventListener('scroll', () => {
        if (window.location.href.includes("linkedin.com/feed/")) {
            const dismissButtons = Array.from(document.querySelectorAll(SELECTORS.dismissButton))
                .filter(btn => !processedPosts.has(btn.closest(SELECTORS.postContainer)));

            dismissButtons.forEach((btn, index) => processPost(btn, index));
        }
    });

    // Initial processing
    const dismissButtons = Array.from(document.querySelectorAll(SELECTORS.dismissButton))
        .slice(0, MAX_POSTS);

    if (dismissButtons.length > 0) {
        console.log(`Found ${dismissButtons.length} posts to process`);
        dismissButtons.forEach((btn, index) => processPost(btn, index));
    } else {
        console.log('No dismiss buttons found');
    }

    // Message listener
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.platform.includes("linkedin")) {
            // Clear existing markers
            processedPosts.forEach((data, post) => {
                if (data.marker && data.marker.parentNode) {
                    data.marker.remove();
                }
            });
            processedPosts.clear();
            results.length = 0;
            processedCount = 0;
        }
        alert(`${request.platform} ${request.filter}`);
    });
})();
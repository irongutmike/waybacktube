// Enhanced Search Interceptor
class SearchInterceptor {
    constructor(maxDate, shortsBlocker) {
        this.maxDate = maxDate;
        this.shortsBlocker = shortsBlocker;
        this.interceptedElements = new WeakSet();
        this.originalSubmitHandler = null;
        this.isIntercepting = false;
    }

    setMaxDate(date) {
        this.maxDate = new Date(date);
    }

    setupSearchInterception() {
        this.log('Setting up search interception...');
        
        // Intercept search form submissions
        this.interceptSearchForms();
        
        // Intercept search input enter key
        this.interceptSearchInputs();
        
        // Intercept search button clicks
        this.interceptSearchButtons();
        
        // Intercept video clicks from search results
        this.interceptVideoClicks();
        
        // Clean up search results
        this.cleanupSearchResults();
        
        // Monitor for new search elements
        this.monitorForNewElements();
    }

    interceptSearchForms() {
        const interceptForm = (form) => {
            if (this.interceptedElements.has(form)) return;
            this.interceptedElements.add(form);

            const originalSubmit = form.onsubmit;
            form.onsubmit = (e) => {
                e.preventDefault();
                const input = form.querySelector('input#search');
                if (input && input.value.trim()) {
                    this.performSearch(input.value.trim(), input);
                }
                return false;
            };

            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const input = form.querySelector('input#search');
                if (input && input.value.trim()) {
                    this.performSearch(input.value.trim(), input);
                }
            });
        };

        // Find all search forms
        const searchForms = document.querySelectorAll('form[role="search"], form#search-form, ytd-searchbox form');
        searchForms.forEach(interceptForm);
    }

    interceptSearchInputs() {
        const interceptInput = (input) => {
            if (this.interceptedElements.has(input)) return;
            this.interceptedElements.add(input);

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && input.value.trim()) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.performSearch(input.value.trim(), input);
                }
            });
        };

        // Find all search inputs
        const searchInputs = document.querySelectorAll('input#search, input[name="search_query"]');
        searchInputs.forEach(interceptInput);
    }

    interceptSearchButtons() {
        const interceptButton = (btn) => {
            if (this.interceptedElements.has(btn)) return;
            this.interceptedElements.add(btn);

            btn.addEventListener('click', (e) => {
                const input = document.querySelector('input#search, input[name="search_query"]');
                if (input && input.value.trim()) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.performSearch(input.value.trim(), input);
                }
            });
        };

        // Find all search buttons
        const searchButtons = document.querySelectorAll(
            '#search-icon-legacy button, ' +
            'button[aria-label="Search"], ' +
            'ytd-searchbox button, ' +
            '.search-button'
        );
        searchButtons.forEach(interceptButton);
    }

    interceptVideoClicks() {
        const interceptVideoLink = (link) => {
            if (this.interceptedElements.has(link)) return;
            this.interceptedElements.add(link);

            link.addEventListener('click', (e) => {
                // Only intercept if we're on a search results page
                if (!this.isSearchResultsPage()) return;
                
                // Only intercept video watch links
                const href = link.getAttribute('href');
                if (!href || !href.includes('/watch?v=')) return;
                
                this.log('Intercepting video click from search results:', href);
                
                e.preventDefault();
                e.stopPropagation();
                
                // Show loading indicator
                this.showVideoLoadingIndicator();
                
                // Store that we're navigating from search results
                sessionStorage.setItem('tm-from-search', 'true');
                sessionStorage.setItem('tm-target-url', href);
                
                // Navigate to the video
                window.location.href = href;
            });
        };

        // Find all video links in search results
        const videoLinks = document.querySelectorAll(
            'ytd-video-renderer a[href*="/watch?v="], ' +
            'ytd-compact-video-renderer a[href*="/watch?v="], ' +
            'ytd-grid-video-renderer a[href*="/watch?v="], ' +
            'ytd-rich-item-renderer a[href*="/watch?v="], ' +
            'a#video-title[href*="/watch?v="], ' +
            'a.ytd-video-renderer[href*="/watch?v="]'
        );
        videoLinks.forEach(interceptVideoLink);
    }

    isSearchResultsPage() {
        return window.location.pathname === '/results' || 
               window.location.search.includes('search_query=');
    }

    showVideoLoadingIndicator() {
        // Remove any existing loading indicator
        const existingIndicator = document.getElementById('tm-video-loading');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        // Create a loading overlay for video navigation
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'tm-video-loading';
        loadingOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(15, 15, 15, 0.95);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-family: Roboto, Arial, sans-serif;
            font-size: 16px;
        `;
        
        loadingOverlay.innerHTML = `
            <div style="text-align: center;">
                <div style="border: 2px solid #333; border-top: 2px solid #ff0000; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
                <div>Loading video from the past...</div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;
        
        document.body.appendChild(loadingOverlay);
    }
    performSearch(query, inputElement) {
        this.log('Intercepting search for:', query);
        
        // Don't add before: if it already exists
        if (query.includes('before:')) {
            this.log('Search already contains before: filter, proceeding normally');
            this.executeSearch(query, inputElement);
            return;
        }

        // Add the before: filter to the actual search
        const beforeDate = this.maxDate.toISOString().split('T')[0];
        const modifiedQuery = query + ' before:' + beforeDate;
        
        this.log('Modified search query:', modifiedQuery);
        
        // Execute the search with the modified query
        this.executeSearch(modifiedQuery, inputElement);
        
        // Keep the original query visible in the input - multiple attempts
        const restoreOriginalQuery = () => {
            const searchInputs = document.querySelectorAll('input#search, input[name="search_query"]');
            searchInputs.forEach(input => {
                if (input.value.includes('before:')) {
                    input.value = query;
                }
            });
        };
        
        // Restore immediately and with delays
        restoreOriginalQuery();
        setTimeout(restoreOriginalQuery, 50);
        setTimeout(restoreOriginalQuery, 100);
        setTimeout(restoreOriginalQuery, 200);
        setTimeout(restoreOriginalQuery, 500);
        setTimeout(restoreOriginalQuery, 1000);
    }

    executeSearch(searchQuery, inputElement) {
        // Method 1: Try to use YouTube's search API directly
        if (this.tryYouTubeSearch(searchQuery)) {
            return;
        }

        // Method 2: Modify the URL and navigate
        const searchParams = new URLSearchParams();
        searchParams.set('search_query', searchQuery);
        
        const searchUrl = '/results?' + searchParams.toString();
        this.log('Navigating to search URL:', searchUrl);
        
        // Show loading indicator to prevent "offline" message
        this.showSearchLoading();
        
        window.location.href = searchUrl;
    }

    showSearchLoading() {
        // Create a temporary loading overlay to prevent offline message
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'tm-search-loading';
        loadingOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(15, 15, 15, 0.95);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-family: Roboto, Arial, sans-serif;
            font-size: 16px;
        `;
        
        loadingOverlay.innerHTML = `
            <div style="text-align: center;">
                <div style="border: 2px solid #333; border-top: 2px solid #ff0000; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
                <div>Searching through time...</div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;
        
        document.body.appendChild(loadingOverlay);
        
        // Remove loading overlay after navigation starts
        setTimeout(() => {
            const overlay = document.getElementById('tm-search-loading');
            if (overlay) {
                overlay.remove();
            }
        }, 100);
    }
    tryYouTubeSearch(query) {
        try {
            // Try to find YouTube's search function
            if (window.ytInitialData && window.ytInitialData.contents) {
                // Use YouTube's internal search if available
                const searchParams = new URLSearchParams(window.location.search);
                searchParams.set('search_query', query);
                
                const newUrl = window.location.pathname + '?' + searchParams.toString();
                window.history.pushState({}, '', newUrl);
                
                // Show loading for internal search too
                this.showSearchLoading();
                
                // Trigger a page reload to execute the search
                window.location.reload();
                return true;
            }
        } catch (error) {
            this.log('YouTube internal search failed:', error);
        }
        
        return false;
    }

    monitorForNewElements() {
        // Set up a mutation observer to catch dynamically added search elements
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Hide offline messages
                        if (node.textContent && node.textContent.includes("You're offline")) {
                            node.style.display = 'none';
                            node.style.visibility = 'hidden';
                        }
                        
                        // Check for offline messages in child elements
                        const offlineElements = node.querySelectorAll('*');
                        offlineElements.forEach(el => {
                            if (el.textContent && el.textContent.includes("You're offline")) {
                                el.style.display = 'none';
                                el.style.visibility = 'hidden';
                            }
                        });
                        
                        // Check for new search forms
                        const newForms = node.querySelectorAll('form[role="search"], form#search-form, ytd-searchbox form');
                        newForms.forEach((form) => this.interceptSearchForms());
                        
                        // Check for new search inputs
                        const newInputs = node.querySelectorAll('input#search, input[name="search_query"]');
                        newInputs.forEach((input) => this.interceptSearchInputs());
                        
                        // Check for new search buttons
                        const newButtons = node.querySelectorAll('#search-icon-legacy button, button[aria-label="Search"], ytd-searchbox button');
                        newButtons.forEach((btn) => this.interceptSearchButtons());
                        
                        // Check for new video links
                        const newVideoLinks = node.querySelectorAll('a[href*="/watch?v="]');
                        newVideoLinks.forEach((link) => this.interceptVideoClicks());
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Also run the setup periodically to catch any missed elements
        setInterval(() => {
            this.interceptSearchForms();
            this.interceptSearchInputs();
            this.interceptSearchButtons();
            this.interceptVideoClicks();
            
            // Hide any offline messages that appear
            const offlineMessages = document.querySelectorAll('*');
            offlineMessages.forEach(el => {
                if (el.textContent && el.textContent.includes("You're offline")) {
                    el.style.display = 'none';
                    el.style.visibility = 'hidden';
                }
            });
        }, 2000);
    }

    cleanupSearchResults() {
        // Hide search filter chips that show the before: date
        const hideBeforeChips = () => {
            // Hide all elements that contain "before:" text
            const allElements = document.querySelectorAll('*');
            allElements.forEach(element => {
                if (element.dataset.tmProcessedForBefore) return;
                
                const text = element.textContent || element.innerText || '';
                const ariaLabel = element.getAttribute('aria-label') || '';
                const title = element.getAttribute('title') || '';
                
                if (text.includes('before:') || ariaLabel.includes('before:') || title.includes('before:')) {
                    // Check if it's a search filter chip or similar element
                    if (element.matches('ytd-search-filter-renderer, .search-filter-chip, ytd-chip-cloud-chip-renderer, ytd-search-sub-menu-renderer *')) {
                        element.style.display = 'none !important';
                        element.style.visibility = 'hidden !important';
                        element.style.opacity = '0 !important';
                        element.style.height = '0 !important';
                        element.style.width = '0 !important';
                        element.style.position = 'absolute !important';
                        element.style.left = '-9999px !important';
                        element.setAttribute('data-hidden-by-time-machine', 'true');
                    }
                    // Also hide parent containers that might show the filter
                    let parent = element.parentElement;
                    while (parent && parent !== document.body) {
                        if (parent.matches('ytd-search-filter-renderer, ytd-chip-cloud-chip-renderer, ytd-search-sub-menu-renderer')) {
                            parent.style.display = 'none !important';
                            parent.setAttribute('data-hidden-by-time-machine', 'true');
                            break;
                        }
                        parent = parent.parentElement;
                    }
                }
                
                element.dataset.tmProcessedForBefore = 'true';
            });
            
            // Also hide specific YouTube search filter elements
            const specificSelectors = [
                'ytd-search-filter-renderer',
                'ytd-chip-cloud-chip-renderer', 
                'ytd-search-sub-menu-renderer',
                '.search-filter-chip',
                '[data-text*="before:"]',
                '[aria-label*="before:"]',
                '[title*="before:"]'
            ];
            
            specificSelectors.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(element => {
                        const text = element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || '';
                        if (text.includes('before:')) {
                            element.style.display = 'none !important';
                            element.style.visibility = 'hidden !important';
                            element.setAttribute('data-hidden-by-time-machine', 'true');
                        }
                    });
                } catch (e) {
                    // Ignore selector errors
                }
            });
        };

        // Run cleanup immediately and periodically
        hideBeforeChips();
        setInterval(hideBeforeChips, 200); // More frequent cleanup
        
        // Also run cleanup on page mutations
        const observer = new MutationObserver(() => {
            setTimeout(hideBeforeChips, 50);
            // Also restore search input if it shows before:
            setTimeout(() => {
                const searchInputs = document.querySelectorAll('input#search, input[name="search_query"]');
                searchInputs.forEach(input => {
                    if (input.value.includes('before:')) {
                        const originalQuery = input.value.replace(/\s*before:\d{4}-\d{2}-\d{2}/, '').trim();
                        if (originalQuery) {
                            input.value = originalQuery;
                        }
                    }
                });
            }, 10);
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Continuous monitoring of search input
        setInterval(() => {
            const searchInputs = document.querySelectorAll('input#search, input[name="search_query"]');
            searchInputs.forEach(input => {
                if (input.value.includes('before:')) {
                    const originalQuery = input.value.replace(/\s*before:\d{4}-\d{2}-\d{2}/, '').trim();
                    if (originalQuery) {
                        input.value = originalQuery;
                    }
                }
            });
        }, 100);
        // Block shorts in search results
        if (this.shortsBlocker) {
            setInterval(() => {
                this.shortsBlocker.blockShorts();
            }, 500);
        }
    }

    log() {
        if (CONFIG.debugMode) {
            console.log.apply(console, ['[Search Interceptor]'].concat(Array.prototype.slice.call(arguments)));
        }
    }
}
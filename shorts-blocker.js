// Comprehensive Shorts Blocker
class ShortsBlocker {
    constructor() {
        this.processedElements = new WeakSet();
        this.modernContentCache = new Map();
    }

    blockShorts() {
        CONFIG.SHORTS_SELECTORS.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    if (element && element.style.display !== 'none') {
                        element.style.display = 'none';
                        element.style.visibility = 'hidden';
                        element.style.opacity = '0';
                        element.style.height = '0';
                        element.style.width = '0';
                        element.style.position = 'absolute';
                        element.style.left = '-9999px';
                        element.setAttribute('data-blocked-by-time-machine', 'true');
                    }
                });
            } catch (error) {
                // Ignore selector errors
            }
        });

        this.blockShortsByContent();
        this.blockModernContent();
        this.blockChannelPages();
    }
    
    nukeHomepage() {
        // ULTRA-AGGRESSIVELY hide ALL video content on homepage while loading
        const homepageSelectors = [
            // Primary content containers
            'ytd-browse[page-subtype="home"] ytd-video-renderer',
            'ytd-browse[page-subtype="home"] ytd-grid-video-renderer', 
            'ytd-browse[page-subtype="home"] ytd-rich-item-renderer',
            'ytd-browse[page-subtype="home"] ytd-compact-video-renderer',
            'ytd-browse[page-subtype="home"] ytd-movie-renderer',
            'ytd-browse[page-subtype="home"] ytd-playlist-renderer',
            
            // Shelf and section containers
            'ytd-browse[page-subtype="home"] ytd-rich-shelf-renderer',
            'ytd-browse[page-subtype="home"] ytd-shelf-renderer',
            'ytd-browse[page-subtype="home"] ytd-horizontal-card-list-renderer',
            'ytd-browse[page-subtype="home"] ytd-expanded-shelf-contents-renderer',
            
            // Content grids and lists
            'ytd-browse[page-subtype="home"] ytd-rich-grid-renderer #contents > *',
            'ytd-browse[page-subtype="home"] ytd-rich-grid-renderer ytd-rich-item-renderer',
            'ytd-browse[page-subtype="home"] ytd-rich-grid-renderer ytd-rich-section-renderer',
            'ytd-browse[page-subtype="home"] #contents > *',
            'ytd-browse[page-subtype="home"] #primary #contents > *',
            
            // Section renderers
            'ytd-browse[page-subtype="home"] ytd-item-section-renderer',
            'ytd-browse[page-subtype="home"] ytd-section-list-renderer',
            'ytd-browse[page-subtype="home"] ytd-continuation-item-renderer',
            
            // Specific modern content types
            'ytd-browse[page-subtype="home"] ytd-reel-shelf-renderer',
            'ytd-browse[page-subtype="home"] [is-shorts]',
            'ytd-browse[page-subtype="home"] [overlay-style="SHORTS"]',
            'ytd-browse[page-subtype="home"] [href*="/shorts/"]',
            
            // Trending and recommendation sections
            'ytd-browse[page-subtype="home"] ytd-rich-shelf-renderer[is-trending]',
            'ytd-browse[page-subtype="home"] ytd-rich-shelf-renderer[is-recommended]',
            'ytd-browse[page-subtype="home"] [aria-label*="Trending"]',
            'ytd-browse[page-subtype="home"] [aria-label*="Recommended"]',
            
            // Any video thumbnails
            'ytd-browse[page-subtype="home"] ytd-thumbnail',
            'ytd-browse[page-subtype="home"] .ytd-thumbnail',
            
            // Catch-all for any remaining video elements
            'ytd-browse[page-subtype="home"] [href*="/watch?v="]',
            'ytd-browse[page-subtype="home"] a[href*="/watch"]'
        ];
        
        homepageSelectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    if (!element.classList.contains('tm-homepage') && !element.classList.contains('tm-approved')) {
                        element.style.display = 'none !important';
                        element.style.visibility = 'hidden !important';
                        element.style.opacity = '0 !important';
                        element.style.height = '0 !important';
                        element.style.width = '0 !important';
                        element.style.maxHeight = '0 !important';
                        element.style.maxWidth = '0 !important';
                        element.style.overflow = 'hidden !important';
                        element.style.position = 'absolute !important';
                        element.style.left = '-9999px !important';
                        element.style.top = '-9999px !important';
                        element.style.zIndex = '-9999 !important';
                        element.style.pointerEvents = 'none !important';
                        element.setAttribute('data-nuked-by-time-machine', 'true');
                    }
                });
            } catch (error) {
                // Ignore selector errors
            }
        });
        
        // Also hide any video elements that might slip through
        const videoElements = document.querySelectorAll('ytd-browse[page-subtype="home"] *[href*="/watch"]');
        videoElements.forEach(element => {
            if (!element.classList.contains('tm-homepage') && !element.classList.contains('tm-approved')) {
                element.style.display = 'none !important';
                element.style.visibility = 'hidden !important';
                element.style.opacity = '0 !important';
                element.setAttribute('data-nuked-by-time-machine', 'video-link');
            }
        });
    }

    blockModernContent() {
        const videoElements = document.querySelectorAll('ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer');

        videoElements.forEach(element => {
            if (this.processedElements.has(element)) return;

            if (this.isModernContent(element)) {
                element.classList.add('yt-time-machine-hidden');
                element.setAttribute('data-blocked-by-time-machine', 'modern-content');
                this.processedElements.add(element);
            }
        });
    }

    blockChannelPages() {
        // Hide only videos on channel pages, not the entire page
        if (this.isChannelPage()) {
            CONFIG.CHANNEL_PAGE_SELECTORS.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(element => {
                        if (element && element.style.display !== 'none') {
                            element.style.display = 'none';
                            element.style.visibility = 'hidden';
                            element.style.opacity = '0';
                            element.style.height = '0';
                            element.style.width = '0';
                            element.style.position = 'absolute';
                            element.style.left = '-9999px';
                            element.setAttribute('data-blocked-by-time-machine', 'channel-page-video');
                        }
                    });
                } catch (error) {
                    // Ignore selector errors
                }
            });
        }
    }

    isChannelPage() {
        return location.pathname.includes('/channel/') || 
               location.pathname.includes('/c/') || 
               location.pathname.includes('/user/') ||
               location.pathname.match(/\/@[\w-]+/);
    }


    isModernContent(videoElement) {
        // Cache results to avoid repeated processing
        if (this.modernContentCache.has(videoElement)) {
            return this.modernContentCache.get(videoElement);
        }

        const titleElement = videoElement.querySelector('a#video-title, h3 a, .ytd-video-meta-block a');
        const descElement = videoElement.querySelector('#description-text, .ytd-video-meta-block');
        
        let isModern = false;
        
        if (titleElement) {
            const title = titleElement.textContent.toLowerCase();
            
            // Check for modern content indicators
            isModern = CONFIG.MODERN_CONTENT_INDICATORS.some(indicator => 
                title.includes(indicator.toLowerCase())
            );
            
            // Additional modern patterns
            if (!isModern) {
                const modernPatterns = [
                    /\b(2019|2020|2021|2022|2023|2024|2025)\b/,
                    /\b(4k|1080p|60fps|hd|uhd)\b/i,
                    /\b(vlog|blog|daily|routine)\b/i,
                    /\b(unboxing|haul|review|reaction)\b/i,
                    /\b(challenge|prank|experiment)\b/i,
                    /\b(tik\s?tok|insta|snap|tweet)\b/i,
                    /\b(subscribe|notification|bell)\b/i,
                    /\b(like\s+and\s+subscribe|smash\s+that\s+like)\b/i,
                    /\b(what\s+do\s+you\s+think|let\s+me\s+know)\b/i,
                    /\b(comment\s+below|in\s+the\s+comments)\b/i
                ];
                
                isModern = modernPatterns.some(pattern => pattern.test(title));
            }
        }
        
        // Check description for modern indicators
        if (!isModern && descElement) {
            const desc = descElement.textContent.toLowerCase();
            isModern = CONFIG.MODERN_CONTENT_INDICATORS.slice(0, 10).some(indicator => 
                desc.includes(indicator.toLowerCase())
            );
        }
        
        // Check for modern UI elements
        if (!isModern) {
            const modernUIElements = [
                '[aria-label*="Subscribe"]',
                '[aria-label*="Notification"]',
                '.ytd-subscribe-button-renderer',
                '.ytd-notification-topbar-button-renderer',
                '[data-target-id*="subscribe"]'
            ];
            
            isModern = modernUIElements.some(selector => 
                videoElement.querySelector(selector)
            );
        }
        
        this.modernContentCache.set(videoElement, isModern);
        return isModern;
    }

    blockShortsByContent() {
        const videoElements = document.querySelectorAll('ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer');

        videoElements.forEach(element => {
            if (this.processedElements.has(element)) return;

            const titleElement = element.querySelector('a#video-title, h3 a, .ytd-video-meta-block a');
            const durationElement = element.querySelector('.ytd-thumbnail-overlay-time-status-renderer span, .badge-style-type-simple');

            if (titleElement && durationElement) {
                const title = titleElement.textContent || '';
                const duration = durationElement.textContent || '';

                const isShort = duration.match(/^[0-5]?\d$/) || 
                              title.toLowerCase().includes('#shorts') ||
                              title.toLowerCase().includes('#short');

                if (isShort) {
                    element.classList.add('yt-time-machine-hidden');
                    element.setAttribute('data-blocked-by-time-machine', 'shorts');
                }
            }

            if (this.isShorts(element)) {
                element.classList.add('yt-time-machine-hidden');
                element.setAttribute('data-blocked-by-time-machine', 'shorts');
            }

            this.processedElements.add(element);
        });
    }

    isShorts(videoElement) {
        const shortsIndicators = [
            '[overlay-style="SHORTS"]',
            '[href*="/shorts/"]',
            '.shorts-thumbnail-overlay',
            '.shortsLockupViewModelHost',
            '[aria-label*="Shorts"]',
            '[title*="Shorts"]'
        ];

        return shortsIndicators.some(selector =>
            videoElement.querySelector(selector) ||
            videoElement.matches(selector)
        );
    }

    getShortsBlockingCSS() {
        return `
            /* Aggressive hiding of all video elements by default */
            ytd-video-renderer,
            ytd-grid-video-renderer,
            ytd-rich-item-renderer,
            ytd-compact-video-renderer,
            ytd-movie-renderer,
            ytd-playlist-renderer {
                visibility: hidden !important;
                opacity: 0 !important;
                height: 0 !important;
                overflow: hidden !important;
                transition: none !important;
            }

            /* Show approved videos */
            ytd-video-renderer.tm-approved,
            ytd-grid-video-renderer.tm-approved,
            ytd-rich-item-renderer.tm-approved,
            ytd-compact-video-renderer.tm-approved,
            ytd-movie-renderer.tm-approved,
            ytd-playlist-renderer.tm-approved {
                visibility: visible !important;
                opacity: 1 !important;
                height: auto !important;
                overflow: visible !important;
            }

            /* Ultra-aggressive hiding of modern content */
            ytd-rich-shelf-renderer[is-shorts],
            ytd-reel-shelf-renderer,
            ytd-shorts,
            [overlay-style="SHORTS"],
            ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"],
            ytd-video-renderer:has([overlay-style="SHORTS"]),
            ytd-grid-video-renderer:has([overlay-style="SHORTS"]),
            ytd-rich-item-renderer:has([overlay-style="SHORTS"]),
            ytd-compact-video-renderer:has([overlay-style="SHORTS"]),
            #shorts-container,
            ytd-guide-entry-renderer a[title="Shorts"],
            ytd-mini-guide-entry-renderer[aria-label="Shorts"],
            a[href="/shorts"],
            [href*="/shorts/"],
            ytd-thumbnail[href*="/shorts/"],
            .shortsLockupViewModelHost,
            .ytGridShelfViewModelHost,
            [aria-label*="Shorts"],
            [title*="Shorts"],
            .shorts-shelf,
            .shorts-lockup {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                height: 0 !important;
                width: 0 !important;
                position: absolute !important;
                left: -9999px !important;
            }

            .yt-time-machine-hidden {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                height: 0 !important;
                width: 0 !important;
                position: absolute !important;
                left: -9999px !important;
            }
        `;
    }

    restoreBlockedContent() {
        const blockedElements = document.querySelectorAll('[data-blocked-by-time-machine]');
        blockedElements.forEach(element => {
            element.style.display = '';
            element.style.visibility = '';
            element.style.opacity = '';
            element.style.height = '';
            element.style.width = '';
            element.style.position = '';
            element.style.left = '';
            element.classList.remove('yt-time-machine-hidden');
            element.removeAttribute('data-blocked-by-time-machine');
        });
    }
}
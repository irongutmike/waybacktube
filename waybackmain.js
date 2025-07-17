// ==UserScript==
// @name         WayBackTube
// @namespace    http://tampermonkey.net/
// @license MIT
// @version      15.0
// @description  Travel back in time on YouTube; simulate what it was like in any date.
// @author       You
// @match        https://www.youtube.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      youtube.com
// @connect      googleapis.com
// @run-at       document-start
// @downloadURL https://update.greasyfork.org/scripts/542809/WayBackTube.user.js
// @updateURL https://update.greasyfork.org/scripts/542809/WayBackTube.meta.js
// ==/UserScript==

(function() {
    'use strict';

    // === CONFIGURATION ===
    const CONFIG = {
        updateInterval: 300,
        debugMode: true,
        videosPerChannel: 20,
        maxHomepageVideos: 60,
        maxVideoPageVideos: 20,
        cacheExpiry: {
            videos: 2 * 60 * 60 * 1000, // 2 hours
            channelVideos: 1 * 60 * 60 * 1000, // 1 hour
            searchResults: 30 * 60 * 1000 // 30 minutes
        },
        maxConcurrentRequests: 2,
        batchSize: 3,
        apiCooldown: 200,
        autoLoadOnHomepage: true,
        autoLoadDelay: 1500,
        autoAdvanceDays: true // New feature
    };

    // === API MANAGER WITH UNLIMITED ROTATION ===
    class APIManager {
        constructor() {
            this.keys = GM_getValue('ytApiKeys', []);
            this.currentKeyIndex = GM_getValue('ytCurrentKeyIndex', 0);
            this.keyStats = GM_getValue('ytKeyStats', {});
            this.baseUrl = 'https://www.googleapis.com/youtube/v3';
            this.initializeKeys();
        }

        initializeKeys() {
            // Reset daily statistics
            const now = Date.now();
            const oneDayAgo = now - (24 * 60 * 60 * 1000);

            Object.keys(this.keyStats).forEach(key => {
                if (this.keyStats[key].lastFailed && this.keyStats[key].lastFailed < oneDayAgo) {
                    this.keyStats[key].failed = false;
                    this.keyStats[key].quotaExceeded = false;
                }
            });

            // Validate current key index
            if (this.currentKeyIndex >= this.keys.length) {
                this.currentKeyIndex = 0;
            }

            this.log(`🔑 API Manager initialized with ${this.keys.length} keys`);
        }

        get currentKey() {
            if (this.keys.length === 0) return null;
            return this.keys[this.currentKeyIndex];
        }

        addKey(apiKey) {
            if (!apiKey || apiKey.length < 35) return false;

            if (!this.keys.includes(apiKey)) {
                this.keys.push(apiKey);
                this.keyStats[apiKey] = {
                    failed: false,
                    quotaExceeded: false,
                    lastUsed: 0,
                    requestCount: 0,
                    successCount: 0
                };
                this.saveKeys();
                this.log(`✅ Added API key: ${apiKey.substring(0, 8)}...`);
                return true;
            }
            return false;
        }

        removeKey(apiKey) {
            const index = this.keys.indexOf(apiKey);
            if (index > -1) {
                this.keys.splice(index, 1);
                delete this.keyStats[apiKey];

                // Adjust current index
                if (this.currentKeyIndex >= this.keys.length) {
                    this.currentKeyIndex = Math.max(0, this.keys.length - 1);
                } else if (index <= this.currentKeyIndex && this.currentKeyIndex > 0) {
                    this.currentKeyIndex--;
                }

                this.saveKeys();
                this.log(`🗑️ Removed API key: ${apiKey.substring(0, 8)}...`);
                return true;
            }
            return false;
        }

        // UNLIMITED KEY ROTATION
        rotateToNextKey() {
            if (this.keys.length <= 1) return false;

            const startIndex = this.currentKeyIndex;
            let attempts = 0;

            // Try ALL keys, not just a limited number
            while (attempts < this.keys.length) {
                this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
                attempts++;

                const currentKey = this.currentKey;
                const stats = this.keyStats[currentKey];

                if (!stats || (!stats.quotaExceeded && !stats.failed)) {
                    this.saveKeys();
                    this.log(`🔄 Rotated to key ${this.currentKeyIndex + 1}/${this.keys.length}`);
                    return true;
                }
            }

            // If all keys are problematic, reset to first key and try anyway
            this.currentKeyIndex = 0;
            this.saveKeys();
            this.log('⚠️ All keys have issues, reset to first key');
            return false;
        }

        markKeySuccess(apiKey) {
            if (!this.keyStats[apiKey]) {
                this.keyStats[apiKey] = {};
            }

            this.keyStats[apiKey].lastUsed = Date.now();
            this.keyStats[apiKey].requestCount = (this.keyStats[apiKey].requestCount || 0) + 1;
            this.keyStats[apiKey].successCount = (this.keyStats[apiKey].successCount || 0) + 1;
            this.keyStats[apiKey].failed = false;

            this.saveKeys();
        }

        markKeyFailed(apiKey, errorMessage) {
            if (!this.keyStats[apiKey]) {
                this.keyStats[apiKey] = {};
            }

            this.keyStats[apiKey].failed = true;
            this.keyStats[apiKey].lastFailed = Date.now();

            // Check for quota errors
            const quotaErrors = ['quota', 'exceeded', 'dailyLimitExceeded', 'rateLimitExceeded'];
            if (quotaErrors.some(error => errorMessage.toLowerCase().includes(error))) {
                this.keyStats[apiKey].quotaExceeded = true;
            }

            this.saveKeys();
            this.log(`❌ Key failed: ${apiKey.substring(0, 8)}... - ${errorMessage}`);
        }

        // IMPROVED REQUEST SYSTEM
        async makeRequest(endpoint, params) {
            return new Promise((resolve, reject) => {
                if (this.keys.length === 0) {
                    reject(new Error('No API keys available'));
                    return;
                }

                const attemptRequest = (attemptCount = 0) => {
                    const maxAttempts = Math.min(this.keys.length, 10); // Reasonable limit for retries

                    if (attemptCount >= maxAttempts) {
                        reject(new Error('All API keys exhausted'));
                        return;
                    }

                    const currentKey = this.currentKey;
                    if (!currentKey) {
                        reject(new Error('No valid API key'));
                        return;
                    }

                    // Build request URL
                    const urlParams = new URLSearchParams({ ...params, key: currentKey });
                    const url = `${endpoint}?${urlParams.toString()}`;

                    this.log(`🌐 Request attempt ${attemptCount + 1} with key ${this.currentKeyIndex + 1}`);

                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: url,
                        timeout: 10000,
                        headers: {
                            'Accept': 'application/json'
                        },
                        onload: (response) => {
                            if (response.status === 200) {
                                try {
                                    const data = JSON.parse(response.responseText);
                                    this.markKeySuccess(currentKey);
                                    resolve(data);
                                } catch (e) {
                                    reject(new Error('Invalid JSON response'));
                                }
                            } else {
                                let errorMessage = `HTTP ${response.status}`;
                                try {
                                    const errorData = JSON.parse(response.responseText);
                                    if (errorData.error && errorData.error.message) {
                                        errorMessage = errorData.error.message;
                                    }
                                } catch (e) {
                                    // Use default error message
                                }

                                this.markKeyFailed(currentKey, errorMessage);

                                if (this.rotateToNextKey()) {
                                    setTimeout(() => attemptRequest(attemptCount + 1), 500);
                                } else {
                                    reject(new Error(`API Error: ${errorMessage}`));
                                }
                            }
                        },
                        onerror: () => {
                            this.markKeyFailed(currentKey, 'Network error');
                            if (this.rotateToNextKey()) {
                                setTimeout(() => attemptRequest(attemptCount + 1), 1000);
                            } else {
                                reject(new Error('Network error'));
                            }
                        },
                        ontimeout: () => {
                            this.markKeyFailed(currentKey, 'Request timeout');
                            if (this.rotateToNextKey()) {
                                setTimeout(() => attemptRequest(attemptCount + 1), 500);
                            } else {
                                reject(new Error('Request timeout'));
                            }
                        }
                    });
                };

                attemptRequest(0);
            });
        }

        // TEST ALL KEYS (not just 3)
        async testAllKeys() {
            const results = [];

            if (this.keys.length === 0) {
                return ['❌ No API keys configured'];
            }

            this.log(`🧪 Testing all ${this.keys.length} keys...`);

            // Test each key individually
            for (let i = 0; i < this.keys.length; i++) {
                const testKey = this.keys[i];

                try {
                    const testParams = {
                        part: 'snippet',
                        q: 'test',
                        maxResults: 1,
                        type: 'video',
                        key: testKey
                    };

                    const url = `${this.baseUrl}/search?${new URLSearchParams(testParams)}`;

                    const response = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: url,
                            timeout: 8000,
                            onload: resolve,
                            onerror: reject,
                            ontimeout: reject
                        });
                    });

                    if (response.status === 200) {
                        const data = JSON.parse(response.responseText);
                        if (data.items && data.items.length > 0) {
                            results.push(`✅ Key ${i + 1}: Working perfectly`);
                        } else {
                            results.push(`⚠️ Key ${i + 1}: Valid but no results`);
                        }
                    } else {
                        let errorMsg = `HTTP ${response.status}`;
                        try {
                            const errorData = JSON.parse(response.responseText);
                            if (errorData.error) {
                                errorMsg = errorData.error.message || errorMsg;
                            }
                        } catch (e) {
                            // Use default error
                        }
                        results.push(`❌ Key ${i + 1}: ${errorMsg}`);
                    }
                } catch (error) {
                    results.push(`❌ Key ${i + 1}: ${error.message || 'Network error'}`);
                }

                // Small delay between tests
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            return results;
        }

        saveKeys() {
            GM_setValue('ytApiKeys', this.keys);
            GM_setValue('ytCurrentKeyIndex', this.currentKeyIndex);
            GM_setValue('ytKeyStats', this.keyStats);
        }

        getCache(key) {
            const cached = GM_getValue(`cache_${key}`, null);
            if (cached) {
                try {
                    const data = JSON.parse(cached);
                    if (Date.now() - data.timestamp < CONFIG.cacheExpiry.videos) {
                        return data.value;
                    }
                } catch (e) {
                    // Invalid cache entry
                }
            }
            return null;
        }

        setCache(key, value) {
            const cacheData = {
                timestamp: Date.now(),
                value: value
            };
            GM_setValue(`cache_${key}`, JSON.stringify(cacheData));
        }

        clearCache() {
            const keys = GM_listValues();
            keys.forEach(key => {
                if (key.startsWith('cache_')) {
                    GM_deleteValue(key);
                }
            });
        }

        log(...args) {
            if (CONFIG.debugMode) {
                console.log('[API Manager]', ...args);
            }
        }
    }

    // === SUBSCRIPTION MANAGER ===
    class SubscriptionManager {
        constructor() {
            this.subscriptions = GM_getValue('ytSubscriptions', []);
        }

        addSubscription(channelName, channelId = null) {
            if (!channelName || channelName.trim() === '') return false;

            const subscription = {
                name: channelName.trim(),
                id: channelId,
                addedAt: Date.now()
            };

            // Check for duplicates
            const exists = this.subscriptions.some(sub =>
                sub.name.toLowerCase() === subscription.name.toLowerCase() ||
                (channelId && sub.id === channelId)
            );

            if (!exists) {
                this.subscriptions.push(subscription);
                this.save();
                return true;
            }
            return false;
        }

        removeSubscription(index) {
            if (index >= 0 && index < this.subscriptions.length) {
                this.subscriptions.splice(index, 1);
                this.save();
                return true;
            }
            return false;
        }

        getSubscriptions() {
            return this.subscriptions;
        }

        save() {
            GM_setValue('ytSubscriptions', this.subscriptions);
        }
    }

    // === MAIN TIME MACHINE CLASS ===
    class YouTubeTimeMachine {
        constructor() {
            this.apiManager = new APIManager();
            this.subscriptionManager = new SubscriptionManager();

            this.settings = {
                date: GM_getValue('ytTimeMachineDate', '2014-06-14'),
                active: GM_getValue('ytTimeMachineActive', true),
                uiVisible: GM_getValue('ytTimeMachineUIVisible', true),
                lastAdvancedDate: GM_getValue('ytLastAdvancedDate', new Date().toDateString())
            };

            // Auto-advance date feature
            this.checkAndAdvanceDate();

            this.maxDate = new Date(this.settings.date);
            this.isProcessing = false;
            this.videoCache = new Map();

            this.stats = {
                filtered: 0,
                processed: 0,
                apiCalls: 0,
                cacheHits: 0
            };

            this.init();
        }

        // NEW: Auto-advance date feature
        checkAndAdvanceDate() {
            if (!CONFIG.autoAdvanceDays) return;

            const today = new Date().toDateString();
            const lastAdvanced = this.settings.lastAdvancedDate;

            if (today !== lastAdvanced) {
                // Advance the date by one day
                const currentDate = new Date(this.settings.date);
                currentDate.setDate(currentDate.getDate() + 1);

                // Don't advance beyond today
                if (currentDate <= new Date()) {
                    this.settings.date = currentDate.toISOString().split('T')[0];
                    this.settings.lastAdvancedDate = today;

                    GM_setValue('ytTimeMachineDate', this.settings.date);
                    GM_setValue('ytLastAdvancedDate', today);

                    // Clear cache to force reload of new videos
                    this.apiManager.clearCache();

                    this.log('📅 Date auto-advanced to:', this.settings.date);
                }
            }
        }

        // NEW: Generate realistic view count based on video age
        generateViewCount(publishedAt, referenceDate) {
            const videoDate = new Date(publishedAt);
            const refDate = new Date(referenceDate);
            const daysSinceUpload = Math.floor((refDate - videoDate) / (1000 * 60 * 60 * 24));

            // Base view count ranges based on days since upload
            let minViews, maxViews;

            if (daysSinceUpload <= 1) {
                minViews = 100;
                maxViews = 50000;
            } else if (daysSinceUpload <= 7) {
                minViews = 1000;
                maxViews = 500000;
            } else if (daysSinceUpload <= 30) {
                minViews = 5000;
                maxViews = 2000000;
            } else if (daysSinceUpload <= 365) {
                minViews = 10000;
                maxViews = 10000000;
            } else {
                minViews = 50000;
                maxViews = 50000000;
            }

            // Random multiplier for variety
            const multiplier = Math.random() * 0.8 + 0.2; // 0.2 to 1.0
            const viewCount = Math.floor(minViews + (maxViews - minViews) * multiplier);

            return this.formatViewCount(viewCount);
        }

        // NEW: Format view count (1.2M, 543K, etc.)
        formatViewCount(count) {
            if (count >= 1000000) {
                return (count / 1000000).toFixed(1) + 'M';
            } else if (count >= 1000) {
                return (count / 1000).toFixed(1) + 'K';
            }
            return count.toString();
        }

        // NEW: Format relative date (like YouTube does)
        formatRelativeDate(publishedAt, referenceDate) {
            const videoDate = new Date(publishedAt);
            const refDate = new Date(referenceDate);
            const diffMs = refDate - videoDate;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffDays === 0) {
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                if (diffHours === 0) {
                    const diffMinutes = Math.floor(diffMs / (1000 * 60));
                    return diffMinutes <= 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
                }
                return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
            } else if (diffDays === 1) {
                return '1 day ago';
            } else if (diffDays < 7) {
                return `${diffDays} days ago`;
            } else if (diffDays < 30) {
                const weeks = Math.floor(diffDays / 7);
                return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
            } else if (diffDays < 365) {
                const months = Math.floor(diffDays / 30);
                return months === 1 ? '1 month ago' : `${months} months ago`;
            } else {
                const years = Math.floor(diffDays / 365);
                return years === 1 ? '1 year ago' : `${years} years ago`;
            }
        }

        init() {
            this.log('🕰️ YouTube Time Machine initializing...');

            // Add styles
            this.addStyles();

            // Setup UI
            this.setupUI();

            // Start filtering if active
            if (this.settings.active) {
                this.startFiltering();
                this.setupSearchInterception();
                this.startHomepageReplacement();
                this.startVideoPageEnhancement(); // NEW
            }

            this.log('✅ YouTube Time Machine ready!');
        }

        addStyles() {
            GM_addStyle(`
                /* Hide Shorts completely */
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
                ytd-thumbnail[href*="/shorts/"] {
                    display: none !important;
                }

                .yt-time-machine-hidden {
                    display: none !important;
                }

                /* UI Styles */
                #timeMachineUI {
                    position: fixed;
                    top: 80px;
                    right: 20px;
                    width: 400px;
                    max-height: 80vh;
                    overflow-y: auto;
                    background: linear-gradient(135deg, #0f0f0f, #1a1a1a);
                    border: 1px solid #333;
                    border-radius: 12px;
                    padding: 20px;
                    color: white;
                    font-family: Roboto, Arial, sans-serif;
                    z-index: 999999;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.8);
                    backdrop-filter: blur(10px);
                }

                #timeMachineUI.hidden {
                    display: none;
                }

                #timeMachineToggle {
                    position: fixed;
                    top: 80px;
                    right: 20px;
                    width: 50px;
                    height: 50px;
                    background: #ff0000;
                    border: none;
                    border-radius: 50%;
                    color: white;
                    font-size: 24px;
                    cursor: pointer;
                    z-index: 999998;
                    box-shadow: 0 4px 16px rgba(255,0,0,0.4);
                    display: none;
                }

                #timeMachineToggle.visible {
                    display: block;
                }

                .tm-section {
                    margin-bottom: 20px;
                    padding: 15px;
                    background: rgba(255,255,255,0.05);
                    border-radius: 8px;
                    border-left: 3px solid #ff0000;
                }

                .tm-section h3 {
                    margin: 0 0 10px 0;
                    font-size: 14px;
                    color: #ff6b6b;
                }

                .tm-input-group {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 10px;
                }

                .tm-input {
                    flex: 1;
                    padding: 8px;
                    background: rgba(255,255,255,0.1);
                    border: 1px solid #333;
                    border-radius: 4px;
                    color: white;
                    font-size: 12px;
                }

                .tm-button {
                    padding: 8px 12px;
                    background: #ff0000;
                    border: none;
                    border-radius: 4px;
                    color: white;
                    cursor: pointer;
                    font-size: 12px;
                    transition: background 0.2s;
                }

                .tm-button:hover {
                    background: #cc0000;
                }

                .tm-button:disabled {
                    background: #666;
                    cursor: not-allowed;
                }

                .tm-list {
                    max-height: 150px;
                    overflow-y: auto;
                    font-size: 12px;
                }

                .tm-list-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 6px 0;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                }

                .tm-remove-btn {
                    background: #444;
                    border: none;
                    color: white;
                    padding: 2px 6px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 10px;
                }

                .tm-stats {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    font-size: 12px;
                }

                .tm-stat {
                    background: rgba(255,255,255,0.05);
                    padding: 8px;
                    border-radius: 4px;
                    text-align: center;
                }

                .tm-stat-value {
                    font-size: 16px;
                    font-weight: bold;
                    color: #ff6b6b;
                }

                /* Homepage replacement - 3 columns */
                .tm-homepage {
                    padding: 20px;
                    max-width: 1200px;
                    margin: 0 auto;
                }

                .tm-video-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 20px;
                    margin-top: 20px;
                }

                .tm-video-card {
                    background: var(--yt-spec-raised-background);
                    border-radius: 8px;
                    overflow: hidden;
                    cursor: pointer;
                    transition: transform 0.2s;
                }

                .tm-video-card:hover {
                    transform: translateY(-4px);
                }

                .tm-video-thumbnail {
                    width: 100%;
                    aspect-ratio: 16/9;
                    object-fit: cover;
                    position: relative;
                }

                .tm-video-info {
                    padding: 12px;
                }

                .tm-video-title {
                    font-size: 14px;
                    font-weight: 500;
                    line-height: 1.3;
                    margin-bottom: 8px;
                    color: var(--yt-spec-text-primary);
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }

                .tm-video-channel {
                    font-size: 12px;
                    color: var(--yt-spec-text-secondary);
                    margin-bottom: 4px;
                }

                .tm-video-meta {
                    display: flex;
                    justify-content: space-between;
                    font-size: 11px;
                    color: var(--yt-spec-text-secondary);
                }

                .tm-video-views {
                    font-weight: 500;
                }

                .tm-video-date {
                    font-size: 11px;
                    color: var(--yt-spec-text-secondary);
                }

                /* Video page enhancement */
                .tm-video-page-section {
                    margin-top: 20px;
                    padding: 16px;
                    background: var(--yt-spec-raised-background);
                    border-radius: 8px;
                }

                .tm-video-page-title {
                    font-size: 16px;
                    font-weight: 500;
                    margin-bottom: 16px;
                    color: var(--yt-spec-text-primary);
                }

                .tm-video-page-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 16px;
                }

                .tm-video-page-card {
                    display: flex;
                    gap: 12px;
                    cursor: pointer;
                    transition: background 0.2s;
                    padding: 8px;
                    border-radius: 8px;
                }

                .tm-video-page-card:hover {
                    background: rgba(255,255,255,0.05);
                }

                .tm-video-page-thumbnail {
                    width: 168px;
                    height: 94px;
                    object-fit: cover;
                    border-radius: 4px;
                    flex-shrink: 0;
                }

                .tm-video-page-info {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                }

                .tm-video-page-video-title {
                    font-size: 14px;
                    font-weight: 500;
                    line-height: 1.3;
                    color: var(--yt-spec-text-primary);
                    margin-bottom: 4px;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }

                .tm-video-page-channel {
                    font-size: 12px;
                    color: var(--yt-spec-text-secondary);
                    margin-bottom: 4px;
                }

                .tm-video-page-meta {
                    display: flex;
                    gap: 8px;
                    font-size: 11px;
                    color: var(--yt-spec-text-secondary);
                }

                .tm-loading {
                    text-align: center;
                    padding: 40px;
                    color: var(--yt-spec-text-secondary);
                }

                .tm-spinner {
                    border: 2px solid #333;
                    border-top: 2px solid #ff0000;
                    border-radius: 50%;
                    width: 30px;
                    height: 30px;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 16px;
                }

                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                /* Responsive design */
                @media (max-width: 1200px) {
                    .tm-video-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }

                @media (max-width: 768px) {
                    .tm-video-grid {
                        grid-template-columns: 1fr;
                    }

                    .tm-video-page-grid {
                        grid-template-columns: 1fr;
                    }
                }
            `);
        }

        setupUI() {
            // Create main UI
            const ui = document.createElement('div');
            ui.id = 'timeMachineUI';
            if (!this.settings.uiVisible) {
                ui.classList.add('hidden');
            }

            ui.innerHTML = this.getUIHTML();

            // Create toggle button
            const toggle = document.createElement('button');
            toggle.id = 'timeMachineToggle';
            toggle.innerHTML = '🕰️';
            toggle.title = 'Show Time Machine';
            if (this.settings.uiVisible) {
                toggle.classList.remove('visible');
            } else {
                toggle.classList.add('visible');
            }

            // Add to page
            const addToPage = () => {
                if (document.body) {
                    document.body.appendChild(ui);
                    document.body.appendChild(toggle);
                    this.attachEventListeners();
                } else {
                    setTimeout(addToPage, 100);
                }
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', addToPage);
            } else {
                addToPage();
            }
        }

        getUIHTML() {
            const subscriptions = this.subscriptionManager.getSubscriptions();

            return `
                <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 15px;">
                    <h2 style="margin: 0; font-size: 16px; color: #ff6b6b;">🕰️ Time Machine</h2>
                    <button id="tmHideBtn" style="background: none; border: none; color: white; cursor: pointer; font-size: 18px;">×</button>
                </div>

                <div class="tm-section">
                    <h3>📅 Target Date</h3>
                    <div class="tm-input-group">
                        <input type="date" id="tmDateInput" class="tm-input" value="${this.settings.date}" max="${new Date().toISOString().split('T')[0]}">
                        <button id="tmSetDate" class="tm-button">Set Date</button>
                    </div>
                    <div style="font-size: 11px; color: #aaa; margin-top: 5px;">
                        Currently traveling to: ${this.maxDate.toLocaleDateString()}
                        ${CONFIG.autoAdvanceDays ? '(Auto-advancing daily)' : ''}
                    </div>
                </div>

                <div class="tm-section">
                    <h3>🔑 API Keys (${this.apiManager.keys.length})</h3>
                    <div class="tm-input-group">
                        <input type="password" id="tmApiInput" class="tm-input" placeholder="Enter YouTube API key">
                        <button id="tmAddApi" class="tm-button">Add</button>
                    </div>
                    <div class="tm-list" id="tmApiList">${this.getApiKeyListHTML()}</div>
                    <div style="margin-top: 8px;">
                        <button id="tmTestAll" class="tm-button" style="width: 100%;">Test All Keys</button>
                    </div>
                </div>

                <div class="tm-section">
                    <h3>📺 Subscriptions (${subscriptions.length})</h3>
                    <div class="tm-input-group">
                        <input type="text" id="tmSubInput" class="tm-input" placeholder="Enter channel name">
                        <button id="tmAddSub" class="tm-button">Add</button>
                    </div>
                    <div class="tm-list" id="tmSubList">${this.getSubscriptionListHTML()}</div>
                    <div style="margin-top: 8px;">
                        <button id="tmLoadVideos" class="tm-button" style="width: 100%;">Load Videos</button>
                    </div>
                </div>

                <div class="tm-section">
                    <h3>📊 Statistics</h3>
                    <div class="tm-stats">
                        <div class="tm-stat">
                            <div class="tm-stat-value">${this.stats.processed}</div>
                            <div>Processed</div>
                        </div>
                        <div class="tm-stat">
                            <div class="tm-stat-value">${this.stats.filtered}</div>
                            <div>Filtered</div>
                        </div>
                        <div class="tm-stat">
                            <div class="tm-stat-value">${this.stats.apiCalls}</div>
                            <div>API Calls</div>
                        </div>
                        <div class="tm-stat">
                            <div class="tm-stat-value">${this.stats.cacheHits}</div>
                            <div>Cache Hits</div>
                        </div>
                    </div>
                </div>

                <div class="tm-section">
                    <h3>⚙️ Controls</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <button id="tmToggle" class="tm-button">${this.settings.active ? 'Disable' : 'Enable'}</button>
                        <button id="tmClearCache" class="tm-button">Clear Cache</button>
                    </div>
                </div>

                <div style="font-size: 10px; color: #666; text-align: center; margin-top: 15px;">
                    Press Ctrl+Shift+T to toggle UI
                </div>
            `;
        }

        getApiKeyListHTML() {
            if (this.apiManager.keys.length === 0) {
                return '<div style="text-align: center; color: #666; font-style: italic;">No API keys added</div>';
            }

            return this.apiManager.keys.map((key, index) => {
                const stats = this.apiManager.keyStats[key] || {};
                const isCurrent = index === this.apiManager.currentKeyIndex;
                let status = 'Unused';
                let statusColor = '#666';

                if (isCurrent) {
                    status = 'Active';
                    statusColor = '#4caf50';
                } else if (stats.quotaExceeded) {
                    status = 'Quota Exceeded';
                    statusColor = '#ff9800';
                } else if (stats.failed) {
                    status = 'Failed';
                    statusColor = '#f44336';
                } else if (stats.successCount > 0) {
                    status = 'Standby';
                    statusColor = '#2196f3';
                }

                return `
                    <div class="tm-list-item">
                        <div>
                            <div style="font-weight: bold;">Key ${index + 1}: ${key.substring(0, 8)}...</div>
                            <div style="font-size: 10px; color: ${statusColor};">${status} (${stats.successCount || 0} requests)</div>
                        </div>
                        <button class="tm-remove-btn" onclick="timeMachine.removeApiKey(${index})">Remove</button>
                    </div>
                `;
            }).join('');
        }

        getSubscriptionListHTML() {
            const subscriptions = this.subscriptionManager.getSubscriptions();

            if (subscriptions.length === 0) {
                return '<div style="text-align: center; color: #666; font-style: italic;">No subscriptions added</div>';
            }

            return subscriptions.map((sub, index) => `
                <div class="tm-list-item">
                    <div>
                        <div style="font-weight: bold;">${sub.name}</div>
                        <div style="font-size: 10px; color: #666;">Added ${new Date(sub.addedAt).toLocaleDateString()}</div>
                    </div>
                    <button class="tm-remove-btn" onclick="timeMachine.removeSubscription(${index})">Remove</button>
                </div>
            `).join('');
        }

        attachEventListeners() {
            // Make globally accessible
            window.timeMachine = this;

            // Hide button
            document.getElementById('tmHideBtn').addEventListener('click', () => {
                this.toggleUI();
            });

            // Show button
            document.getElementById('timeMachineToggle').addEventListener('click', () => {
                this.toggleUI();
            });

            // Date setting
            document.getElementById('tmSetDate').addEventListener('click', () => {
                const newDate = document.getElementById('tmDateInput').value;
                if (newDate) {
                    this.settings.date = newDate;
                    this.maxDate = new Date(newDate);
                    GM_setValue('ytTimeMachineDate', newDate);
                    this.apiManager.clearCache();
                    this.updateUI();
                    this.log('📅 Date updated to:', newDate);
                }
            });

            // API key management
            document.getElementById('tmAddApi').addEventListener('click', () => {
                const key = document.getElementById('tmApiInput').value.trim();
                if (this.apiManager.addKey(key)) {
                    document.getElementById('tmApiInput').value = '';
                    this.updateUI();
                }
            });

            document.getElementById('tmTestAll').addEventListener('click', async () => {
                const btn = document.getElementById('tmTestAll');
                btn.disabled = true;
                btn.textContent = 'Testing...';

                try {
                    const results = await this.apiManager.testAllKeys();
                    alert(results.join('\n'));
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'Test All Keys';
                }
            });

            // Subscription management
            document.getElementById('tmAddSub').addEventListener('click', () => {
                const name = document.getElementById('tmSubInput').value.trim();
                if (this.subscriptionManager.addSubscription(name)) {
                    document.getElementById('tmSubInput').value = '';
                    this.updateUI();
                }
            });

            document.getElementById('tmLoadVideos').addEventListener('click', async () => {
                const btn = document.getElementById('tmLoadVideos');
                btn.disabled = true;
                btn.textContent = 'Loading...';

                try {
                    await this.loadVideosFromSubscriptions();
                    btn.textContent = 'Videos Loaded!';
                } catch (error) {
                    btn.textContent = 'Load Failed';
                    this.log('❌ Failed to load videos:', error);
                } finally {
                    setTimeout(() => {
                        btn.disabled = false;
                        btn.textContent = 'Load Videos';
                    }, 2000);
                }
            });

            // Controls
            document.getElementById('tmToggle').addEventListener('click', () => {
                this.settings.active = !this.settings.active;
                GM_setValue('ytTimeMachineActive', this.settings.active);
                location.reload();
            });

            document.getElementById('tmClearCache').addEventListener('click', () => {
                this.apiManager.clearCache();
                this.videoCache.clear();
                this.updateUI();
            });

            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.shiftKey && e.key === 'T') {
                    e.preventDefault();
                    this.toggleUI();
                }
            });
        }

        toggleUI() {
            this.settings.uiVisible = !this.settings.uiVisible;
            GM_setValue('ytTimeMachineUIVisible', this.settings.uiVisible);

            const ui = document.getElementById('timeMachineUI');
            const toggle = document.getElementById('timeMachineToggle');

            if (this.settings.uiVisible) {
                ui.classList.remove('hidden');
                toggle.classList.remove('visible');
            } else {
                ui.classList.add('hidden');
                toggle.classList.add('visible');
            }
        }

        updateUI() {
            const ui = document.getElementById('timeMachineUI');
            if (ui) {
                ui.innerHTML = this.getUIHTML();
                this.attachEventListeners();
            }
        }

        removeApiKey(index) {
            if (this.apiManager.removeKey(this.apiManager.keys[index])) {
                this.updateUI();
            }
        }

        removeSubscription(index) {
            if (this.subscriptionManager.removeSubscription(index)) {
                this.updateUI();
            }
        }

        // VIDEO LOADING - ONLY PUBLIC ENDPOINTS
        async loadVideosFromSubscriptions() {
            const subscriptions = this.subscriptionManager.getSubscriptions();

            if (subscriptions.length === 0) {
                throw new Error('No subscriptions to load from');
            }

            this.log('📺 Loading videos from subscriptions...');

            const allVideos = [];
            const endDate = new Date(this.maxDate);
            endDate.setHours(23, 59, 59, 999);

            // Process subscriptions in batches
            for (let i = 0; i < subscriptions.length; i += CONFIG.batchSize) {
                const batch = subscriptions.slice(i, i + CONFIG.batchSize);

                const batchPromises = batch.map(async (sub) => {
                    try {
                        // First, try to get channel ID if we don't have it
                        let channelId = sub.id;
                        if (!channelId) {
                            channelId = await this.getChannelIdByName(sub.name);
                        }

                        if (channelId) {
                            const videos = await this.getChannelVideos(channelId, sub.name, endDate);
                            return videos;
                        }
                        return [];
                    } catch (error) {
                        this.log(`❌ Failed to load videos for ${sub.name}:`, error);
                        return [];
                    }
                });

                const batchResults = await Promise.all(batchPromises);
                batchResults.forEach(videos => allVideos.push(...videos));

                // Small delay between batches
                if (i + CONFIG.batchSize < subscriptions.length) {
                    await new Promise(resolve => setTimeout(resolve, CONFIG.apiCooldown));
                }
            }

            // Cache the results
            this.videoCache.set('subscription_videos', allVideos);
            this.log(`✅ Loaded ${allVideos.length} videos from subscriptions`);

            return allVideos;
        }

        async getChannelIdByName(channelName) {
            const cacheKey = `channel_id_${channelName}`;
            let channelId = this.apiManager.getCache(cacheKey);

            if (!channelId) {
                try {
                    const response = await this.apiManager.makeRequest(`${this.apiManager.baseUrl}/search`, {
                        part: 'snippet',
                        q: channelName,
                        type: 'channel',
                        maxResults: 1
                    });

                    if (response.items && response.items.length > 0) {
                        channelId = response.items[0].snippet.channelId;
                        this.apiManager.setCache(cacheKey, channelId);
                        this.stats.apiCalls++;
                    }
                } catch (error) {
                    this.log(`❌ Failed to find channel ID for ${channelName}:`, error);
                }
            } else {
                this.stats.cacheHits++;
            }

            return channelId;
        }

        async getChannelVideos(channelId, channelName, endDate) {
            const cacheKey = `channel_videos_${channelId}_${this.settings.date}`;
            let videos = this.apiManager.getCache(cacheKey);

            if (!videos) {
                try {
                    const response = await this.apiManager.makeRequest(`${this.apiManager.baseUrl}/search`, {
                        part: 'snippet',
                        channelId: channelId,
                        type: 'video',
                        order: 'date',
                        publishedBefore: endDate.toISOString(),
                        maxResults: CONFIG.videosPerChannel
                    });

                    videos = response.items ? response.items.map(item => ({
                        id: item.id.videoId,
                        title: item.snippet.title,
                        channel: item.snippet.channelTitle || channelName,
                        channelId: item.snippet.channelId,
                        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
                        publishedAt: item.snippet.publishedAt,
                        description: item.snippet.description || '',
                        viewCount: this.generateViewCount(item.snippet.publishedAt, endDate),
                        relativeDate: this.formatRelativeDate(item.snippet.publishedAt, endDate)
                    })) : [];

                    this.apiManager.setCache(cacheKey, videos);
                    this.stats.apiCalls++;
                } catch (error) {
                    this.log(`❌ Failed to get videos for channel ${channelName}:`, error);
                    videos = [];
                }
            } else {
                this.stats.cacheHits++;
            }

            return videos;
        }

        // FILTERING SYSTEM
        startFiltering() {
            this.log('🔥 Starting video filtering...');

            const filterVideos = () => {
                if (this.isProcessing) return;
                this.isProcessing = true;

                const videoSelectors = [
                    'ytd-video-renderer',
                    'ytd-grid-video-renderer',
                    'ytd-rich-item-renderer',
                    'ytd-compact-video-renderer'
                ];

                let processed = 0;
                let filtered = 0;

                videoSelectors.forEach(selector => {
                    const videos = document.querySelectorAll(selector);
                    videos.forEach(video => {
                        if (video.dataset.tmProcessed) return;

                        video.dataset.tmProcessed = 'true';
                        processed++;

                        if (this.shouldHideVideo(video)) {
                            video.classList.add('yt-time-machine-hidden');
                            filtered++;
                        }
                    });
                });

                if (processed > 0) {
                    this.stats.processed += processed;
                    this.stats.filtered += filtered;
                    this.log(`🔥 Processed ${processed}, filtered ${filtered}`);
                }

                this.isProcessing = false;
            };

            // Initial filter
            filterVideos();

            // Periodic filtering
            setInterval(filterVideos, CONFIG.updateInterval);

            // Observer for dynamic content
            const observer = new MutationObserver(() => {
                setTimeout(filterVideos, 100);
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        shouldHideVideo(videoElement) {
            // Check for Shorts
            if (this.isShorts(videoElement)) {
                return true;
            }

            // Check video date
            const videoDate = this.extractVideoDate(videoElement);
            if (videoDate && videoDate > this.maxDate) {
                return true;
            }

            return false;
        }

        isShorts(videoElement) {
            const shortsIndicators = [
                '[overlay-style="SHORTS"]',
                '[href*="/shorts/"]',
                '.shorts-thumbnail-overlay'
            ];

            return shortsIndicators.some(selector =>
                videoElement.querySelector(selector) ||
                videoElement.matches(selector)
            );
        }

        extractVideoDate(videoElement) {
            const dateSelectors = [
                '#metadata-line span:last-child',
                '.ytd-video-meta-block span:last-child',
                '#published-time-text',
                '[aria-label*="ago"]'
            ];

            for (const selector of dateSelectors) {
                const element = videoElement.querySelector(selector);
                if (element) {
                    const dateText = element.textContent?.trim();
                    if (dateText) {
                        return this.parseRelativeDate(dateText);
                    }
                }
            }

            return null;
        }

        parseRelativeDate(dateText) {
            if (!dateText || !dateText.includes('ago')) return null;

            const now = new Date();
            const text = dateText.toLowerCase();

            const patterns = [
                { regex: /(\d+)\s*second/i, multiplier: 1000 },
                { regex: /(\d+)\s*minute/i, multiplier: 60 * 1000 },
                { regex: /(\d+)\s*hour/i, multiplier: 60 * 60 * 1000 },
                { regex: /(\d+)\s*day/i, multiplier: 24 * 60 * 60 * 1000 },
                { regex: /(\d+)\s*week/i, multiplier: 7 * 24 * 60 * 60 * 1000 },
                { regex: /(\d+)\s*month/i, multiplier: 30 * 24 * 60 * 60 * 1000 },
                { regex: /(\d+)\s*year/i, multiplier: 365 * 24 * 60 * 60 * 1000 }
            ];

            for (const pattern of patterns) {
                const match = text.match(pattern.regex);
                if (match) {
                    const amount = parseInt(match[1]);
                    if (amount > 0) {
                        return new Date(now.getTime() - (amount * pattern.multiplier));
                    }
                }
            }

            return null;
        }

        // SEARCH INTERCEPTION
        setupSearchInterception() {
            const interceptSearch = () => {
                const searchInputs = document.querySelectorAll('input#search');
                searchInputs.forEach(input => {
                    if (!input.dataset.tmIntercepted) {
                        input.dataset.tmIntercepted = 'true';

                        input.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter' && input.value.trim()) {
                                if (!input.value.includes('before:')) {
                                    e.preventDefault();
                                    input.value += ` before:${this.settings.date}`;

                                    setTimeout(() => {
                                        const searchBtn = document.querySelector('#search-icon-legacy button');
                                        if (searchBtn) searchBtn.click();
                                    }, 50);
                                }
                            }
                        });
                    }
                });
            };

            setInterval(interceptSearch, 1000);
        }

        // HOMEPAGE REPLACEMENT
        startHomepageReplacement() {
            const replaceHomepage = () => {
                if (this.isHomePage()) {
                    const container = document.querySelector('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer');
                    if (container && !container.dataset.tmReplaced) {
                        container.dataset.tmReplaced = 'true';
                        this.replaceHomepage(container);
                    }
                }
            };

            setInterval(replaceHomepage, 1000);
        }

        isHomePage() {
            return location.pathname === '/' || location.pathname === '';
        }

        async replaceHomepage(container) {
            this.log('🏠 Replacing homepage...');

            container.innerHTML = `
                <div class="tm-homepage">
                    <div class="tm-loading">
                        <div class="tm-spinner"></div>
                        <div>Loading your time capsule from ${this.maxDate.toLocaleDateString()}...</div>
                    </div>
                </div>
            `;

            try {
                let videos = this.videoCache.get('subscription_videos');
                if (!videos || videos.length === 0) {
                    videos = await this.loadVideosFromSubscriptions();
                }

                if (videos.length > 0) {
                    const homepageHTML = this.createHomepageHTML(videos);
                    container.innerHTML = homepageHTML;
                    this.attachVideoClickHandlers();
                } else {
                    container.innerHTML = `
                        <div class="tm-homepage">
                            <div class="tm-loading">
                                <div>No videos found from ${this.maxDate.toLocaleDateString()}</div>
                                <div style="margin-top: 10px; font-size: 12px; opacity: 0.7;">
                                    Add subscriptions and API keys to see content
                                </div>
                            </div>
                        </div>
                    `;
                }
            } catch (error) {
                this.log('❌ Homepage replacement failed:', error);
                container.innerHTML = `
                    <div class="tm-homepage">
                        <div class="tm-loading">
                            <div>Failed to load time capsule</div>
                            <div style="margin-top: 10px; font-size: 12px; opacity: 0.7;">
                                ${error.message}
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        createHomepageHTML(videos) {
            const sortedVideos = videos
                .filter(video => new Date(video.publishedAt) <= this.maxDate)
                .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
                .slice(0, CONFIG.maxHomepageVideos);

            const videoCards = sortedVideos.map(video => `
                <div class="tm-video-card" data-video-id="${video.id}">
                    <img class="tm-video-thumbnail" src="${video.thumbnail}" alt="${video.title}" loading="lazy">
                    <div class="tm-video-info">
                        <div class="tm-video-title">${video.title}</div>
                        <div class="tm-video-channel">${video.channel}</div>
                        <div class="tm-video-meta">
                            <span class="tm-video-views">${video.viewCount} views</span>
                            <span class="tm-video-date">${video.relativeDate}</span>
                        </div>
                    </div>
                </div>
            `).join('');

            return `
                <div class="tm-homepage">
                    <h2 style="margin-bottom: 10px; color: var(--yt-spec-text-primary);">
                        🕰️ Your Time Capsule from ${this.maxDate.toLocaleDateString()}
                    </h2>
                    <div style="font-size: 14px; color: var(--yt-spec-text-secondary); margin-bottom: 20px;">
                        ${sortedVideos.length} videos from your subscriptions
                    </div>
                    <div class="tm-video-grid">
                        ${videoCards}
                    </div>
                </div>
            `;
        }

        attachVideoClickHandlers() {
            document.querySelectorAll('.tm-video-card').forEach(card => {
                card.addEventListener('click', () => {
                    const videoId = card.dataset.videoId;
                    if (videoId) {
                        window.location.href = `/watch?v=${videoId}`;
                    }
                });
            });
        }

        // NEW: Video page enhancement
        startVideoPageEnhancement() {
            const enhanceVideoPage = () => {
                if (this.isVideoPage()) {
                    const sidebar = document.querySelector('#secondary');
                    if (sidebar && !sidebar.dataset.tmEnhanced) {
                        sidebar.dataset.tmEnhanced = 'true';
                        this.enhanceVideoPage(sidebar);
                    }
                }
            };

            setInterval(enhanceVideoPage, 2000);
        }

        isVideoPage() {
            return location.pathname === '/watch';
        }

        async enhanceVideoPage(sidebar) {
            this.log('📺 Enhancing video page...');

            const currentChannelId = this.getCurrentChannelId();

            try {
                let videos = this.videoCache.get('subscription_videos');
                if (!videos || videos.length === 0) {
                    videos = await this.loadVideosFromSubscriptions();
                }

                if (videos.length > 0) {
                    // Separate videos by channel
                    const currentChannelVideos = videos.filter(v => v.channelId === currentChannelId);
                    const otherVideos = videos.filter(v => v.channelId !== currentChannelId);

                    // Prioritize current channel, then mix in others
                    const prioritizedVideos = [
                        ...currentChannelVideos.slice(0, Math.floor(CONFIG.maxVideoPageVideos * 0.6)),
                        ...otherVideos.slice(0, Math.floor(CONFIG.maxVideoPageVideos * 0.4))
                    ].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

                    const videoPageHTML = this.createVideoPageHTML(prioritizedVideos);

                    // Insert after existing related videos
                    const relatedContainer = sidebar.querySelector('#related');
                    if (relatedContainer) {
                        const tmSection = document.createElement('div');
                        tmSection.innerHTML = videoPageHTML;
                        relatedContainer.parentNode.insertBefore(tmSection, relatedContainer.nextSibling);
                        this.attachVideoPageClickHandlers();
                    }
                }
            } catch (error) {
                this.log('❌ Video page enhancement failed:', error);
            }
        }

        getCurrentChannelId() {
            const channelLink = document.querySelector('ytd-video-owner-renderer a');
            if (channelLink) {
                const href = channelLink.getAttribute('href');
                if (href) {
                    const match = href.match(/\/(channel|c|user)\/([^\/]+)/);
                    if (match) {
                        return match[2];
                    }
                }
            }
            return null;
        }

        createVideoPageHTML(videos) {
            const videoCards = videos.slice(0, CONFIG.maxVideoPageVideos).map(video => `
                <div class="tm-video-page-card" data-video-id="${video.id}">
                    <img class="tm-video-page-thumbnail" src="${video.thumbnail}" alt="${video.title}" loading="lazy">
                    <div class="tm-video-page-info">
                        <div class="tm-video-page-video-title">${video.title}</div>
                        <div class="tm-video-page-channel">${video.channel}</div>
                        <div class="tm-video-page-meta">
                            <span class="tm-video-views">${video.viewCount} views</span>
                            <span>•</span>
                            <span class="tm-video-date">${video.relativeDate}</span>
                        </div>
                    </div>
                </div>
            `).join('');

            return `
                <div class="tm-video-page-section">
                    <h3 class="tm-video-page-title">🕰️ From your Time Capsule (${this.maxDate.toLocaleDateString()})</h3>
                    <div class="tm-video-page-grid">
                        ${videoCards}
                    </div>
                </div>
            `;
        }

        attachVideoPageClickHandlers() {
            document.querySelectorAll('.tm-video-page-card').forEach(card => {
                card.addEventListener('click', () => {
                    const videoId = card.dataset.videoId;
                    if (videoId) {
                        window.location.href = `/watch?v=${videoId}`;
                    }
                });
            });
        }

        log(...args) {
            if (CONFIG.debugMode) {
                console.log('[Time Machine]', ...args);
            }
        }
    }

    // Initialize when page loads
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                new YouTubeTimeMachine();
            });
        } else {
            new YouTubeTimeMachine();
        }
    }

    init();

})();

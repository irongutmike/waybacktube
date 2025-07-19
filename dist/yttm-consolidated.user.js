// ==UserScript==
// @name         WayBackTube 
// @namespace    http://tampermonkey.net/
// @license MIT
// @version      25
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


    // === CONFIG ===
// Configuration settings for YouTube Time Machine
const CONFIG = {
    updateInterval: 50,
    debugMode: true,
    videosPerChannel: 30,
    maxHomepageVideos: 60,
    maxVideoPageVideos: 30,
    channelPageVideosPerMonth: 50,
    watchNextVideosCount: 30,
    seriesMatchVideosCount: 3,
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
    autoAdvanceDays: true,
    autoRefreshInterval: 20 * 60 * 1000, // 20 minutes in milliseconds
    refreshVideoPercentage: 0.5, // 50% new videos on each refresh
    homepageLoadMoreSize: 12,
    aggressiveNukingInterval: 10, // Nuke every 10ms
    viralVideoPercentage: 0.15, // 15% viral/popular videos
    viralVideosCount: 20, // Number of viral videos to fetch per timeframe

    // Recommendation system ratios
    RECOMMENDATION_COUNT: 20,
    SAME_CHANNEL_RATIO: 0.6, // 60% from same channel
    OTHER_CHANNELS_RATIO: 0.4, // 40% from other channels
    KEYWORD_RATIO: 0.5, // Half of same channel videos should use keywords

    // Watch next enhancements
    FRESH_VIDEOS_COUNT: 15, // Number of fresh videos to load from current channel
    KEYWORD_MATCH_RATIO: 0.5, // Half of fresh videos should match keywords

    // Shorts blocking selectors
    SHORTS_SELECTORS: [
        'ytd-reel-shelf-renderer',
        'ytd-rich-shelf-renderer[is-shorts]',
        '[aria-label*="Shorts"]',
        '[title*="Shorts"]',
        'ytd-video-renderer[is-shorts]',
        '.ytd-reel-shelf-renderer',
        '.shorts-shelf',
        '.reel-shelf-renderer',
        '.shortsLockupViewModelHost',
        '.ytGridShelfViewModelHost',
        '[overlay-style="SHORTS"]',
        '[href*="/shorts/"]'
    ],

    // Modern content detection patterns
    MODERN_CONTENT_INDICATORS: [
        'live', 'stream', 'streaming', 'premiere', 'premiering',
        'chat', 'superchat', 'donation', 'subscribe', 'notification',
        'bell icon', 'like and subscribe', 'smash that like',
        'comment below', 'let me know', 'what do you think',
        'thumbnail', 'clickbait', 'reaction', 'reacting to',
        'first time', 'blind reaction', 'compilation',
        'tiktok', 'instagram', 'twitter', 'social media',
        'influencer', 'content creator', 'youtuber',
        'monetization', 'demonetized', 'algorithm',
        'trending', 'viral', 'going viral', 'blew up'
    ],

    // Channel page selectors to hide
    CHANNEL_PAGE_SELECTORS: [
        'ytd-browse[page-subtype="channels"] ytd-video-renderer',
        'ytd-browse[page-subtype="channel"] ytd-video-renderer',
        'ytd-browse[page-subtype="channels"] ytd-grid-video-renderer',
        'ytd-browse[page-subtype="channel"] ytd-grid-video-renderer',
        'ytd-browse[page-subtype="channels"] ytd-rich-item-renderer',
        'ytd-browse[page-subtype="channel"] ytd-rich-item-renderer',
        'ytd-c4-tabbed-header-renderer ytd-video-renderer',
        'ytd-channel-video-player-renderer ytd-video-renderer',
        '#contents ytd-video-renderer',
        '#contents ytd-grid-video-renderer',
        '#contents ytd-rich-item-renderer',

        // Channel sections and shelves
        'ytd-browse[page-subtype="channel"] ytd-shelf-renderer',
        'ytd-browse[page-subtype="channel"] ytd-rich-shelf-renderer',
        'ytd-browse[page-subtype="channel"] ytd-item-section-renderer',
        'ytd-browse[page-subtype="channel"] ytd-section-list-renderer',
        'ytd-browse[page-subtype="channel"] ytd-horizontal-card-list-renderer',

        // Channel playlists and sections
        'ytd-browse[page-subtype="channel"] ytd-playlist-renderer',
        'ytd-browse[page-subtype="channel"] ytd-compact-playlist-renderer',
        'ytd-browse[page-subtype="channel"] ytd-grid-playlist-renderer',

        // For You, Popular Uploads, etc sections
        '#contents ytd-shelf-renderer',
        '#contents ytd-rich-shelf-renderer',
        '#contents ytd-item-section-renderer',
        '#contents ytd-section-list-renderer',
        '#contents ytd-horizontal-card-list-renderer',
        '#contents ytd-playlist-renderer',
        '#contents ytd-compact-playlist-renderer',
        '#contents ytd-grid-playlist-renderer',

        // Channel content containers
        'ytd-browse[page-subtype="channel"] #contents > *',
        'ytd-browse[page-subtype="channel"] #primary-inner > *:not(ytd-c4-tabbed-header-renderer)',

        // Specific section types
        '[data-target-id="browse-feed-tab"]',
        'ytd-browse[page-subtype="channel"] ytd-browse-feed-actions-renderer'
    ]
};

    // === API-MANAGER ===
// API Manager with unlimited rotation
class APIManager {
    constructor() {
        this.keys = GM_getValue('ytApiKeys', []);
        this.currentKeyIndex = GM_getValue('ytCurrentKeyIndex', 0);
        this.keyStats = GM_getValue('ytKeyStats', {});
        this.baseUrl = 'https://www.googleapis.com/youtube/v3';
        this.viralVideoCache = new Map();
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

        this.log('API Manager initialized with ' + this.keys.length + ' keys');
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
            this.log('Added API key: ' + apiKey.substring(0, 8) + '...');
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
            this.log('Removed API key: ' + apiKey.substring(0, 8) + '...');
            return true;
        }
        return false;
    }

    rotateToNextKey() {
        if (this.keys.length <= 1) return false;

        const startIndex = this.currentKeyIndex;
        let attempts = 0;

        while (attempts < this.keys.length) {
            this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
            attempts++;

            const currentKey = this.currentKey;
            const stats = this.keyStats[currentKey];

            if (!stats || (!stats.quotaExceeded && !stats.failed)) {
                this.saveKeys();
                this.log('Rotated to key ' + (this.currentKeyIndex + 1) + '/' + this.keys.length);
                return true;
            }
        }

        this.currentKeyIndex = 0;
        this.saveKeys();
        this.log('All keys have issues, reset to first key');
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

        const quotaErrors = ['quota', 'exceeded', 'dailyLimitExceeded', 'rateLimitExceeded'];
        if (quotaErrors.some(error => errorMessage.toLowerCase().includes(error))) {
            this.keyStats[apiKey].quotaExceeded = true;
        }

        this.saveKeys();
        this.log('Key failed: ' + apiKey.substring(0, 8) + '... - ' + errorMessage);
    }

    async makeRequest(endpoint, params) {
        return new Promise((resolve, reject) => {
            if (this.keys.length === 0) {
                reject(new Error('No API keys available'));
                return;
            }

            const attemptRequest = (attemptCount = 0) => {
                const maxAttempts = Math.min(this.keys.length, 10);

                if (attemptCount >= maxAttempts) {
                    reject(new Error('All API keys exhausted'));
                    return;
                }

                const currentKey = this.currentKey;
                if (!currentKey) {
                    reject(new Error('No valid API key'));
                    return;
                }

                const urlParams = new URLSearchParams(Object.assign({}, params, { key: currentKey }));
                const url = endpoint + '?' + urlParams.toString();

                this.log('Request attempt ' + (attemptCount + 1) + ' with key ' + (this.currentKeyIndex + 1));

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
                            let errorMessage = 'HTTP ' + response.status;
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
                                reject(new Error('API Error: ' + errorMessage));
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

    async testAllKeys() {
        const results = [];

        if (this.keys.length === 0) {
            return ['No API keys configured'];
        }

        this.log('Testing all ' + this.keys.length + ' keys...');

        for (let i = 0; i < this.keys.length; i++) {
            const testKey = this.keys[i];

            try {
                const testParams = {
                    part: 'snippet',
                    q: 'test',
                    maxResults: 1,
                    type: 'video',
                    key: testKey,
                    videoDefinition: 'any',
                    videoSyndicated: 'true',
                };

                const url = this.baseUrl + '/search?' + new URLSearchParams(testParams);

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
                        results.push('Key ' + (i + 1) + ': Working perfectly');
                    } else {
                        results.push('Key ' + (i + 1) + ': Valid but no results');
                    }
                } else {
                    let errorMsg = 'HTTP ' + response.status;
                    try {
                        const errorData = JSON.parse(response.responseText);
                        if (errorData.error) {
                            errorMsg = errorData.error.message || errorMsg;
                        }
                    } catch (e) {
                        // Use default error
                    }
                    results.push('Key ' + (i + 1) + ': ' + errorMsg);
                }
            } catch (error) {
                results.push('Key ' + (i + 1) + ': ' + (error.message || 'Network error'));
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return results;
    }

    saveKeys() {
        GM_setValue('ytApiKeys', this.keys);
        GM_setValue('ytCurrentKeyIndex', this.currentKeyIndex);
        GM_setValue('ytKeyStats', this.keyStats);
    }

    async getViralVideos(maxDate, forceRefresh = false) {
        const dateKey = maxDate.toISOString().split('T')[0];
        const cacheKey = 'viral_videos_' + dateKey;

        let viralVideos = this.getCache(cacheKey, forceRefresh);

        if (!viralVideos) {
            this.log('Fetching viral videos for ' + dateKey + '...');

            const viralQueries = [
                'viral meme',
                'funny viral video',
                'epic fail',
                'amazing viral',
                'internet meme',
                'viral compilation',
                'funny moments',
                'epic win',
                'viral trend',
                'popular meme',
                'viral challenge',
                'funny compilation',
                'viral clip',
                'internet famous',
                'viral sensation'
            ];

            const endDate = new Date(maxDate);
            endDate.setHours(23, 59, 59, 999);

            const startDate = new Date(maxDate);
            startDate.setFullYear(startDate.getFullYear() - 2); // 2 years before target date

            viralVideos = [];

            // Fetch from multiple viral queries
            for (let i = 0; i < Math.min(viralQueries.length, 8); i++) {
                try {
                    const queryIndex = Math.floor(Math.random() * viralQueries.length);
                    const query = viralQueries[queryIndex];

                    if (!query || query.trim() === '') {
                        this.log('Skipping empty query at index ' + queryIndex);
                        continue;
                    }

                    const response = await this.makeRequest(this.baseUrl + '/search', {
                        part: 'snippet',
                        q: query,
                        type: 'video',
                        order: 'relevance',
                        publishedBefore: endDate.toISOString(),
                        publishedAfter: startDate.toISOString(),
                        maxResults: 5,
                        videoDuration: 'short' // Prefer shorter viral content
                    });

                    if (response.items) {
                        const videos = response.items.map(item => ({
                            id: item.id.videoId,
                            title: item.snippet.title,
                            channel: item.snippet.channelTitle,
                            channelId: item.snippet.channelId,
                            thumbnail: item.snippet.thumbnails && item.snippet.thumbnails.medium ?
                                item.snippet.thumbnails.medium.url :
                                (item.snippet.thumbnails && item.snippet.thumbnails.default ?
                                    item.snippet.thumbnails.default.url : ''),
                            publishedAt: item.snippet.publishedAt,
                            description: item.snippet.description || '',
                            viewCount: this.generateViralViewCount(item.snippet.publishedAt, endDate),
                            relativeDate: this.formatRelativeDate(item.snippet.publishedAt, endDate),
                            isViral: true
                        }));

                        viralVideos.push.apply(viralVideos, videos);
                    }

                    // Small delay between requests
                    await new Promise(resolve => setTimeout(resolve, 300));

                } catch (error) {
                    this.log('Failed to fetch viral videos for query "' + (query || 'undefined') + '":', error);
                }
            }

            // Remove duplicates and shuffle
            const uniqueVideos = viralVideos.filter((video, index, self) =>
                index === self.findIndex(v => v.id === video.id)
            );

            viralVideos = this.shuffleArray(uniqueVideos).slice(0, CONFIG.viralVideosCount);

            this.setCache(cacheKey, viralVideos, forceRefresh);
            this.log('Cached ' + viralVideos.length + ' viral videos for ' + dateKey);
        }

        return viralVideos || [];
    }

    generateViralViewCount(publishedAt, referenceDate) {
        const videoDate = new Date(publishedAt);
        const refDate = new Date(referenceDate);
        const daysSinceUpload = Math.floor((refDate - videoDate) / (1000 * 60 * 60 * 24));

        // Viral videos should have higher view counts
        let minViews, maxViews;

        if (daysSinceUpload <= 7) {
            minViews = 100000;
            maxViews = 5000000;
        } else if (daysSinceUpload <= 30) {
            minViews = 500000;
            maxViews = 20000000;
        } else if (daysSinceUpload <= 365) {
            minViews = 1000000;
            maxViews = 50000000;
        } else {
            minViews = 2000000;
            maxViews = 100000000;
        }

        const multiplier = Math.random() * 0.8 + 0.2;
        const viewCount = Math.floor(minViews + (maxViews - minViews) * multiplier);

        return this.formatViewCount(viewCount);
    }

    async getChannelVideosForPage(channelId, channelName, endDate, startDate = null) {
        const cacheKey = 'channel_page_videos_' + channelId + '_' + endDate.toISOString().split('T')[0] + '_' + (startDate ? startDate.toISOString().split('T')[0] : 'latest');
        let videos = this.getCache(cacheKey);

        if (!videos) {
            try {
                const params = {
                    part: 'snippet',
                    channelId: channelId,
                    type: 'video',
                    order: 'date',
                    publishedBefore: endDate.toISOString(),
                    maxResults: CONFIG.channelPageVideosPerMonth
                };

                if (startDate) {
                    params.publishedAfter = startDate.toISOString();
                }

                const response = await this.makeRequest(this.baseUrl + '/search', params);

                videos = response.items ? response.items.map(item => ({
                    id: item.id.videoId,
                    title: item.snippet.title,
                    channel: item.snippet.channelTitle || channelName,
                    channelId: item.snippet.channelId,
                    thumbnail: item.snippet.thumbnails && item.snippet.thumbnails.medium ?
                        item.snippet.thumbnails.medium.url :
                        (item.snippet.thumbnails && item.snippet.thumbnails.default ?
                            item.snippet.thumbnails.default.url : ''),
                    publishedAt: item.snippet.publishedAt,
                    description: item.snippet.description || '',
                    viewCount: this.generateRealisticViewCount(item.snippet.publishedAt, endDate),
                    relativeDate: this.formatRelativeDate(item.snippet.publishedAt, endDate)
                })) : [];

                this.setCache(cacheKey, videos);
                this.stats.apiCalls++;
            } catch (error) {
                this.log('Failed to get channel page videos for ' + channelName + ':', error);
                videos = [];
            }
        } else {
            this.stats.cacheHits++;
        }

        return videos;
    }

    generateRealisticViewCount(publishedAt, referenceDate) {
        const videoDate = new Date(publishedAt);
        const refDate = new Date(referenceDate);
        const daysSinceUpload = Math.floor((refDate - videoDate) / (1000 * 60 * 60 * 24));

        let minViews, maxViews;

        if (daysSinceUpload <= 1) {
            minViews = 50;
            maxViews = 10000;
        } else if (daysSinceUpload <= 7) {
            minViews = 500;
            maxViews = 100000;
        } else if (daysSinceUpload <= 30) {
            minViews = 2000;
            maxViews = 500000;
        } else if (daysSinceUpload <= 365) {
            minViews = 5000;
            maxViews = 2000000;
        } else {
            minViews = 10000;
            maxViews = 10000000;
        }

        const multiplier = Math.random() * 0.8 + 0.2;
        const viewCount = Math.floor(minViews + (maxViews - minViews) * multiplier);

        return this.formatViewCount(viewCount);
    }

    formatRelativeDate(publishedAt, referenceDate) {
        const videoDate = new Date(publishedAt);
        const refDate = new Date(referenceDate);
        const diffMs = refDate - videoDate;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            if (diffHours === 0) {
                const diffMinutes = Math.floor(diffMs / (1000 * 60));
                return diffMinutes <= 1 ? '1 minute ago' : diffMinutes + ' minutes ago';
            }
            return diffHours === 1 ? '1 hour ago' : diffHours + ' hours ago';
        } else if (diffDays === 1) {
            return '1 day ago';
        } else if (diffDays < 7) {
            return diffDays + ' days ago';
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return weeks === 1 ? '1 week ago' : weeks + ' weeks ago';
        } else if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            return months === 1 ? '1 month ago' : months + ' months ago';
        } else {
            const years = Math.floor(diffDays / 365);
            return years === 1 ? '1 year ago' : years + ' years ago';
        }
    }

    formatViewCount(count) {
        if (count >= 1000000) {
            return (count / 1000000).toFixed(1).replace('.0', '') + 'M';
        } else if (count >= 1000) {
            return (count / 1000).toFixed(1).replace('.0', '') + 'K';
        }
        return count.toLocaleString();
    }

    shuffleArray(array) {
        const shuffled = array.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = shuffled[i];
            shuffled[i] = shuffled[j];
            shuffled[j] = temp;
        }
        return shuffled;
    }

    async searchVideos(query, maxResults = 10, endDate = null) {
        try {
            const params = {
                part: 'snippet',
                q: query,
                type: 'video',
                order: 'relevance',
                maxResults: maxResults
            };

            if (endDate) {
                params.publishedBefore = endDate.toISOString();
            }

            const response = await this.makeRequest(this.baseUrl + '/search', params);

            return response.items ? response.items.map(item => ({
                id: item.id.videoId,
                title: item.snippet.title,
                channel: item.snippet.channelTitle,
                channelId: item.snippet.channelId,
                thumbnail: item.snippet.thumbnails && item.snippet.thumbnails.medium ?
                    item.snippet.thumbnails.medium.url :
                    (item.snippet.thumbnails && item.snippet.thumbnails.default ?
                        item.snippet.thumbnails.default.url : ''),
                publishedAt: item.snippet.publishedAt,
                description: item.snippet.description || '',
                viewCount: this.generateRealisticViewCount(item.snippet.publishedAt, endDate || new Date()),
                relativeDate: this.formatRelativeDate(item.snippet.publishedAt, endDate || new Date())
            })) : [];

        } catch (error) {
            this.log('Search failed for query "' + query + '":', error);
            return [];
        }
    }

    getCache(key, forceRefresh = false) {
        if (forceRefresh) return null;

        const cached = GM_getValue('cache_' + key, null);
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

    setCache(key, value, forceRefresh = false) {
        const cacheData = {
            timestamp: Date.now(),
            value: value
        };
        GM_setValue('cache_' + key, JSON.stringify(cacheData));
    }

    clearCache() {
        const keys = GM_listValues();
        keys.forEach(key => {
            if (key.startsWith('cache_')) {
                GM_deleteValue(key);
            }
        });
    }

    log() {
        if (CONFIG.debugMode) {
            console.log.apply(console, ['[API Manager]'].concat(Array.prototype.slice.call(arguments)));
        }
    }

    async getRealWorldDateFromAPI() {
        this.log('Getting real world date from YouTube API...');

        if (this.keys.length === 0) {
            this.log('No API keys available, falling back to system time');
            return new Date();
        }

        try {
            // Make a lightweight API request to get server time from response headers
            // We'll search for a well-known channel (YouTube's own channel) with minimal results
            const response = await new Promise((resolve, reject) => {
                const currentKey = this.currentKey;
                if (!currentKey) {
                    reject(new Error('No valid API key'));
                    return;
                }

                const urlParams = new URLSearchParams({
                    part: 'id',
                    forUsername: 'YouTube', // YouTube's official channel
                    maxResults: 1,
                    key: currentKey
                });

                const url = this.baseUrl + '/channels?' + urlParams.toString();

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    timeout: 8000,
                    headers: {
                        'Accept': 'application/json'
                    },
                    onload: (response) => {
                        resolve(response);
                    },
                    onerror: (error) => {
                        reject(new Error('Network error: ' + error));
                    },
                    ontimeout: () => {
                        reject(new Error('Request timeout'));
                    }
                });
            });

            // Extract date from response headers
            let serverDate = null;

            // Try to get date from response headers
            if (response.responseHeaders) {
                const headers = response.responseHeaders.toLowerCase();

                // Look for Date header
                const dateMatch = headers.match(/date:\s*([^\r\n]+)/i);
                if (dateMatch) {
                    serverDate = new Date(dateMatch[1].trim());
                    this.log('Extracted server date from headers:', serverDate.toISOString());
                }
            }

            // If we couldn't get date from headers, try parsing response for any date info
            if (!serverDate || isNaN(serverDate.getTime())) {
                try {
                    const data = JSON.parse(response.responseText);
                    // YouTube API responses sometimes include etag with timestamp info
                    // But for now, we'll just use current time as fallback
                    this.log('Could not extract valid date from headers, using system time');
                    serverDate = new Date();
                } catch (e) {
                    this.log('Could not parse API response, using system time');
                    serverDate = new Date();
                }
            }

            // Validate the date
            if (isNaN(serverDate.getTime())) {
                this.log('Invalid date from API, using system time');
                return new Date();
            }

            // Check if date is reasonable (not too far in past/future)
            const now = new Date();
            const timeDiff = Math.abs(serverDate.getTime() - now.getTime());
            const maxDiff = 24 * 60 * 60 * 1000; // 24 hours

            if (timeDiff > maxDiff) {
                this.log('Server date seems unreasonable, using system time. Server:', serverDate.toISOString(), 'System:', now.toISOString());
                return now;
            }

            this.log('Successfully got real world date from API:', serverDate.toISOString());
            return serverDate;
        } catch (error) {
            this.log('Failed to get real world date from API:', error.message);
            this.log('Falling back to system time');
            return new Date();
        }
    }
}

    // === SUBSCRIPTION-MANAGER ===
// Subscription Manager
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

    // === RECOMMENDATION-ENGINE ===
// Enhanced Recommendation Engine
class RecommendationEngine {
    constructor(apiManager) {
        this.apiManager = apiManager;
    }

    extractVideoKeywords(title) {
        const keywords = [];

        // Extract episode numbers with various formats
        const episodePatterns = [
            /episode\s*(\d+)/i,
            /ep\.?\s*(\d+)/i,
            /part\s*(\d+)/i,
            /#(\d+)/,
            /\b(\d+)\b/g
        ];

        episodePatterns.forEach(pattern => {
            const matches = title.match(pattern);
            if (matches) {
                if (pattern.global) {
                    const numbers = title.match(pattern);
                    if (numbers) {
                        numbers.forEach(match => {
                            const num = parseInt(match);
                            if (num > 0 && num < 1000) {
                                keywords.push('episode ' + num, 'ep ' + num, 'part ' + num, '#' + num);
                            }
                        });
                    }
                } else {
                    const episodeNum = matches[1];
                    keywords.push('episode ' + episodeNum, 'ep ' + episodeNum, 'part ' + episodeNum, '#' + episodeNum);
                }
            }
        });

        // Extract common series and gaming keywords
        const seriesKeywords = [
            'mod review', 'feed the beast', 'ftb', 'minecraft', 'tutorial',
            'let\'s play', 'lets play', 'playthrough', 'walkthrough', 'guide', 'tips',
            'tricks', 'build', 'showcase', 'series', 'season', 'modded', 'vanilla',
            'survival', 'creative', 'adventure', 'multiplayer', 'single player',
            'review', 'reaction', 'first time', 'blind', 'commentary', 'gameplay',
            'stream', 'live', 'vod', 'highlights', 'compilation', 'montage'
        ];

        seriesKeywords.forEach(keyword => {
            if (title.toLowerCase().includes(keyword.toLowerCase())) {
                keywords.push(keyword);
            }
        });

        // Extract words in quotes, brackets, or parentheses
        const quotedWords = title.match(/["'](.*?)["']|\[(.*?)\]|\((.*?)\)/g);
        if (quotedWords) {
            quotedWords.forEach(word => {
                const cleaned = word.replace(/["'\[\]()]/g, '').trim();
                if (cleaned.length > 2) {
                    keywords.push(cleaned);
                }
            });
        }

        // Extract potential game/mod names (capitalized words)
        const capitalizedWords = title.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
        if (capitalizedWords) {
            capitalizedWords.forEach(word => {
                if (word.length > 3 && !['The', 'And', 'For', 'With', 'From'].includes(word)) {
                    keywords.push(word);
                }
            });
        }

        return keywords.filter((value, index, self) => self.indexOf(value) === index);
    }

    async generateEnhancedRecommendations(currentChannelId, currentVideoTitle, allVideos, maxDate, freshVideos = [], seriesVideos = []) {
        if (!allVideos || allVideos.length === 0) {
            console.log('[RecommendationEngine] No videos available for recommendations');
            return [];
        }

        console.log('[RecommendationEngine] Generating recommendations for channel: ' + currentChannelId + ', video: ' + currentVideoTitle);
        console.log('[RecommendationEngine] Total videos available: ' + allVideos.length);
        console.log('[RecommendationEngine] Fresh videos available: ' + freshVideos.length);
        console.log('[RecommendationEngine] Series videos available: ' + seriesVideos.length);

        const currentVideoKeywords = this.extractVideoKeywords(currentVideoTitle || '');
        console.log('[RecommendationEngine] Extracted keywords:', currentVideoKeywords);

        // Filter videos by date
        const validVideos = allVideos.filter(video =>
            new Date(video.publishedAt) <= maxDate
        );

        const validFreshVideos = freshVideos.filter(video =>
            new Date(video.publishedAt) <= maxDate
        );

        const validSeriesVideos = seriesVideos.filter(video =>
            new Date(video.publishedAt) <= maxDate && video.title !== currentVideoTitle
        );

        console.log('[RecommendationEngine] Valid videos after date filter: ' + validVideos.length);
        console.log('[RecommendationEngine] Valid fresh videos after date filter: ' + validFreshVideos.length);
        console.log('[RecommendationEngine] Valid series videos after date filter: ' + validSeriesVideos.length);

        // Separate current channel videos from others
        const currentChannelVideos = currentChannelId ?
            validVideos.filter(v => v.channelId === currentChannelId && v.title !== currentVideoTitle) :
            [];
        const otherChannelVideos = validVideos.filter(v =>
            !currentChannelId || v.channelId !== currentChannelId
        );

        console.log('[RecommendationEngine] Current channel videos: ' + currentChannelVideos.length);
        console.log('[RecommendationEngine] Other channel videos: ' + otherChannelVideos.length);

        // Calculate distribution - series videos will be interspersed later
        const freshVideosToUse = Math.min(CONFIG.FRESH_VIDEOS_COUNT, validFreshVideos.length);
        const keywordFreshCount = Math.floor(freshVideosToUse * CONFIG.KEYWORD_MATCH_RATIO);
        const regularFreshCount = freshVideosToUse - keywordFreshCount;

        const remainingSlots = CONFIG.RECOMMENDATION_COUNT - freshVideosToUse;
        const sameChannelCount = Math.floor(remainingSlots * CONFIG.SAME_CHANNEL_RATIO);
        const otherChannelsCount = remainingSlots - sameChannelCount;

        console.log('[RecommendationEngine] Distribution - Fresh: ' + freshVideosToUse + ' (' + keywordFreshCount + ' keyword, ' + regularFreshCount + ' regular), Same channel: ' + sameChannelCount + ', Other channels: ' + otherChannelsCount);

        const baseRecommendations = [];

        // Priority 1: Fresh keyword-matching videos from current channel
        if (keywordFreshCount > 0 && currentVideoKeywords.length > 0) {
            const keywordFreshVideos = this.findKeywordVideos(validFreshVideos, currentVideoKeywords);
            baseRecommendations.push.apply(baseRecommendations, this.shuffleArray(keywordFreshVideos).slice(0, keywordFreshCount));
        }
        console.log('[RecommendationEngine] Added ' + baseRecommendations.length + ' fresh keyword videos');

        // Priority 2: Other fresh videos from current channel
        if (regularFreshCount > 0) {
            const nonKeywordFreshVideos = validFreshVideos.filter(v =>
                baseRecommendations.indexOf(v) === -1 && v.title !== currentVideoTitle
            );
            baseRecommendations.push.apply(baseRecommendations, this.shuffleArray(nonKeywordFreshVideos).slice(0, regularFreshCount));
        }
        console.log('[RecommendationEngine] Added fresh videos, total: ' + baseRecommendations.length);

        // Priority 3: Cached videos from same channel
        if (sameChannelCount > 0) {
            const nonKeywordVideos = currentChannelVideos.filter(v =>
                baseRecommendations.indexOf(v) === -1 &&
                !validFreshVideos.some(fv => fv.id === v.id)
            );
            baseRecommendations.push.apply(baseRecommendations, this.shuffleArray(nonKeywordVideos).slice(0, sameChannelCount));
        }
        console.log('[RecommendationEngine] Added regular same channel videos, total: ' + baseRecommendations.length);

        // Priority 4: Videos from other channels
        if (otherChannelsCount > 0 && otherChannelVideos.length > 0) {
            baseRecommendations.push.apply(baseRecommendations, this.shuffleArray(otherChannelVideos).slice(0, otherChannelsCount));
        }
        console.log('[RecommendationEngine] Added other channel videos, total: ' + baseRecommendations.length);

        // Fill remaining slots if needed
        const allAvailableVideos = validVideos.concat(validFreshVideos).concat(validSeriesVideos);
        while (baseRecommendations.length < CONFIG.RECOMMENDATION_COUNT && allAvailableVideos.length > 0) {
            const remaining = allAvailableVideos.filter(v =>
                baseRecommendations.indexOf(v) === -1 && v.title !== currentVideoTitle
            );
            if (remaining.length === 0) break;
            baseRecommendations.push(remaining[Math.floor(Math.random() * remaining.length)]);
        }

        // Now intersperse series videos randomly into the base recommendations
        const finalRecommendations = this.intersperseSeriesVideos(baseRecommendations, validSeriesVideos);

        console.log('[RecommendationEngine] Final recommendations count: ' + finalRecommendations.length);
        return finalRecommendations.slice(0, CONFIG.RECOMMENDATION_COUNT);
    }

    intersperseSeriesVideos(baseRecommendations, seriesVideos) {
        if (!seriesVideos || seriesVideos.length === 0) {
            return baseRecommendations;
        }

        const maxSeriesToUse = Math.min(CONFIG.seriesMatchVideosCount || 3, seriesVideos.length);
        const seriesToUse = this.shuffleArray(seriesVideos).slice(0, maxSeriesToUse);

        console.log('[RecommendationEngine] Interspersing ' + seriesToUse.length + ' series videos randomly');

        // Create a copy of base recommendations
        const result = baseRecommendations.slice();

        // Generate random positions to insert series videos
        const positions = [];
        const maxPosition = Math.min(result.length, CONFIG.RECOMMENDATION_COUNT - seriesToUse.length);

        for (let i = 0; i < seriesToUse.length; i++) {
            let position;
            do {
                position = Math.floor(Math.random() * (maxPosition + i));
            } while (positions.includes(position));
            positions.push(position);
        }

        // Sort positions in descending order to insert from back to front
        positions.sort((a, b) => b - a);

        // Insert series videos at random positions
        positions.forEach((position, index) => {
            result.splice(position, 0, seriesToUse[index]);
        });

        console.log('[RecommendationEngine] Inserted series videos at positions:', positions.reverse());
        return result;
    }

    findKeywordVideos(videos, keywords) {
        return videos.filter(video => {
            const videoTitle = video.title.toLowerCase();
            return keywords.some(keyword =>
                videoTitle.includes(keyword.toLowerCase())
            );
        });
    }

    shuffleArray(array) {
        const shuffled = array.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = shuffled[i];
            shuffled[i] = shuffled[j];
            shuffled[j] = temp;
        }
        return shuffled;
    }
}

    // === SHORTS-BLOCKER ===
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

    // === DATE-MODIFIER ===
// Enhanced Date Modifier
class DateModifier {
    constructor(maxDate) {
        this.maxDate = maxDate;
        this.processedElements = new WeakSet();
        this.originalDates = new Map();
    }

    setMaxDate(date) {
        this.maxDate = new Date(date);
    }

    formatRelativeDate(publishedAt, referenceDate) {
        const videoDate = new Date(publishedAt);
        const refDate = new Date(referenceDate);
        const diffMs = refDate - videoDate;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            if (diffHours === 0) {
                const diffMinutes = Math.floor(diffMs / (1000 * 60));
                return diffMinutes <= 1 ? '1 minute ago' : diffMinutes + ' minutes ago';
            }
            return diffHours === 1 ? '1 hour ago' : diffHours + ' hours ago';
        } else if (diffDays === 1) {
            return '1 day ago';
        } else if (diffDays < 7) {
            return diffDays + ' days ago';
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return weeks === 1 ? '1 week ago' : weeks + ' weeks ago';
        } else if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            return months === 1 ? '1 month ago' : months + ' months ago';
        } else {
            const years = Math.floor(diffDays / 365);
            return years === 1 ? '1 year ago' : years + ' years ago';
        }
    }

    parseRelativeDate(dateText) {
        if (!dateText || !dateText.includes('ago')) return null;

        const now = new Date();
        const text = dateText.toLowerCase();

        const streamMatch = text.match(/streamed\s+(.+)/i);
        if (streamMatch) {
            text = streamMatch[1];
        }

        const premiereMatch = text.match(/premiered\s+(.+)/i);
        if (premiereMatch) {
            text = premiereMatch[1];
        }

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

    parseRelativeToTimeMachine(dateText, referenceDate) {
        const now = new Date(referenceDate);
        const text = dateText.toLowerCase();

        const streamMatch = text.match(/streamed\s+(.+)/i);
        if (streamMatch) {
            dateText = streamMatch[1];
        }

        const premiereMatch = text.match(/premiered\s+(.+)/i);
        if (premiereMatch) {
            dateText = premiereMatch[1];
        }

        const match = dateText.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);

        if (!match) {
            const absoluteDate = this.parseAbsoluteDate(dateText);
            if (!isNaN(absoluteDate.getTime())) {
                return this.formatRelativeDate(absoluteDate.toISOString(), referenceDate);
            }
            return dateText;
        }

        const amount = parseInt(match[1]);
        const unit = match[2];

        switch (unit.toLowerCase()) {
            case 'second':
                now.setSeconds(now.getSeconds() - amount);
                break;
            case 'minute':
                now.setMinutes(now.getMinutes() - amount);
                break;
            case 'hour':
                now.setHours(now.getHours() - amount);
                break;
            case 'day':
                now.setDate(now.getDate() - amount);
                break;
            case 'week':
                now.setDate(now.getDate() - (amount * 7));
                break;
            case 'month':
                now.setMonth(now.getMonth() - amount);
                break;
            case 'year':
                now.setFullYear(now.getFullYear() - amount);
                break;
        }

        return this.formatRelativeDate(now.toISOString(), referenceDate);
    }

    parseAbsoluteDate(dateStr) {
        const formats = [
            /(\w+)\s+(\d+),\s+(\d+)/,
            /(\d+)\/(\d+)\/(\d+)/,
            /(\d+)-(\d+)-(\d+)/,
        ];

        const monthNames = {
            'jan': 0, 'january': 0, 'feb': 1, 'february': 1, 'mar': 2, 'march': 2,
            'apr': 3, 'april': 3, 'may': 4, 'jun': 5, 'june': 5,
            'jul': 6, 'july': 6, 'aug': 7, 'august': 7, 'sep': 8, 'september': 8,
            'oct': 9, 'october': 9, 'nov': 10, 'november': 10, 'dec': 11, 'december': 11
        };

        for (const format of formats) {
            const match = dateStr.match(format);
            if (match) {
                if (format === formats[0]) {
                    const month = monthNames[match[1].toLowerCase()];
                    return new Date(parseInt(match[3]), month, parseInt(match[2]));
                } else if (format === formats[1]) {
                    return new Date(parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]));
                } else if (format === formats[2]) {
                    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
                }
            }
        }

        return new Date(dateStr);
    }

    updateDates() {
        const dateSelectors = [
            '.ytd-video-meta-block #metadata-line span:last-child',
            '.ytd-video-meta-block .style-scope.ytd-video-meta-block',
            '#metadata-line span',
            '#metadata-line span:nth-child(2)', // Search results date
            '.ytd-video-renderer #metadata-line span:nth-child(2)',
            '.ytd-compact-video-renderer #metadata-line span:nth-child(2)',
            '.ytd-grid-video-renderer #metadata-line span:nth-child(2)',
            '.ytd-video-secondary-info-renderer #info span',
            '.ytd-video-renderer #metadata-line span',
            '.ytd-compact-video-renderer #metadata-line span',
            '.ytd-grid-video-renderer #metadata-line span',
            '.ytd-compact-video-renderer .style-scope.ytd-video-meta-block',
            '.ytd-watch-next-secondary-results-renderer #metadata-line span',
            '.ytd-comment-renderer #header-author .published-time-text',
            '.ytd-comment-thread-renderer .published-time-text',
            '.ytd-playlist-video-renderer #metadata span',
            '.ytd-grid-video-renderer #metadata-line span',
            '.ytd-rich-item-renderer #metadata-line span',
            // Search results specific selectors
            'ytd-video-renderer[data-context-menu-target] #metadata-line span:nth-child(2)',
            'ytd-video-renderer #metadata-line span[aria-label*="ago"]',
            '.ytd-video-renderer .ytd-video-meta-block span:nth-child(2)',
            '.ytd-video-renderer #metadata span:nth-child(2)'
        ];

        dateSelectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    if (this.processedElements.has(element)) return;

                    const originalText = element.textContent && element.textContent.trim();
                    if (!originalText) return;

                    // Skip if this is a view count (contains "views")
                    if (originalText.toLowerCase().includes('view')) return;

                    if (!originalText.includes('ago') &&
                        !originalText.match(/\d+/) &&
                        !originalText.includes('Streamed') &&
                        !originalText.includes('Premiered')) {
                        return;
                    }

                    if (!this.originalDates.has(element)) {
                        this.originalDates.set(element, originalText);
                    }

                    const modifiedDate = this.parseRelativeToTimeMachine(originalText, this.maxDate);
                    if (modifiedDate !== originalText) {
                        element.textContent = modifiedDate;
                        element.setAttribute('data-original-date', originalText);
                        element.setAttribute('data-modified-by-time-machine', 'true');
                        this.processedElements.add(element);
                    }
                });
            } catch (error) {
                // Ignore selector errors
            }
        });

        // Add view counts to search results that are missing them
        this.addMissingViewCounts();
        this.hideBeforeTags();
    }

    addMissingViewCounts() {
        const videoElements = document.querySelectorAll('ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer');

        videoElements.forEach(videoElement => {
            if (videoElement.dataset.tmViewsAdded) return;

            const metadataLine = videoElement.querySelector('#metadata-line');
            if (!metadataLine) return;

            const spans = metadataLine.querySelectorAll('span');
            let hasViews = false;

            spans.forEach(span => {
                if (span.textContent && span.textContent.toLowerCase().includes('view')) {
                    hasViews = true;
                }
            });

            if (!hasViews && spans.length > 0) {
                // Generate a realistic view count
                const viewCount = this.generateRealisticViewCount();

                // Create view count element
                const viewSpan = document.createElement('span');
                viewSpan.textContent = viewCount + ' views';
                viewSpan.style.color = 'var(--yt-spec-text-secondary)';
                viewSpan.setAttribute('data-added-by-time-machine', 'true');

                // Add separator if there are other elements
                if (spans.length > 0) {
                    const separator = document.createElement('span');
                    separator.textContent = ' • ';
                    separator.style.color = 'var(--yt-spec-text-secondary)';
                    separator.setAttribute('data-added-by-time-machine', 'true');

                    // Insert before the date (usually the last span)
                    const lastSpan = spans[spans.length - 1];
                    metadataLine.insertBefore(viewSpan, lastSpan);
                    metadataLine.insertBefore(separator, lastSpan);
                } else {
                    metadataLine.appendChild(viewSpan);
                }

                videoElement.dataset.tmViewsAdded = 'true';
            }
        });
    }

    generateRealisticViewCount() {
        // Generate view counts that feel authentic for the time period
        const ranges = [
            { min: 100, max: 5000, weight: 30 },      // Small videos
            { min: 5000, max: 50000, weight: 25 },    // Medium videos
            { min: 50000, max: 500000, weight: 20 },  // Popular videos
            { min: 500000, max: 2000000, weight: 15 }, // Very popular
            { min: 2000000, max: 10000000, weight: 8 }, // Viral
            { min: 10000000, max: 50000000, weight: 2 } // Mega viral
        ];

        // Weighted random selection
        const totalWeight = ranges.reduce((sum, range) => sum + range.weight, 0);
        let random = Math.random() * totalWeight;

        for (const range of ranges) {
            random -= range.weight;
            if (random <= 0) {
                const viewCount = Math.floor(Math.random() * (range.max - range.min) + range.min);
                return this.formatViewCount(viewCount);
            }
        }

        // Fallback
        return this.formatViewCount(Math.floor(Math.random() * 100000) + 1000);
    }

    formatViewCount(count) {
        if (count >= 1000000) {
            return (count / 1000000).toFixed(1).replace('.0', '') + 'M';
        } else if (count >= 1000) {
            return (count / 1000).toFixed(1).replace('.0', '') + 'K';
        }
        return count.toLocaleString();
    }
    hideBeforeTags() {
        const beforeTags = document.querySelectorAll('span, div');
        beforeTags.forEach(element => {
            const text = element.textContent;
            if (text && text.includes('before:') && text.includes(this.maxDate.toISOString().split('T')[0])) {
                element.style.display = 'none';
                element.setAttribute('data-hidden-by-time-machine', 'true');
            }
        });

        const filterChips = document.querySelectorAll('ytd-search-filter-renderer');
        filterChips.forEach(chip => {
            const text = chip.textContent;
            if (text && text.includes('before:')) {
                chip.style.display = 'none';
                chip.setAttribute('data-hidden-by-time-machine', 'true');
            }
        });
    }

    restoreOriginalDates() {
        this.originalDates.forEach((originalText, element) => {
            if (element && element.textContent !== originalText) {
                element.textContent = originalText;
                element.removeAttribute('data-original-date');
                element.removeAttribute('data-modified-by-time-machine');
            }
        });

        const hiddenElements = document.querySelectorAll('[data-hidden-by-time-machine]');
        hiddenElements.forEach(element => {
            element.style.display = '';
            element.removeAttribute('data-hidden-by-time-machine');
        });

        this.processedElements = new WeakSet();
        this.originalDates.clear();
    }
}

    // === SEARCH-INTERCEPTOR ===
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

    // === UI-MANAGER ===
// UI Manager
class UIManager {
    constructor(timeMachine) {
        this.timeMachine = timeMachine;
    }

    getUIHTML() {
        const subscriptions = this.timeMachine.subscriptionManager.getSubscriptions();

        return '<div style="display: flex; justify-content: between; align-items: center; margin-bottom: 15px;">' +
            '<h2 style="margin: 0; font-size: 16px; color: #ff6b6b;">Time Machine</h2>' +
            '<button id="tmHideBtn" style="background: none; border: none; color: white; cursor: pointer; font-size: 18px;">×</button>' +
            '</div>' +

            '<div class="tm-section">' +
            '<h3>Target Date</h3>' +
            '<div class="tm-input-group">' +
            '<input type="date" id="tmDateInput" class="tm-input" value="' + this.timeMachine.settings.date + '" max="' + new Date().toISOString().split('T')[0] + '">' +
            '<button id="tmSetDate" class="tm-button">Set Date</button>' +
            '</div>' +
            '<div style="font-size: 11px; color: #aaa; margin-top: 5px;">' +
            'Currently traveling to: ' + this.timeMachine.maxDate.toLocaleDateString() +
            (CONFIG.autoAdvanceDays ? ' (Auto-advancing daily)' : '') +
            '</div>' +
            '</div>' +

            '<div class="tm-section">' +
            '<h3>API Keys (' + this.timeMachine.apiManager.keys.length + ')</h3>' +
            '<div class="tm-input-group">' +
            '<input type="password" id="tmApiInput" class="tm-input" placeholder="Enter YouTube API key">' +
            '<button id="tmAddApi" class="tm-button">Add</button>' +
            '</div>' +
            '<div class="tm-list" id="tmApiList">' + this.getApiKeyListHTML() + '</div>' +
            '<div style="margin-top: 8px;">' +
            '<button id="tmTestAll" class="tm-button" style="width: 100%;">Test All Keys</button>' +
            '</div>' +
            '</div>' +

            '<div class="tm-section">' +
            '<h3>Subscriptions (' + subscriptions.length + ')</h3>' +
            '<div class="tm-input-group">' +
            '<input type="text" id="tmSubInput" class="tm-input" placeholder="Enter channel name">' +
            '<button id="tmAddSub" class="tm-button">Add</button>' +
            '</div>' +
            '<div class="tm-list" id="tmSubList">' + this.getSubscriptionListHTML() + '</div>' +
            '<div style="margin-top: 8px;">' +
            '<button id="tmLoadVideos" class="tm-button" style="width: 100%;">Load Videos</button>' +
            '</div>' +
            '</div>' +

            '<div class="tm-section">' +
            '<h3>Statistics</h3>' +
            '<div class="tm-stats">' +
            '<div class="tm-stat">' +
            '<div class="tm-stat-value">' + this.timeMachine.stats.processed + '</div>' +
            '<div>Processed</div>' +
            '</div>' +
            '<div class="tm-stat">' +
            '<div class="tm-stat-value">' + this.timeMachine.stats.filtered + '</div>' +
            '<div>Filtered</div>' +
            '</div>' +
            '<div class="tm-stat">' +
            '<div class="tm-stat-value">' + this.timeMachine.stats.apiCalls + '</div>' +
            '<div>API Calls</div>' +
            '</div>' +
            '<div class="tm-stat">' +
            '<div class="tm-stat-value">' + this.timeMachine.stats.cacheHits + '</div>' +
            '<div>Cache Hits</div>' +
            '</div>' +
            '</div>' +
            '</div>' +

            '<div class="tm-section">' +
            '<h3>Controls</h3>' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">' +
            '<button id="tmToggle" class="tm-button">' + (this.timeMachine.settings.active ? 'Disable' : 'Enable') + '</button>' +
            '<button id="tmClearCache" class="tm-button">Clear Cache</button>' +
            '</div>' +
            '<div style="margin-top: 8px;">' +
            '<button id="tmRefreshVideosBtn" class="tm-button" style="width: 100%;">Refresh Videos</button>' +
            '</div>' +
            '</div>' +

            '<div style="font-size: 10px; color: #666; text-align: center; margin-top: 15px;">' +
            'Press Ctrl+Shift+T to toggle UI' +
            '</div>';
    }

    getApiKeyListHTML() {
        if (this.timeMachine.apiManager.keys.length === 0) {
            return '<div style="text-align: center; color: #666; font-style: italic;">No API keys added</div>';
        }

        return this.timeMachine.apiManager.keys.map((key, index) => {
            const stats = this.timeMachine.apiManager.keyStats[key] || {};
            const isCurrent = index === this.timeMachine.apiManager.currentKeyIndex;
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

            return '<div class="tm-list-item">' +
                '<div>' +
                '<div style="font-weight: bold;">' + key.substring(0, 8) + '...' + key.substring(key.length - 4) + '</div>' +
                '<div style="font-size: 10px; color: ' + statusColor + ';">' + status + '</div>' +
                '</div>' +
                '<button class="tm-remove-btn" onclick="timeMachine.apiManager.removeKey(\'' + key + '\'); timeMachine.updateUI();">Remove</button>' +
                '</div>';
        }).join('');
    }

    getSubscriptionListHTML() {
        const subscriptions = this.timeMachine.subscriptionManager.getSubscriptions();

        if (subscriptions.length === 0) {
            return '<div style="text-align: center; color: #666; font-style: italic;">No subscriptions added</div>';
        }

        return subscriptions.map((sub, index) =>
            '<div class="tm-list-item">' +
            '<div>' +
            '<div style="font-weight: bold;">' + sub.name + '</div>' +
            '<div style="font-size: 10px; color: #666;">Added ' + new Date(sub.addedAt).toLocaleDateString() + '</div>' +
            '</div>' +
            '<button class="tm-remove-btn" onclick="timeMachine.removeSubscription(' + index + ')">Remove</button>' +
            '</div>'
        ).join('');
    }

    getStyles() {
        return `
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

            /* Homepage replacement - 4 columns */
            .tm-channel-page {
                padding: 20px;
                max-width: 1200px;
                margin: 0 auto;
            }

            .tm-channel-header {
                margin-bottom: 20px;
                padding: 15px;
                background: var(--yt-spec-raised-background);
                border-radius: 8px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .tm-channel-title {
                font-size: 18px;
                font-weight: 500;
                color: var(--yt-spec-text-primary);
            }

            .tm-load-older-btn {
                padding: 8px 16px;
                background: #ff0000;
                border: none;
                border-radius: 4px;
                color: white;
                cursor: pointer;
                font-size: 12px;
                transition: background 0.2s;
            }

            .tm-load-older-btn:hover {
                background: #cc0000;
            }

            .tm-load-older-btn:disabled {
                background: #666;
                cursor: not-allowed;
            }

            .tm-homepage {
                padding: 20px;
                max-width: 1200px;
                margin: 0 auto;
            }

            .tm-video-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
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

            .tm-viral-video {
                border: 2px solid #ff6b6b;
                box-shadow: 0 0 10px rgba(255, 107, 107, 0.3);
            }

            .tm-viral-video:hover {
                box-shadow: 0 4px 20px rgba(255, 107, 107, 0.5);
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

            /* Load More Button */
            .tm-load-more-btn {
                display: block;
                margin: 30px auto;
                padding: 12px 24px;
                background: linear-gradient(to bottom, #f8f8f8, #e0e0e0);
                border: 1px solid #ccc;
                border-radius: 3px;
                color: #333;
                font-family: Arial, sans-serif;
                font-size: 13px;
                font-weight: bold;
                text-shadow: 0 1px 0 rgba(255,255,255,0.8);
                cursor: pointer;
                box-shadow: 0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.8);
                transition: all 0.2s;
            }

            .tm-load-more-btn:hover {
                background: linear-gradient(to bottom, #ffffff, #e8e8e8);
                box-shadow: 0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.9);
            }

            .tm-load-more-btn:active {
                background: linear-gradient(to bottom, #e0e0e0, #f0f0f0);
                box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
            }

            .tm-load-more-btn:disabled {
                background: #f0f0f0;
                color: #999;
                cursor: not-allowed;
                box-shadow: none;
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
                grid-template-columns: 1fr;
                gap: 12px;
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
                    grid-template-columns: repeat(3, 1fr);
                }
            }

            @media (max-width: 768px) {
                .tm-video-grid {
                    grid-template-columns: repeat(2, 1fr);
                }

                .tm-video-page-grid {
                    grid-template-columns: 1fr;
                }
            }

            @media (max-width: 480px) {
                .tm-video-grid {
                    grid-template-columns: 1fr;
                }
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

            /* ULTRA-AGGRESSIVE homepage nuking */
            ytd-browse[page-subtype="home"] ytd-video-renderer:not(.tm-approved),
            ytd-browse[page-subtype="home"] ytd-grid-video-renderer:not(.tm-approved),
            ytd-browse[page-subtype="home"] ytd-rich-item-renderer:not(.tm-approved),
            ytd-browse[page-subtype="home"] ytd-compact-video-renderer:not(.tm-approved),
            ytd-browse[page-subtype="home"] ytd-movie-renderer:not(.tm-approved),
            ytd-browse[page-subtype="home"] ytd-playlist-renderer:not(.tm-approved),
            ytd-browse[page-subtype="home"] ytd-rich-shelf-renderer:not(.tm-approved),
            ytd-browse[page-subtype="home"] ytd-shelf-renderer:not(.tm-approved),
            ytd-browse[page-subtype="home"] ytd-item-section-renderer:not(.tm-approved),
            ytd-browse[page-subtype="home"] ytd-continuation-item-renderer:not(.tm-approved),
            ytd-browse[page-subtype="home"] ytd-rich-grid-renderer #contents > *:not(.tm-homepage):not(.tm-approved),
            ytd-browse[page-subtype="home"] #contents > *:not(.tm-homepage):not(.tm-approved),
            ytd-browse[page-subtype="home"] ytd-thumbnail:not(.tm-approved),
            ytd-browse[page-subtype="home"] [href*="/watch?v="]:not(.tm-approved) {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                height: 0 !important;
                width: 0 !important;
                max-height: 0 !important;
                max-width: 0 !important;
                overflow: hidden !important;
                position: absolute !important;
                left: -9999px !important;
                top: -9999px !important;
                z-index: -9999 !important;
                pointer-events: none !important;
            }
        `;
    }
}

    // === MAIN TIME MACHINE CLASS ===
    class YouTubeTimeMachine {
        constructor() {
            this.apiManager = new APIManager();
            this.subscriptionManager = new SubscriptionManager();
            this.recommendationEngine = new RecommendationEngine(this.apiManager);
            this.shortsBlocker = new ShortsBlocker();
            this.uiManager = new UIManager(this);

            this.settings = {
                date: GM_getValue('ytTimeMachineDate', '2014-06-14'),
                active: GM_getValue('ytTimeMachineActive', true),
                uiVisible: GM_getValue('ytTimeMachineUIVisible', true),
                lastAdvancedDate: GM_getValue('ytLastAdvancedDate', new Date().toDateString())
            };

            this.checkAndAdvanceDate();

            this.maxDate = new Date(this.settings.date);
            this.dateModifier = new DateModifier(this.maxDate);
            this.searchInterceptor = new SearchInterceptor(this.maxDate, this.shortsBlocker);

            this.isProcessing = false;
            this.videoCache = new Map();
            this.homepageLoadedCount = 0;

            this.stats = {
                filtered: 0,
                processed: 0,
                apiCalls: 0,
                cacheHits: 0
            };

            this.init();

            // Set up hourly real-time checks
            this.setupHourlyTimeCheck();
        }

        setupHourlyTimeCheck() {
            // Check real time every hour to catch any time changes
            setInterval(() => {
                if (CONFIG.autoAdvanceDays) {
                    this.log('Hourly time check...');
                    this.checkRealTimeAndAdvance();
                }
            }, 60 * 60 * 1000); // Every hour
        }

        setupAutoRefresh() {
            if (CONFIG.autoRefreshInterval) {
                this.log('Setting up aggressive auto-refresh every ' + (CONFIG.autoRefreshInterval / 60000) + ' minutes with ' + (CONFIG.refreshVideoPercentage * 100) + '% new videos');

                setInterval(() => {
                    if (this.isHomePage()) {
                        this.log('Auto-refresh triggered - loading fresh videos...');
                        this.loadVideosFromSubscriptions(true).then(() => {
                            const container = document.querySelector('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer');
                            if (container) {
                                this.replaceHomepage(container, true);
                            }
                            this.log('Auto-refresh completed successfully');
                        }).catch(error => {
                            this.log('Auto-refresh failed:', error);
                        });
                    }
                }, CONFIG.autoRefreshInterval);
            }
        }

        startTimeTracking() {
            // Check for time jumps every 30 seconds
            this.timeTrackingInterval = setInterval(() => {
                this.detectTimeJumps();
            }, 30000);

            // Also check immediately
            setTimeout(() => this.detectTimeJumps(), 1000);
        }

        detectTimeJumps() {
            const now = Date.now();
            const expectedTime = this.lastTimeCheck + 30000; // Expected time after 30 seconds
            const timeDifference = now - expectedTime;

            this.log('=== TIME JUMP DETECTION ===');
            this.log('Current time:', new Date(now).toString());
            this.log('Expected time:', new Date(expectedTime).toString());
            this.log('Time difference (ms):', timeDifference);
            this.log('Time difference (hours):', Math.round(timeDifference / (1000 * 60 * 60) * 100) / 100);

            // If time jumped forward by more than 2 minutes, consider it a manual change
            if (timeDifference > 120000) { // 2 minutes in milliseconds
                const hoursJumped = timeDifference / (1000 * 60 * 60);
                const daysJumped = Math.floor(hoursJumped / 24);

                this.log('DETECTED TIME JUMP! Hours jumped:', hoursJumped);
                this.log('Days to advance:', daysJumped);

                if (daysJumped >= 1) {
                    this.advanceTimeMachineDate(daysJumped);
                }
            }

            this.lastTimeCheck = now;
            this.log('=== TIME JUMP DETECTION END ===');
        }

        advanceTimeMachineDate(daysToAdvance) {
            this.log('=== ADVANCING TIME MACHINE DATE ===');
            this.log('Days to advance:', daysToAdvance);
            this.log('Current target date:', this.settings.date);

            // Parse current date and advance it
            const currentDate = new Date(this.settings.date + 'T00:00:00');
            this.log('Parsed current date:', currentDate.toString());

            // Add the days
            currentDate.setDate(currentDate.getDate() + daysToAdvance);

            // Format back to YYYY-MM-DD
            const newDateString = currentDate.toISOString().split('T')[0];

            this.log('New target date:', newDateString);

            // Update all the date references
            this.settings.date = newDateString;
            this.maxDate = new Date(newDateString + 'T23:59:59');

            // Save to storage
            GM_setValue('ytSettings', this.settings);
            GM_setValue('ytLastAdvancedDate', new Date().toDateString());

            // Update other components
            if (this.dateModifier) {
                this.dateModifier.setMaxDate(this.maxDate);
            }
            if (this.searchInterceptor) {
                this.searchInterceptor.setMaxDate(this.maxDate);
            }

            // Clear caches to force fresh content
            this.apiManager.clearCache();

            // Update UI
            this.updateUI();

            this.log('Time machine date advanced successfully!');
            this.log('=== ADVANCING TIME MACHINE DATE END ===');
        }

        async checkAndAdvanceDate() {
            if (!CONFIG.autoAdvanceDays) return;

            this.log('=== API-BASED DATE ADVANCEMENT START ===');
            this.log('Current time machine target date:', this.settings.date);

            // Get real world date from YouTube API servers
            const realWorldToday = await this.apiManager.getRealWorldDateFromAPI();
            this.log('Real world date from API:', realWorldToday.toISOString());

            const lastAdvancedString = GM_getValue('ytLastAdvancedDate', null);
            this.log('Last advanced date from storage:', lastAdvancedString);

            let lastAdvancedRealWorldDate;
            if (lastAdvancedString) {
                lastAdvancedRealWorldDate = new Date(lastAdvancedString);
                this.log('Last advanced real world date:', lastAdvancedRealWorldDate.toISOString());
            } else {
                // First time running, set to yesterday so we advance by 1 day
                lastAdvancedRealWorldDate = new Date(realWorldToday);
                lastAdvancedRealWorldDate.setDate(lastAdvancedRealWorldDate.getDate() - 1);
                this.log('First time running, using yesterday as baseline:', lastAdvancedRealWorldDate.toISOString());
            }

            // Normalize both dates to midnight for accurate day comparison
            const todayNormalized = new Date(realWorldToday.getFullYear(), realWorldToday.getMonth(), realWorldToday.getDate());
            const lastAdvancedNormalized = new Date(lastAdvancedRealWorldDate.getFullYear(), lastAdvancedRealWorldDate.getMonth(), lastAdvancedRealWorldDate.getDate());

            this.log('Today normalized:', todayNormalized.toISOString());
            this.log('Last advanced normalized:', lastAdvancedNormalized.toISOString());

            const daysDifference = Math.floor((todayNormalized - lastAdvancedNormalized) / (1000 * 60 * 60 * 24));
            this.log('Days difference calculated:', daysDifference);

            if (daysDifference > 0) {
                this.log('*** ADVANCING TIME MACHINE DATE BY', daysDifference, 'DAYS ***');

                // Get current time machine target date and advance it
                const currentTimeMachineDate = new Date(this.settings.date);
                this.log('Current time machine target date before advancement:', currentTimeMachineDate.toISOString());

                // Advance the time machine target date by the calculated days
                currentTimeMachineDate.setDate(currentTimeMachineDate.getDate() + daysDifference);
                this.log('New time machine target date after advancement:', currentTimeMachineDate.toISOString());

                // Update the time machine settings
                this.settings.date = currentTimeMachineDate.toISOString().split('T')[0];
                this.log('Updated settings.date string:', this.settings.date);

                // Save settings to storage
                GM_setValue('ytSettings', this.settings);
                this.log('Saved updated settings to storage');

                // Update last advanced date to today's real world date
                GM_setValue('ytLastAdvancedDate', realWorldToday.toISOString());
                this.log('Updated last advanced date to:', realWorldToday.toISOString());

                // Update all internal date references
                this.maxDate = new Date(this.settings.date + 'T23:59:59');
                this.log('Updated internal maxDate to:', this.maxDate.toISOString());

                if (this.dateModifier) {
                    this.dateModifier.setMaxDate(this.maxDate);
                    this.log('Updated dateModifier maxDate');
                }

                if (this.searchInterceptor) {
                    this.searchInterceptor.setMaxDate(this.maxDate);
                    this.log('Updated searchInterceptor maxDate');
                }

                // Clear all caches to force fresh content loading
                this.apiManager.clearCache();
                this.log('Cleared all API caches');

                // Update UI to show new date
                this.updateUI();
                this.log('Updated UI to reflect new target date');

                this.log('*** TIME MACHINE DATE ADVANCEMENT COMPLETED ***');
            } else {
                this.log('No date advancement needed (days difference:', daysDifference, ')');
            }

            this.log('=== API-BASED DATE ADVANCEMENT END ===');
        }

        async checkRealTimeAndAdvance() {
            try {
                this.log('Checking real world time via API...');

                // Get real current time from external API
                const realCurrentTime = await this.getRealCurrentTime();
                if (!realCurrentTime) {
                    this.log('Failed to get real time, falling back to system time');
                    this.fallbackDateAdvancement();
                    return;
                }

                this.log('Real current time from API:', realCurrentTime.toDateString());

                // Get last real time we recorded
                const lastRealTimeStr = GM_getValue('ytLastRealTime', null);
                const lastRealTime = lastRealTimeStr ? new Date(lastRealTimeStr) : new Date('2000-01-01');

                this.log('Last recorded real time:', lastRealTime.toDateString());

                // Normalize both to midnight for day comparison
                const currentRealDay = new Date(realCurrentTime.getFullYear(), realCurrentTime.getMonth(), realCurrentTime.getDate());
                const lastRealDay = new Date(lastRealTime.getFullYear(), lastRealTime.getMonth(), lastRealTime.getDate());

                // Calculate days difference based on REAL time
                const daysDifference = Math.floor((currentRealDay - lastRealDay) / (1000 * 60 * 60 * 24));

                this.log('Real days passed since last check:', daysDifference);

                if (daysDifference > 0) {
                    // Advance the time machine date by real days passed
                    const currentTimeMachineDate = new Date(this.settings.date);
                    currentTimeMachineDate.setDate(currentTimeMachineDate.getDate() + daysDifference);

                    const newTargetDate = currentTimeMachineDate.toISOString().split('T')[0];

                    this.log('*** ADVANCING TIME MACHINE DATE ***');
                    this.log('From:', this.settings.date);
                    this.log('To:', newTargetDate);
                    this.log('Days advanced:', daysDifference);

                    // Update everything
                    this.settings.date = newTargetDate;
                    this.settings.lastAdvancedDate = currentRealDay.toDateString();

                    // Save to persistent storage
                    GM_setValue('ytTimeMachineDate', newTargetDate);
                    GM_setValue('ytLastAdvancedDate', currentRealDay.toDateString());
                    GM_setValue('ytLastRealTime', realCurrentTime.toISOString());

                    // Update all references
                    this.maxDate = new Date(newTargetDate);
                    this.dateModifier.setMaxDate(newTargetDate);
                    this.searchInterceptor.setMaxDate(this.maxDate);

                    // Clear caches
                    this.apiManager.clearCache();
                    this.videoCache.clear();
                    this.homepageLoadedCount = 0;

                    this.log('*** TIME MACHINE DATE ADVANCEMENT COMPLETE ***');
                } else {
                    this.log('No advancement needed - same real day');
                    // Still update the last real time for future comparisons
                    GM_setValue('ytLastRealTime', realCurrentTime.toISOString());
                }

            } catch (error) {
                this.log('Error checking real time:', error);
                this.fallbackDateAdvancement();
            }
        }

        async getRealCurrentTime() {
            const timeAPIs = [
                'https://worldtimeapi.org/api/timezone/Etc/UTC',
                'https://api.ipgeolocation.io/timezone?apiKey=free',
                'http://worldclockapi.com/api/json/utc/now'
            ];

            for (const apiUrl of timeAPIs) {
                try {
                    const response = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: apiUrl,
                            timeout: 5000,
                            onload: resolve,
                            onerror: reject,
                            ontimeout: reject
                        });
                    });

                    if (response.status === 200) {
                        const data = JSON.parse(response.responseText);

                        // Parse different API response formats
                        let dateTime = null;
                        if (data.datetime) {
                            dateTime = data.datetime; // worldtimeapi.org
                        } else if (data.date_time) {
                            dateTime = data.date_time; // ipgeolocation.io
                        } else if (data.currentDateTime) {
                            dateTime = data.currentDateTime; // worldclockapi.com
                        }

                        if (dateTime) {
                            const realTime = new Date(dateTime);
                            if (!isNaN(realTime.getTime())) {
                                this.log('Got real time from', apiUrl, ':', realTime.toISOString());
                                return realTime;
                            }
                        }
                    }
                } catch (error) {
                    this.log('Time API failed:', apiUrl, error);
                    continue;
                }
            }

            return null;
        }

        fallbackDateAdvancement() {
            // Fallback to system time if APIs fail
            this.log('Using fallback system time advancement');

            const today = new Date();
            const lastAdvancedStr = this.settings.lastAdvancedDate;
            const lastAdvanced = lastAdvancedStr ? new Date(lastAdvancedStr) : new Date('2000-01-01');

            const todayNormalized = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const lastAdvancedNormalized = new Date(lastAdvanced.getFullYear(), lastAdvanced.getMonth(), lastAdvanced.getDate());

            const daysDifference = Math.floor((todayNormalized - lastAdvancedNormalized) / (1000 * 60 * 60 * 24));

            if (daysDifference > 0) {
                const currentTimeMachineDate = new Date(this.settings.date);
                currentTimeMachineDate.setDate(currentTimeMachineDate.getDate() + daysDifference);

                const newTargetDate = currentTimeMachineDate.toISOString().split('T')[0];

                this.settings.date = newTargetDate;
                this.settings.lastAdvancedDate = todayNormalized.toDateString();

                GM_setValue('ytTimeMachineDate', newTargetDate);
                GM_setValue('ytLastAdvancedDate', todayNormalized.toDateString());

                this.maxDate = new Date(newTargetDate);
                this.dateModifier.setMaxDate(newTargetDate);
                this.searchInterceptor.setMaxDate(this.maxDate);

                this.apiManager.clearCache();
                this.videoCache.clear();
                this.homepageLoadedCount = 0;

                this.log('Fallback advancement complete:', newTargetDate);
            }
        }

        generateViewCount(publishedAt, referenceDate) {
            const videoDate = new Date(publishedAt);
            const refDate = new Date(referenceDate);
            const daysSinceUpload = Math.floor((refDate - videoDate) / (1000 * 60 * 60 * 24));

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

            const multiplier = Math.random() * 0.8 + 0.2;
            const viewCount = Math.floor(minViews + (maxViews - minViews) * multiplier);

            return this.formatViewCount(viewCount);
        }

        formatViewCount(count) {
            if (count >= 1000000) {
                return (count / 1000000).toFixed(1) + 'M';
            } else if (count >= 1000) {
                return (count / 1000).toFixed(1) + 'K';
            }
            return count.toString();
        }

        init() {
            this.log('YouTube Time Machine initializing...');

            // Immediately nuke homepage if we're on it
            if (this.isHomePage()) {
                this.shortsBlocker.nukeHomepage();
            }

            this.addStyles();
            this.setupUI();

            if (this.settings.active) {
                this.startFiltering();
                this.searchInterceptor.setupSearchInterception();
                this.startHomepageReplacement();
                this.startVideoPageEnhancement();
                this.setupAutoRefresh();
            }

            this.log('YouTube Time Machine ready!');
        }

        addStyles() {
            const shortsCSS = this.shortsBlocker.getShortsBlockingCSS();
            const uiCSS = this.uiManager.getStyles();
            GM_addStyle(shortsCSS + uiCSS);
        }

        setupUI() {
            const ui = document.createElement('div');
            ui.id = 'timeMachineUI';
            if (!this.settings.uiVisible) {
                ui.classList.add('hidden');
            }

            ui.innerHTML = this.uiManager.getUIHTML();

            const toggle = document.createElement('button');
            toggle.id = 'timeMachineToggle';
            toggle.innerHTML = '🕰️';
            toggle.title = 'Show Time Machine';
            if (this.settings.uiVisible) {
                toggle.classList.remove('visible');
            } else {
                toggle.classList.add('visible');
            }

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

        attachEventListeners() {
            window.timeMachine = this;

            document.getElementById('tmHideBtn').addEventListener('click', () => {
                this.toggleUI();
            });

            document.getElementById('timeMachineToggle').addEventListener('click', () => {
                this.toggleUI();
            });

            document.getElementById('tmSetDate').addEventListener('click', () => {
                const newDate = document.getElementById('tmDateInput').value;
                if (newDate) {
                    this.settings.date = newDate;
                    this.maxDate = new Date(newDate);
                    this.dateModifier.setMaxDate(newDate);
                    this.searchInterceptor.setMaxDate(newDate);
                    GM_setValue('ytTimeMachineDate', newDate);
                    this.apiManager.clearCache();
                    this.homepageLoadedCount = 0;
                    this.updateUI();
                    this.log('Date updated to:', newDate);
                }
            });

            document.getElementById('tmAddApi').addEventListener('click', () => {
                const key = document.getElementById('tmApiInput').value.trim();
                if (this.apiManager.addKey(key)) {
                    document.getElementById('tmApiInput').value = '';
                    this.updateUI();
                }
            });

            document.getElementById('tmTestAll').addEventListener('click', () => {
                const btn = document.getElementById('tmTestAll');
                btn.disabled = true;
                btn.textContent = 'Testing...';

                this.apiManager.testAllKeys().then(results => {
                    alert(results.join('\n'));
                }).finally(() => {
                    btn.disabled = false;
                    btn.textContent = 'Test All Keys';
                });
            });

            document.getElementById('tmAddSub').addEventListener('click', () => {
                const name = document.getElementById('tmSubInput').value.trim();
                if (this.subscriptionManager.addSubscription(name)) {
                    document.getElementById('tmSubInput').value = '';
                    this.updateUI();
                }
            });

            document.getElementById('tmLoadVideos').addEventListener('click', () => {
                const btn = document.getElementById('tmLoadVideos');
                btn.disabled = true;
                btn.textContent = 'Loading...';

                this.loadVideosFromSubscriptions().then(() => {
                    btn.textContent = 'Videos Loaded!';
                }).catch(error => {
                    btn.textContent = 'Load Failed';
                    this.log('Failed to load videos:', error);
                }).finally(() => {
                    setTimeout(() => {
                        btn.disabled = false;
                        btn.textContent = 'Load Videos';
                    }, 2000);
                });
            });

            document.getElementById('tmToggle').addEventListener('click', () => {
                this.settings.active = !this.settings.active;
                GM_setValue('ytTimeMachineActive', this.settings.active);
                location.reload();
            });

            document.getElementById('tmClearCache').addEventListener('click', () => {
                this.apiManager.clearCache();
                this.videoCache.clear();
                this.homepageLoadedCount = 0;
                this.updateUI();
            });

            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.shiftKey && e.key === 'T') {
                    e.preventDefault();
                    this.toggleUI();
                }
            });

            const refreshBtn = document.getElementById('tmRefreshVideosBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    refreshBtn.disabled = true;
                    refreshBtn.textContent = 'Refreshing...';

                    this.loadVideosFromSubscriptions().then(() => {
                        const container = document.querySelector('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer');
                        if (container) {
                            this.replaceHomepage(container);
                        }
                        refreshBtn.textContent = 'Refreshed!';
                    }).catch(error => {
                        refreshBtn.textContent = 'Refresh Failed';
                        this.log('Manual refresh failed:', error);
                    }).finally(() => {
                        setTimeout(() => {
                            refreshBtn.disabled = false;
                            refreshBtn.textContent = 'Refresh Videos';
                        }, 2000);
                    });
                });
            }
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
                ui.innerHTML = this.uiManager.getUIHTML();
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

        async loadVideosFromSubscriptions(isRefresh = false) {
            const subscriptions = this.subscriptionManager.getSubscriptions();

            if (subscriptions.length === 0) {
                throw new Error('No subscriptions to load from');
            }

            this.log('Loading videos from subscriptions' + (isRefresh ? ' (refresh mode)' : '') + '...');

            // Get existing videos for refresh mixing
            const existingVideos = this.videoCache.get('subscription_videos') || [];

            const allVideos = [];
            const endDate = new Date(this.maxDate);
            endDate.setHours(23, 59, 59, 999);

            // Load viral videos alongside subscription videos
            const viralVideos = await this.apiManager.getViralVideos(endDate, isRefresh);
            this.log('Loaded ' + viralVideos.length + ' viral videos');

            for (let i = 0; i < subscriptions.length; i += CONFIG.batchSize) {
                const batch = subscriptions.slice(i, i + CONFIG.batchSize);

                const batchPromises = batch.map(async (sub) => {
                    try {
                        let channelId = sub.id;
                        if (!channelId) {
                            channelId = await this.getChannelIdByName(sub.name);
                        }

                        if (channelId) {
                            const videos = await this.getChannelVideos(channelId, sub.name, endDate, isRefresh);
                            return videos;
                        }
                        return [];
                    } catch (error) {
                        this.log('Failed to load videos for ' + sub.name + ':', error);
                        return [];
                    }
                });

                const batchResults = await Promise.all(batchPromises);
                batchResults.forEach(videos => allVideos.push.apply(allVideos, videos));

                if (i + CONFIG.batchSize < subscriptions.length) {
                    await new Promise(resolve => setTimeout(resolve, CONFIG.apiCooldown));
                }
            }

            // Mix with existing videos if this is a refresh
            let finalVideos = allVideos;
            if (isRefresh && existingVideos.length > 0) {
                const existingViralVideos = this.videoCache.get('viral_videos') || [];
                finalVideos = this.mixVideosForRefresh(allVideos, existingVideos, viralVideos, existingViralVideos);
                this.log('Mixed ' + allVideos.length + ' new videos with ' + existingVideos.length + ' existing videos + ' + viralVideos.length + ' viral videos');
            } else {
                // For initial load, just add viral videos to the mix
                finalVideos = allVideos.concat(viralVideos);
            }

            // Store viral videos separately for mixing
            this.videoCache.set('viral_videos', viralVideos);
            this.videoCache.set('subscription_videos', finalVideos);
            this.log('Loaded ' + finalVideos.length + ' total videos from subscriptions');

            return finalVideos;
        }

        mixVideosForRefresh(newVideos, existingVideos, newViralVideos = [], existingViralVideos = []) {
            // Calculate how many videos to keep from each set
            const totalDesired = Math.max(CONFIG.maxHomepageVideos, existingVideos.length);
            const viralVideoCount = Math.floor(totalDesired * CONFIG.viralVideoPercentage);
            const remainingSlots = totalDesired - viralVideoCount;
            const newVideoCount = Math.floor(remainingSlots * CONFIG.refreshVideoPercentage);
            const existingVideoCount = remainingSlots - newVideoCount;

            this.log('Mixing videos: ' + newVideoCount + ' new + ' + existingVideoCount + ' existing + ' + viralVideoCount + ' viral = ' + totalDesired + ' total');

            // Shuffle and select videos
            const selectedNew = this.shuffleArray(newVideos).slice(0, newVideoCount);
            const selectedExisting = this.shuffleArray(existingVideos).slice(0, existingVideoCount);

            // Mix viral videos (prefer new viral over existing)
            const allViralVideos = newViralVideos.concat(existingViralVideos);
            const selectedViral = this.shuffleArray(allViralVideos).slice(0, viralVideoCount);

            // Combine and shuffle the final mix
            const mixedVideos = selectedNew.concat(selectedExisting).concat(selectedViral);
            return this.shuffleArray(mixedVideos);
        }

        async getChannelIdByName(channelName) {
            const cacheKey = 'channel_id_' + channelName;
            let channelId = this.apiManager.getCache(cacheKey);

            if (!channelId) {
                try {
                    const response = await this.apiManager.makeRequest(this.apiManager.baseUrl + '/search', {
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
                    this.log('Failed to find channel ID for ' + channelName + ':', error);
                }
            } else {
                this.stats.cacheHits++;
            }

            return channelId;
        }

        async getChannelVideos(channelId, channelName, endDate, forceRefresh = false) {
            const cacheKey = 'channel_videos_' + channelId + '_' + this.settings.date;
            let videos = this.apiManager.getCache(cacheKey, forceRefresh);

            if (!videos) {
                try {
                    const response = await this.apiManager.makeRequest(this.apiManager.baseUrl + '/search', {
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
                        thumbnail: item.snippet.thumbnails && item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : (item.snippet.thumbnails && item.snippet.thumbnails.default ? item.snippet.thumbnails.default.url : ''),
                        publishedAt: item.snippet.publishedAt,
                        description: item.snippet.description || '',
                        viewCount: this.generateViewCount(item.snippet.publishedAt, endDate),
                        relativeDate: this.dateModifier.formatRelativeDate(item.snippet.publishedAt, endDate)
                    })) : [];

                    this.apiManager.setCache(cacheKey, videos, forceRefresh);
                    this.stats.apiCalls++;
                } catch (error) {
                    this.log('Failed to get videos for channel ' + channelName + ':', error);
                    videos = [];
                }
            } else {
                this.stats.cacheHits++;
            }

            return videos;
        }

        startFiltering() {
            this.log('Starting ultra-aggressive video filtering...');

            const filterVideos = () => {
                if (this.isProcessing) return;
                this.isProcessing = true;

                const videoSelectors = [
                    'ytd-video-renderer',
                    'ytd-grid-video-renderer',
                    'ytd-rich-item-renderer',
                    'ytd-compact-video-renderer',
                    'ytd-movie-renderer',
                    'ytd-playlist-renderer',
                    'ytd-channel-renderer',
                    'ytd-shelf-renderer',
                    'ytd-rich-shelf-renderer',
                    'ytd-horizontal-card-list-renderer',
                    'ytd-compact-movie-renderer',
                    'ytd-compact-playlist-renderer',
                    'ytd-compact-station-renderer',
                    'ytd-compact-radio-renderer'
                ];

                this.cleanupWatchNext();
                this.shortsBlocker.blockShorts();
                this.dateModifier.updateDates();

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
                        } else {
                            video.classList.add('tm-approved');
                            video.classList.remove('yt-time-machine-hidden');
                        }
                    });
                });

                if (processed > 0) {
                    this.stats.processed += processed;
                    this.stats.filtered += filtered;
                    this.log('Processed ' + processed + ', filtered ' + filtered);
                }

                this.isProcessing = false;
            };

            filterVideos();

            setInterval(filterVideos, CONFIG.updateInterval);

            const observer = new MutationObserver(() => {
                setTimeout(filterVideos, 10);
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        cleanupWatchNext() {
            // Don't aggressively hide watch next content - let our enhancement handle it
            const autoplayRenderer = document.querySelector('ytd-compact-autoplay-renderer');
            if (autoplayRenderer && !autoplayRenderer.dataset.tmHidden) {
                autoplayRenderer.dataset.tmHidden = 'true';
                autoplayRenderer.style.display = 'none';
            }
        }

        shouldHideVideo(videoElement) {
            if (this.shortsBlocker.isShorts(videoElement)) {
                return true;
            }

            const videoDate = this.extractVideoDate(videoElement);
            if (videoDate && videoDate > this.maxDate) {
                return true;
            }

            return false;
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
                    const dateText = element.textContent && element.textContent.trim();
                    if (dateText) {
                        return this.dateModifier.parseRelativeDate(dateText);
                    }
                }
            }

            return null;
        }

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

        async replaceHomepage(container, isRefresh = false) {
            this.log('Replacing homepage' + (isRefresh ? ' (refresh)' : '') + '...');

            container.innerHTML = '<div class="tm-homepage">' +
                '<div class="tm-loading">' +
                '<div class="tm-spinner"></div>' +
                '<div>' + (isRefresh ? 'Refreshing' : 'Loading') + ' your time capsule from ' + this.maxDate.toLocaleDateString() + '...</div>' +
                '</div>' +
                '</div>';

            try {
                let videos = this.videoCache.get('subscription_videos');
                if (!videos || videos.length === 0) {
                    videos = await this.loadVideosFromSubscriptions(isRefresh);
                }

                if (videos.length > 0) {
                    const homepageHTML = this.createHomepageHTML(videos, isRefresh);
                    container.innerHTML = homepageHTML;
                    this.attachVideoClickHandlers();
                    this.attachLoadMoreHandler();
                } else {
                    container.innerHTML = '<div class="tm-homepage">' +
                        '<div class="tm-loading">' +
                        '<div>No videos found from ' + this.maxDate.toLocaleDateString() + '</div>' +
                        '</div>' +
                        '</div>';
                }
            } catch (error) {
                this.log('Homepage replacement failed:', error);
                container.innerHTML = '<div class="tm-homepage">' +
                    '<div class="tm-loading">' +
                    '<div>Failed to ' + (isRefresh ? 'refresh' : 'load') + ' time capsule</div>' +
                    '<div style="margin-top: 10px; font-size: 12px; opacity: 0.7;">' +
                    error.message +
                    '</div>' +
                    '</div>' +
                    '</div>';
            }
        }

        createHomepageHTML(videos, isRefresh = false) {
            const targetDate = new Date(this.maxDate);

            // Separate viral videos from regular videos
            const viralVideos = videos.filter(video => video.isViral);
            const regularVideos = videos.filter(video => !video.isViral);

            // Filter by date
            const validViralVideos = viralVideos.filter(video => new Date(video.publishedAt) <= this.maxDate);
            const validRegularVideos = regularVideos.filter(video => new Date(video.publishedAt) <= this.maxDate);

            // Combine and shuffle for final display
            const finalVideos = this.shuffleArray(validRegularVideos.concat(validViralVideos));

            const videoCards = finalVideos.map(video =>
                '<div class="tm-video-card' + (video.isViral ? ' tm-viral-video' : '') + '" data-video-id="' + video.id + '">' +
                '<img class="tm-video-thumbnail" src="' + video.thumbnail + '" alt="' + video.title + '" loading="lazy">' +
                '<div class="tm-video-info">' +
                '<div class="tm-video-title">' + video.title + '</div>' +
                '<div class="tm-video-channel">' + video.channel + '</div>' +
                '<div class="tm-video-meta">' +
                '<span class="tm-video-views">' + video.viewCount + ' views</span>' +
                '<span class="tm-video-date">' + video.relativeDate + '</span>' +
                '</div>' +
                '</div>' +
                '</div>'
            ).join('');

            const viralCount = validViralVideos.length;
            const regularCount = validRegularVideos.length;
            const refreshIndicator = isRefresh ? ' (refreshed with ' + (CONFIG.refreshVideoPercentage * 100) + '% new content + ' + (CONFIG.viralVideoPercentage * 100) + '% viral)' : '';

            return '<div class="tm-homepage">' +
                '<div style="font-size: 14px; color: var(--yt-spec-text-secondary); margin-bottom: 20px;">' +
                regularCount + ' subscription videos + ' + viralCount + ' viral videos' + refreshIndicator +
                '</div>' +
                '<div class="tm-video-grid">' +
                videoCards +
                '</div>' +
                '<div style="text-align: center; margin-top: 30px;">' +
                '<button id="tmLoadMoreBtn" class="tm-load-more-btn">Load more videos</button>' +
                '</div>' +
                '</div>';
        }

        shuffleArray(array) {
            const shuffled = array.slice();
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const temp = shuffled[i];
                shuffled[i] = shuffled[j];
                shuffled[j] = temp;
            }
            return shuffled;
        }

        attachVideoClickHandlers() {
            document.querySelectorAll('.tm-video-card').forEach(card => {
                card.addEventListener('click', () => {
                    const videoId = card.dataset.videoId;
                    if (videoId) {
                        window.location.href = '/watch?v=' + videoId;
                    }
                });
            });
        }

        attachLoadMoreHandler() {
            const loadMoreBtn = document.getElementById('tmLoadMoreBtn');
            if (loadMoreBtn) {
                loadMoreBtn.addEventListener('click', () => {
                    this.homepageLoadedCount += CONFIG.homepageLoadMoreSize;

                    const container = document.querySelector('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer');
                    if (container) {
                        const videos = this.videoCache.get('subscription_videos');
                        if (videos) {
                            const homepageHTML = this.createHomepageHTML(videos);
                            container.innerHTML = homepageHTML;
                            this.attachVideoClickHandlers();
                            this.attachLoadMoreHandler();
                        }
                    }
                });
            }
        }

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
            this.log('Enhancing video page...');

            // Only hide specific YouTube elements, not all content
            const elementsToHide = [
                'ytd-watch-next-secondary-results-renderer',
                'ytd-compact-autoplay-renderer'
            ];

            elementsToHide.forEach(selector => {
                const elements = sidebar.querySelectorAll(selector);
                elements.forEach(el => {
                    if (el && typeof el === 'object' && el.style) {
                        el.style.display = 'none';
                    }
                });
            });

            const currentChannelId = this.getCurrentChannelId();
            const currentVideoTitle = this.getCurrentVideoTitle();
            const currentChannelName = this.getCurrentChannelName();

            this.log('Current video context:', {
                channelId: currentChannelId,
                channelName: currentChannelName,
                videoTitle: currentVideoTitle
            });

            try {
                let videos = this.videoCache.get('subscription_videos');
                if (!videos || videos.length === 0) {
                    this.log('Loading subscription videos for watch next...');
                    videos = await this.loadVideosFromSubscriptions();
                }

                // Get more videos from current channel if we have channel ID
                let freshVideos = [];
                if (currentChannelId) {
                    try {
                        const endDate = new Date(this.maxDate);
                        endDate.setHours(23, 59, 59, 999);

                        const startDate = new Date(endDate);
                        startDate.setMonth(startDate.getMonth() - 3); // 3 months back for stability

                        freshVideos = await this.apiManager.getChannelVideosForPage(currentChannelId, currentChannelName, endDate, startDate);
                        this.log('Loaded ' + freshVideos.length + ' fresh videos from current channel');
                    } catch (error) {
                        this.log('Failed to load fresh videos:', error);
                    }
                }

                // Get series matching videos
                let seriesVideos = [];
                if (currentVideoTitle && currentChannelName) {
                    try {
                        const enhancedQuery = this.createNextEpisodeQuery(currentVideoTitle, currentChannelName);
                        console.log('[TimeMachine] Enhanced series search query:', enhancedQuery);
                        seriesVideos = await this.apiManager.searchVideos(enhancedQuery, 10, this.maxDate);
                        this.log('Loaded ' + seriesVideos.length + ' series matching videos');
                    } catch (error) {
                        this.log('Failed to load series videos:', error);
                    }
                }

                if (videos.length > 0) {
                    const recommendations = await this.recommendationEngine.generateEnhancedRecommendations(
                        currentChannelId,
                        currentVideoTitle,
                        videos,
                        this.maxDate,
                        freshVideos,
                        seriesVideos
                    );

                    this.log('Generated ' + recommendations.length + ' total recommendations');
                    this.createWatchNextSection(sidebar, recommendations);
                } else {
                    this.log('No videos available for recommendations');
                    // Create empty watch next section
                    this.createWatchNextSection(sidebar, []);
                }
            } catch (error) {
                this.log('Video page enhancement failed:', error);
                // Create fallback watch next section
                this.createWatchNextSection(sidebar, []);
            }
        }

        getCurrentChannelName() {
            const channelElement = document.querySelector('ytd-video-owner-renderer #channel-name a, #owner-name a');
            return channelElement ? channelElement.textContent.trim() : '';
        }

        getCurrentVideoTitle() {
            const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer, h1.ytd-watch-metadata');
            return titleElement ? titleElement.textContent.trim() : '';
        }

        getCurrentChannelId() {
            const channelLink = document.querySelector('ytd-video-owner-renderer a, #owner-name a');
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

        createWatchNextSection(secondary, recommendations) {
            // Remove any existing time machine sections first
            const existingSections = secondary.querySelectorAll('.tm-video-page-section');
            existingSections.forEach(section => {
                if (section && section.parentNode) {
                    section.parentNode.removeChild(section);
                }
            });

            const videoPageHTML = this.createVideoPageHTML(recommendations);
            const tmSection = document.createElement('div');
            tmSection.innerHTML = videoPageHTML;

            // Insert at the top of secondary content
            if (secondary.firstChild) {
                secondary.insertBefore(tmSection, secondary.firstChild);
            } else {
                secondary.appendChild(tmSection);
            }

            this.attachVideoPageClickHandlers();
        }

        createNextEpisodeQuery(videoTitle, channelName) {
            // Create a query that looks for the next episode by incrementing numbers
            let enhancedTitle = videoTitle;

            // Find numbers in the title and increment them
            enhancedTitle = enhancedTitle.replace(/(d+)/g, (match, number) => {
                const nextNumber = parseInt(number) + 1;
                console.log('[TimeMachine] Incrementing episode number: ' + number + ' -> ' + nextNumber);
                return nextNumber.toString();
            });

            // Also search for the original title to get related videos
            const queries = [
                enhancedTitle + ' ' + channelName,  // Next episode search
                videoTitle + ' ' + channelName       // Original series search
            ];

            // Return the enhanced query (we'll use the first one for now)
            return queries[0];
        }

        createVideoPageHTML(videos) {
            if (!videos || videos.length === 0) {
                return '<div class="tm-video-page-section">' +
                    '<h3 class="tm-video-page-title">Watch next</h3>' +
                    '<div class="tm-loading">' +
                    '<div>Loading recommendations from ' + this.maxDate.toLocaleDateString() + '...</div>' +
                    '</div>' +
                    '</div>';
            }

            const videoCards = videos.slice(0, Math.min(CONFIG.watchNextVideosCount, videos.length)).map(video =>
                '<div class="tm-video-page-card" data-video-id="' + video.id + '">' +
                '<img class="tm-video-page-thumbnail" src="' + video.thumbnail + '" alt="' + video.title + '" loading="lazy">' +
                '<div class="tm-video-page-info">' +
                '<div class="tm-video-page-video-title">' + video.title + '</div>' +
                '<div class="tm-video-page-channel">' + video.channel + '</div>' +
                '<div class="tm-video-page-meta">' +
                '<span class="tm-video-views">' + video.viewCount + ' views</span>' +
                '<span>•</span>' +
                '<span class="tm-video-date">' + video.relativeDate + '</span>' +
                '</div>' +
                '</div>' +
                '</div>'
            ).join('');

            return '<div class="tm-video-page-section">' +
                '<h3 class="tm-video-page-title">Watch next</h3>' +
                '<div class="tm-video-page-grid">' +
                videoCards +
                '</div>' +
                '</div>';
        }

        attachVideoPageClickHandlers() {
            document.querySelectorAll('.tm-video-page-card').forEach(card => {
                card.addEventListener('click', () => {
                    const videoId = card.dataset.videoId;
                    if (videoId) {
                        window.location.href = '/watch?v=' + videoId;
                    }
                });
            });
        }

        log() {
            if (CONFIG.debugMode) {
                console.log.apply(console, ['[Time Machine]'].concat(Array.prototype.slice.call(arguments)));
            }
        }
    }

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
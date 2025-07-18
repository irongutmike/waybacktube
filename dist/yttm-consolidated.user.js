// ==UserScript==
// @name         YouTube Time Machine - Consolidated
// @namespace    http://tampermonkey.net/
// @version      2.1.0
// @description  Travel back in time on YouTube - modular build
// @author       Time Traveler
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';
    
    console.log('[YouTube Time Machine] Starting consolidated userscript...');

// ===== MODULE CONTENTS =====

// ===== CONFIG.JS =====
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

// ===== API-MANAGER.JS =====
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

// ===== SUBSCRIPTION-MANAGER.JS =====
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

// ===== RECOMMENDATION-ENGINE.JS =====
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

// ===== SHORTS-BLOCKER.JS =====
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
        // Only nuke if we're actually on the homepage
        if (window.location.pathname !== '/') {
            return;
        }
        
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

// ===== DATE-MODIFIER.JS =====
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

// ===== SEARCH-INTERCEPTOR.JS =====
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

// ===== UI-MANAGER.JS =====
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
            /* Only apply to actual homepage */
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
            ytd-browse[page-subtype="home"] ytd-thumbnail:not(.tm-approved) {
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
            
            /* Separate rule for video links to avoid affecting search results */
            ytd-browse[page-subtype="home"] [href*="/watch?v="]:not(.tm-approved):not([data-context-menu-target]) {
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

// ===== MAIN CLASS =====
// Main YouTube Time Machine Class
class YouTubeTimeMachine {
    constructor() {
        this.settings = {
            active: GM_getValue('ytTimeMachineActive', true),
            date: GM_getValue('ytTimeMachineDate', '2011-01-01')
        };
        
        this.maxDate = new Date(this.settings.date);
        this.stats = {
            processed: 0,
            filtered: 0,
            apiCalls: 0,
            cacheHits: 0
        };
        
        this.isInitialized = false;
        this.currentPage = '';
        this.pageObserver = null;
        this.contentObserver = null;
        this.lastUrl = '';
        
        // Initialize components
        this.apiManager = new APIManager();
        this.subscriptionManager = new SubscriptionManager();
        this.recommendationEngine = new RecommendationEngine(this.apiManager);
        this.shortsBlocker = new ShortsBlocker();
        this.dateModifier = new DateModifier(this.maxDate);
        this.searchInterceptor = new SearchInterceptor(this.maxDate, this.shortsBlocker);
        this.uiManager = new UIManager(this);
        
        this.log('YouTube Time Machine initialized');
    }

    async init() {
        if (this.isInitialized) return;
        
        this.log('Initializing Time Machine...');
        
        // Wait for page to be ready
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }
        
        // Set up UI and styles
        this.setupUI();
        this.setupStyles();
        this.setupEventHandlers();
        
        // Set up page monitoring
        this.setupPageMonitoring();
        
        // Handle initial page
        this.handlePageChange();
        
        // Check for navigation from search results
        this.handleSearchNavigation();
        
        this.isInitialized = true;
        this.log('Time Machine fully initialized');
    }

    setupUI() {
        // Create toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'timeMachineToggle';
        toggleBtn.innerHTML = '⏰';
        toggleBtn.className = 'visible';
        toggleBtn.addEventListener('click', () => this.toggleUI());
        document.body.appendChild(toggleBtn);

        // Create main UI panel
        const uiPanel = document.createElement('div');
        uiPanel.id = 'timeMachineUI';
        uiPanel.className = 'hidden';
        document.body.appendChild(uiPanel);

        this.updateUI();
    }

    setupStyles() {
        const styleElement = document.createElement('style');
        styleElement.textContent = this.uiManager.getStyles() + this.shortsBlocker.getShortsBlockingCSS();
        document.head.appendChild(styleElement);
    }

    setupEventHandlers() {
        // Keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'T') {
                e.preventDefault();
                this.toggleUI();
            }
        });

        // UI event handlers
        document.addEventListener('click', (e) => {
            if (e.target.id === 'tmHideBtn') this.toggleUI();
            if (e.target.id === 'tmSetDate') this.setDate();
            if (e.target.id === 'tmAddApi') this.addApiKey();
            if (e.target.id === 'tmAddSub') this.addSubscription();
            if (e.target.id === 'tmLoadVideos') this.loadVideos();
            if (e.target.id === 'tmToggle') this.toggleActive();
            if (e.target.id === 'tmClearCache') this.clearCache();
            if (e.target.id === 'tmTestAll') this.testAllKeys();
            if (e.target.id === 'tmRefreshVideosBtn') this.refreshVideos();
        });
    }

    setupPageMonitoring() {
        // Monitor URL changes
        this.lastUrl = window.location.href;
        
        const checkUrlChange = () => {
            if (window.location.href !== this.lastUrl) {
                this.lastUrl = window.location.href;
                this.handlePageChange();
            }
        };

        // Check for URL changes periodically
        setInterval(checkUrlChange, 500);

        // Also listen for popstate events
        window.addEventListener('popstate', () => {
            setTimeout(() => this.handlePageChange(), 100);
        });

        // Monitor for content changes
        this.contentObserver = new MutationObserver(() => {
            if (this.settings.active) {
                this.processPage();
            }
        });

        this.contentObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    handlePageChange() {
        const url = window.location.href;
        const pathname = window.location.pathname;
        
        this.log('Page changed to:', pathname);
        
        if (pathname === '/') {
            this.currentPage = 'home';
            this.handleHomePage();
        } else if (pathname === '/results') {
            this.currentPage = 'search';
            this.handleSearchPage();
        } else if (pathname === '/watch') {
            this.currentPage = 'watch';
            this.handleWatchPage();
        } else if (pathname.includes('/channel/') || pathname.includes('/c/') || pathname.includes('/user/') || pathname.match(/\/@[\w-]+/)) {
            this.currentPage = 'channel';
            this.handleChannelPage();
        }
        
        // Always process the page if active
        if (this.settings.active) {
            setTimeout(() => this.processPage(), 100);
        }
    }

    handleSearchNavigation() {
        // Check if we navigated from search results
        const fromSearch = sessionStorage.getItem('tm-from-search');
        if (fromSearch === 'true' && window.location.pathname === '/watch') {
            this.log('Detected navigation from search results, reinitializing...');
            sessionStorage.removeItem('tm-from-search');
            
            // Force reinitialization of watch page
            setTimeout(() => {
                this.enhanceWatchPage();
            }, 500);
        }
    }

    handleHomePage() {
        this.log('Handling homepage');
        if (this.settings.active && window.location.pathname === '/') {
            // Only nuke if we're actually on the homepage
            this.shortsBlocker.nukeHomepage();
            
            // Set up auto-loading if enabled
            if (CONFIG.autoLoadOnHomepage) {
                setTimeout(() => {
                    this.loadHomepageVideos();
                }, CONFIG.autoLoadDelay);
            }
        }
    }

    handleSearchPage() {
        this.log('Handling search page');
        if (this.settings.active) {
            // Don't nuke search results - only set up interception
            this.searchInterceptor.setupSearchInterception();
            
            // Only block shorts in search results, not all content
            setTimeout(() => {
                this.shortsBlocker.blockShorts();
            }, 100);
        }
    }

    handleWatchPage() {
        this.log('Handling watch page');
        if (this.settings.active) {
            setTimeout(() => {
                this.enhanceWatchPage();
            }, 200);
        }
    }

    handleChannelPage() {
        this.log('Handling channel page');
        if (this.settings.active) {
            setTimeout(() => {
                this.enhanceChannelPage();
            }, 200);
        }
    }

    processPage() {
        if (!this.settings.active) return;
        
        // Block shorts and modern content
        this.shortsBlocker.blockShorts();
        
        // Update dates
        this.dateModifier.updateDates();
        
        // Update stats
        this.stats.processed++;
    }

    async loadHomepageVideos() {
        this.log('Loading homepage videos...');
        // Implementation would go here
    }

    async enhanceWatchPage() {
        this.log('Enhancing watch page...');
        
        // Wait for page elements to load
        await this.waitForElement('#secondary');
        
        const currentVideoTitle = this.getCurrentVideoTitle();
        const currentChannelId = this.getCurrentChannelId();
        
        this.log('Current video:', currentVideoTitle);
        this.log('Current channel:', currentChannelId);
        
        if (!currentVideoTitle) {
            this.log('Could not determine current video title, retrying...');
            setTimeout(() => this.enhanceWatchPage(), 1000);
            return;
        }
        
        // Get all available videos
        const allVideos = this.getAllCachedVideos();
        
        // Get fresh videos from current channel
        let freshVideos = [];
        if (currentChannelId) {
            try {
                freshVideos = await this.apiManager.getChannelVideos(currentChannelId, '', this.maxDate);
                this.log('Fetched fresh videos:', freshVideos.length);
            } catch (error) {
                this.log('Failed to fetch fresh videos:', error);
            }
        }
        
        // Generate recommendations
        const recommendations = await this.recommendationEngine.generateEnhancedRecommendations(
            currentChannelId,
            currentVideoTitle,
            allVideos,
            this.maxDate,
            freshVideos
        );
        
        this.log('Generated recommendations:', recommendations.length);
        
        // Display recommendations
        this.displayWatchPageRecommendations(recommendations);
    }

    async enhanceChannelPage() {
        this.log('Enhancing channel page...');
        
        const channelId = this.getCurrentChannelId();
        const channelName = this.getCurrentChannelName();
        
        if (!channelId && !channelName) {
            this.log('Could not determine channel info');
            return;
        }
        
        // Hide existing channel content
        this.shortsBlocker.blockChannelPages();
        
        // Load and display channel videos
        this.displayChannelVideos(channelId, channelName);
    }

    getCurrentVideoTitle() {
        const selectors = [
            'h1.ytd-watch-metadata yt-formatted-string',
            'h1.ytd-video-primary-info-renderer',
            'h1 .ytd-video-primary-info-renderer',
            '.ytd-watch-metadata h1',
            '#title h1'
        ];
        
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent) {
                return element.textContent.trim();
            }
        }
        
        return null;
    }

    getCurrentChannelId() {
        const channelLink = document.querySelector('a.yt-simple-endpoint[href*="/channel/"]');
        if (channelLink) {
            const match = channelLink.href.match(/\/channel\/([^/?]+)/);
            return match ? match[1] : null;
        }
        return null;
    }

    getCurrentChannelName() {
        const selectors = [
            '#owner-name a',
            '.ytd-channel-name a',
            '#channel-name .ytd-channel-name',
            '.ytd-video-owner-renderer a'
        ];
        
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent) {
                return element.textContent.trim();
            }
        }
        
        return null;
    }

    async waitForElement(selector, timeout = 5000) {
        return new Promise((resolve) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }
            
            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    }

    displayWatchPageRecommendations(videos) {
        if (!videos || videos.length === 0) {
            this.log('No recommendations to display');
            return;
        }
        
        // Remove existing Time Machine recommendations
        const existingSection = document.querySelector('.tm-video-page-section');
        if (existingSection) {
            existingSection.remove();
        }
        
        // Find the secondary column
        const secondary = document.querySelector('#secondary');
        if (!secondary) {
            this.log('Could not find secondary column');
            return;
        }
        
        // Create recommendations section
        const section = document.createElement('div');
        section.className = 'tm-video-page-section';
        section.innerHTML = `
            <div class="tm-video-page-title">Time Machine Recommendations</div>
            <div class="tm-video-page-grid">
                ${videos.map(video => `
                    <div class="tm-video-page-card" onclick="window.location.href='/watch?v=${video.id}'">
                        <img class="tm-video-page-thumbnail" src="${video.thumbnail}" alt="${video.title}">
                        <div class="tm-video-page-info">
                            <div class="tm-video-page-video-title">${video.title}</div>
                            <div class="tm-video-page-channel">${video.channel}</div>
                            <div class="tm-video-page-meta">
                                <span>${video.viewCount} views</span>
                                <span>${video.relativeDate}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        // Insert at the top of secondary column
        secondary.insertBefore(section, secondary.firstChild);
        
        this.log('Displayed', videos.length, 'watch page recommendations');
    }

    displayChannelVideos(channelId, channelName) {
        this.log('Displaying channel videos for:', channelName);
        // Implementation would go here
    }

    getAllCachedVideos() {
        // Collect all cached videos from various sources
        const allVideos = [];
        
        // Get videos from cache
        const cacheKeys = GM_listValues();
        cacheKeys.forEach(key => {
            if (key.startsWith('cache_channel_videos_') || key.startsWith('cache_viral_videos_')) {
                try {
                    const cached = GM_getValue(key);
                    const data = JSON.parse(cached);
                    if (data.value && Array.isArray(data.value)) {
                        allVideos.push(...data.value);
                    }
                } catch (e) {
                    // Ignore invalid cache entries
                }
            }
        });
        
        return allVideos;
    }

    // UI Methods
    toggleUI() {
        const ui = document.getElementById('timeMachineUI');
        const toggle = document.getElementById('timeMachineToggle');
        
        if (ui.classList.contains('hidden')) {
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
        }
    }

    setDate() {
        const input = document.getElementById('tmDateInput');
        if (input && input.value) {
            this.settings.date = input.value;
            this.maxDate = new Date(input.value);
            this.dateModifier.setMaxDate(this.maxDate);
            this.searchInterceptor.setMaxDate(this.maxDate);
            GM_setValue('ytTimeMachineDate', this.settings.date);
            this.updateUI();
            this.log('Date set to:', this.settings.date);
        }
    }

    addApiKey() {
        const input = document.getElementById('tmApiInput');
        if (input && input.value.trim()) {
            if (this.apiManager.addKey(input.value.trim())) {
                input.value = '';
                this.updateUI();
            } else {
                alert('Invalid or duplicate API key');
            }
        }
    }

    addSubscription() {
        const input = document.getElementById('tmSubInput');
        if (input && input.value.trim()) {
            if (this.subscriptionManager.addSubscription(input.value.trim())) {
                input.value = '';
                this.updateUI();
            } else {
                alert('Subscription already exists');
            }
        }
    }

    removeSubscription(index) {
        if (this.subscriptionManager.removeSubscription(index)) {
            this.updateUI();
        }
    }

    toggleActive() {
        this.settings.active = !this.settings.active;
        GM_setValue('ytTimeMachineActive', this.settings.active);
        this.updateUI();
        
        if (this.settings.active) {
            this.handlePageChange();
        } else {
            this.shortsBlocker.restoreBlockedContent();
            this.dateModifier.restoreOriginalDates();
        }
    }

    clearCache() {
        this.apiManager.clearCache();
        this.updateUI();
        alert('Cache cleared');
    }

    async testAllKeys() {
        const btn = document.getElementById('tmTestAll');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Testing...';
        }
        
        try {
            const results = await this.apiManager.testAllKeys();
            alert('API Key Test Results:\n\n' + results.join('\n'));
        } catch (error) {
            alert('Test failed: ' + error.message);
        }
        
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Test All Keys';
        }
    }

    async loadVideos() {
        this.log('Loading videos...');
        // Implementation would go here
    }

    async refreshVideos() {
        this.log('Refreshing videos...');
        // Implementation would go here
    }

    log() {
        if (CONFIG.debugMode) {
            console.log.apply(console, ['[YouTube Time Machine]'].concat(Array.prototype.slice.call(arguments)));
        }
    }
}

// ===== INITIALIZATION =====
// Initialize the Time Machine
let timeMachine;

function initializeTimeMachine() {
    if (timeMachine) return;
    
    timeMachine = new YouTubeTimeMachine();
    window.timeMachine = timeMachine; // Make globally accessible
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            timeMachine.init();
        });
    } else {
        timeMachine.init();
    }
}

// Start initialization
initializeTimeMachine();

})();
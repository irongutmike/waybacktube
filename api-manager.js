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
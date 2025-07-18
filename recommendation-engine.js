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
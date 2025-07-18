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
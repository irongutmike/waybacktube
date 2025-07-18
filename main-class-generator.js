class MainClassGenerator {
    static generate() {
        return `
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
            } else if (pathname.includes('/channel/') || pathname.includes('/c/') || pathname.includes('/user/') || pathname.match(/\\/@[\\w-]+/)) {
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
            if (this.settings.active) {
                // Aggressively nuke homepage content
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
                this.searchInterceptor.setupSearchInterception();
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
                const match = channelLink.href.match(/\\/channel\\/([^/?]+)/);
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
            section.innerHTML = \`
                <div class="tm-video-page-title">Time Machine Recommendations</div>
                <div class="tm-video-page-grid">
                    \${videos.map(video => \`
                        <div class="tm-video-page-card" onclick="window.location.href='/watch?v=\${video.id}'">
                            <img class="tm-video-page-thumbnail" src="\${video.thumbnail}" alt="\${video.title}">
                            <div class="tm-video-page-info">
                                <div class="tm-video-page-video-title">\${video.title}</div>
                                <div class="tm-video-page-channel">\${video.channel}</div>
                                <div class="tm-video-page-meta">
                                    <span>\${video.viewCount} views</span>
                                    <span>\${video.relativeDate}</span>
                                </div>
                            </div>
                        </div>
                    \`).join('')}
                </div>
            \`;
            
            // Insert at the top of secondary column
            secondary.insertBefore(section, secondary.firstChild);
            
            this.log('Displayed', videos.length, 'watch page recommendations');
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
                alert('API Key Test Results:\\n\\n' + results.join('\\n'));
            } catch (error) {
                alert('Test failed: ' + error.message);
            }
            
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Test All Keys';
            }
        }

        async loadVideos() {
            // Implementation for loading videos
            this.log('Loading videos...');
        }

        async refreshVideos() {
            // Implementation for refreshing videos
            this.log('Refreshing videos...');
        }

        log() {
            if (CONFIG.debugMode) {
                console.log.apply(console, ['[YouTube Time Machine]'].concat(Array.prototype.slice.call(arguments)));
            }
        }
    }`;
    }

    static generateInitialization() {
        return `
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
    initializeTimeMachine();`;
    }
}

module.exports = MainClassGenerator;
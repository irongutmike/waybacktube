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
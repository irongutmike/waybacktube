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
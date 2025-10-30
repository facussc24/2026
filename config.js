/**
 * @fileoverview Application Configuration and Logger
 * Production-ready configuration management with feature flags
 * @version 2.0.0
 */

/**
 * Application configuration
 * @const {Object}
 */
const APP_CONFIG = {
    // Environment
    env: 'production', // 'development' | 'staging' | 'production'
    version: '2.0.0',
    buildDate: '2025-10-30',

    // Feature flags
    features: {
        indexedDB: true,           // Use IndexedDB for storage
        serviceWorker: true,        // Enable PWA features
        offlineMode: true,          // Support offline functionality
        backgroundSync: true,       // Background data synchronization
        pushNotifications: false,   // Push notifications (future)
        analytics: false,           // Analytics tracking (future)
        lazyLoading: true,          // Lazy load modules
        performanceMonitoring: true // Performance tracking
    },

    // Storage settings
    storage: {
        namespace: 'gestion2026',
        version: 1,
        quotaWarningMB: 4.5,        // Warn at 4.5MB (90% of 5MB)
        autoCleanup: true,           // Auto cleanup old data
        maxActivityLogs: 100         // Keep last 100 activity logs
    },

    // Performance settings
    performance: {
        debounceDelay: 300,          // Search debounce (ms)
        toastDuration: 4000,         // Toast notification duration (ms)
        animationDuration: 300,      // Standard animation duration (ms)
        lazyLoadDelay: 100,          // Delay before lazy loading (ms)
        chartRefreshRate: 1000       // Dashboard chart refresh (ms)
    },

    // UI settings
    ui: {
        defaultTheme: 'light',       // 'light' | 'dark' (future)
        defaultView: 'list',         // 'list' | 'kanban'
        tasksPerPage: 50,            // Pagination limit
        compactMode: false           // Compact UI mode (future)
    },

    // Debug settings
    debug: {
        enabled: false,              // Enable debug mode
        verbose: false,              // Verbose logging
        showPerformance: false,      // Show performance metrics
        simulateOffline: false       // Simulate offline mode
    },

    // API settings (for future backend integration)
    api: {
        baseURL: '',                 // Backend API URL
        timeout: 30000,              // Request timeout (ms)
        retries: 3,                  // Retry attempts
        retryDelay: 1000            // Delay between retries (ms)
    }
};

/**
 * Logger class with log levels and conditional output
 * @class
 */
class Logger {
    /**
     * @param {string} name - Logger name
     */
    constructor(name = 'App') {
        this.name = name;
        this.levels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3,
            NONE: 4
        };
        
        // Set current level based on environment
        this.currentLevel = this._getLogLevel();
    }

    /**
     * Get log level based on environment
     * @private
     * @returns {number}
     */
    _getLogLevel() {
        if (APP_CONFIG.env === 'production' && !APP_CONFIG.debug.enabled) {
            return this.levels.ERROR; // Only errors in production
        }
        if (APP_CONFIG.env === 'staging') {
            return this.levels.WARN;
        }
        return this.levels.DEBUG; // All logs in development
    }

    /**
     * Format log message
     * @private
     * @param {string} level
     * @param {Array} args
     * @returns {Array}
     */
    _format(level, args) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${this.name}] [${level}]`;
        return [prefix, ...args];
    }

    /**
     * Check if log level should be output
     * @private
     * @param {number} level
     * @returns {boolean}
     */
    _shouldLog(level) {
        return level >= this.currentLevel;
    }

    /**
     * Debug log
     * @param {...*} args
     */
    debug(...args) {
        if (this._shouldLog(this.levels.DEBUG)) {
            console.debug(...this._format('DEBUG', args));
        }
    }

    /**
     * Info log
     * @param {...*} args
     */
    info(...args) {
        if (this._shouldLog(this.levels.INFO)) {
            console.info(...this._format('INFO', args));
        }
    }

    /**
     * Warning log
     * @param {...*} args
     */
    warn(...args) {
        if (this._shouldLog(this.levels.WARN)) {
            console.warn(...this._format('WARN', args));
        }
    }

    /**
     * Error log
     * @param {...*} args
     */
    error(...args) {
        if (this._shouldLog(this.levels.ERROR)) {
            console.error(...this._format('ERROR', args));
            
            // In production, could send to error reporting service
            if (APP_CONFIG.env === 'production' && typeof this._reportError === 'function') {
                this._reportError(args);
            }
        }
    }

    /**
     * Performance measurement
     * @param {string} label
     * @param {Function} fn
     * @returns {*}
     */
    async measure(label, fn) {
        if (!APP_CONFIG.features.performanceMonitoring) {
            return await fn();
        }

        const start = performance.now();
        const markStart = `${label}-start`;
        const markEnd = `${label}-end`;
        
        performance.mark(markStart);
        
        try {
            const result = await fn();
            performance.mark(markEnd);
            performance.measure(label, markStart, markEnd);
            
            const duration = performance.now() - start;
            
            if (APP_CONFIG.debug.showPerformance) {
                this.debug(`${label} took ${duration.toFixed(2)}ms`);
            }
            
            // Clean up marks
            performance.clearMarks(markStart);
            performance.clearMarks(markEnd);
            performance.clearMeasures(label);
            
            return result;
        } catch (error) {
            performance.mark(markEnd);
            this.error(`${label} failed:`, error);
            throw error;
        }
    }

    /**
     * Report error to external service (placeholder)
     * @private
     * @param {Array} args
     */
    _reportError(args) {
        // Future integration with Sentry, LogRocket, etc.
        // Example:
        // Sentry.captureException(new Error(args.join(' ')));
    }
}

/**
 * Feature flag checker
 * @param {string} featureName
 * @returns {boolean}
 */
function isFeatureEnabled(featureName) {
    return APP_CONFIG.features[featureName] === true;
}

/**
 * Get configuration value
 * @param {string} path - Dot-notation path (e.g., 'storage.maxActivityLogs')
 * @param {*} defaultValue - Default value if not found
 * @returns {*}
 */
function getConfig(path, defaultValue = undefined) {
    const parts = path.split('.');
    let current = APP_CONFIG;
    
    for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
            current = current[part];
        } else {
            return defaultValue;
        }
    }
    
    return current;
}

/**
 * Update configuration (for runtime changes)
 * @param {string} path - Dot-notation path
 * @param {*} value - New value
 */
function setConfig(path, value) {
    const parts = path.split('.');
    const lastPart = parts.pop();
    let current = APP_CONFIG;
    
    for (const part of parts) {
        if (!(part in current)) {
            current[part] = {};
        }
        current = current[part];
    }
    
    current[lastPart] = value;
}

// Global logger instance
const logger = new Logger('Gestión2026');

// Export for module usage (if using modules)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        APP_CONFIG,
        Logger,
        logger,
        isFeatureEnabled,
        getConfig,
        setConfig
    };
}

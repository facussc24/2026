/**
 * @fileoverview Advanced Storage Layer - IndexedDB + localStorage fallback
 * Provides scalable, offline-first storage with automatic migration
 * @version 2.0.0
 */

/**
 * Storage configuration
 * @const {Object}
 */
const STORAGE_CONFIG = {
    dbName: 'GestionDB',
    dbVersion: 1,
    stores: {
        tasks: 'tasks',
        documents: 'documents',
        timesheets: 'timesheets',
        losses: 'losses',
        activity: 'activity'
    },
    quotaWarningThreshold: 0.9, // 90% of quota
    migrationBatchSize: 50
};

/**
 * Advanced Storage Manager with IndexedDB + localStorage fallback
 * @class
 */
class StorageManager {
    constructor() {
        this.db = null;
        this.useIndexedDB = true;
        this.isOnline = navigator.onLine;
        this.pendingSyncs = [];
        
        // Setup online/offline listeners
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.syncPendingChanges();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
        });
    }

    /**
     * Initialize storage system
     * @returns {Promise<boolean>} Success status
     */
    async init() {
        try {
            // Try IndexedDB first
            await this.initIndexedDB();
            this.useIndexedDB = true;
            
            // Migrate from localStorage if needed
            await this.migrateFromLocalStorage();
            
            return true;
        } catch (error) {
            console.warn('IndexedDB init failed, falling back to localStorage:', error);
            this.useIndexedDB = false;
            return false;
        }
    }

    /**
     * Initialize IndexedDB database
     * @private
     * @returns {Promise<IDBDatabase>}
     */
    initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(STORAGE_CONFIG.dbName, STORAGE_CONFIG.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object stores if they don't exist
                Object.values(STORAGE_CONFIG.stores).forEach(storeName => {
                    if (!db.objectStoreNames.contains(storeName)) {
                        const store = db.createObjectStore(storeName, { keyPath: 'id' });
                        
                        // Add indexes for common queries
                        if (storeName === 'tasks') {
                            store.createIndex('completed', 'completed', { unique: false });
                            store.createIndex('assignee', 'assignee', { unique: false });
                            store.createIndex('priority', 'priority', { unique: false });
                            store.createIndex('dueDate', 'dueDate', { unique: false });
                        } else if (storeName === 'timesheets') {
                            store.createIndex('date', 'date', { unique: false });
                            store.createIndex('line', 'line', { unique: false });
                        }
                    }
                });
            };
        });
    }

    /**
     * Migrate data from localStorage to IndexedDB
     * @private
     * @returns {Promise<void>}
     */
    async migrateFromLocalStorage() {
        const migrations = [
            { key: 'tasks', store: STORAGE_CONFIG.stores.tasks },
            { key: 'documents', store: STORAGE_CONFIG.stores.documents },
            { key: 'timesheets', store: STORAGE_CONFIG.stores.timesheets },
            { key: 'activity', store: STORAGE_CONFIG.stores.activity }
        ];

        for (const { key, store } of migrations) {
            try {
                const data = localStorage.getItem(key);
                if (data) {
                    const items = JSON.parse(data);
                    if (Array.isArray(items) && items.length > 0) {
                        // Migrate in batches to avoid blocking
                        await this.batchMigrate(store, items);
                        
                        // Mark as migrated
                        localStorage.setItem(`${key}_migrated`, 'true');
                    }
                }
            } catch (error) {
                console.warn(`Migration failed for ${key}:`, error);
            }
        }
    }

    /**
     * Batch migrate items to IndexedDB
     * @private
     * @param {string} storeName
     * @param {Array} items
     * @returns {Promise<void>}
     */
    async batchMigrate(storeName, items) {
        const batchSize = STORAGE_CONFIG.migrationBatchSize;
        
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);

            batch.forEach(item => store.put(item));

            await new Promise((resolve, reject) => {
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
            });

            // Yield to browser for UI responsiveness
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    /**
     * Get all items from a store
     * @param {string} storeName
     * @returns {Promise<Array>}
     */
    async getAll(storeName) {
        if (!this.useIndexedDB) {
            return this.getFromLocalStorage(storeName);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => {
                // Fallback to localStorage on error
                resolve(this.getFromLocalStorage(storeName));
            };
        });
    }

    /**
     * Get single item by ID
     * @param {string} storeName
     * @param {string|number} id
     * @returns {Promise<Object|null>}
     */
    async getById(storeName, id) {
        if (!this.useIndexedDB) {
            const items = this.getFromLocalStorage(storeName);
            return items.find(item => item.id === id) || null;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => resolve(null);
        });
    }

    /**
     * Save item to store
     * @param {string} storeName
     * @param {Object} item
     * @returns {Promise<boolean>}
     */
    async save(storeName, item) {
        if (!this.useIndexedDB) {
            return this.saveToLocalStorage(storeName, item);
        }

        try {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            store.put(item);

            await new Promise((resolve, reject) => {
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
            });

            // Also save to localStorage as backup
            this.saveToLocalStorage(storeName, item, true);

            return true;
        } catch (error) {
            console.error('IndexedDB save failed:', error);
            return this.saveToLocalStorage(storeName, item);
        }
    }

    /**
     * Delete item from store
     * @param {string} storeName
     * @param {string|number} id
     * @returns {Promise<boolean>}
     */
    async delete(storeName, id) {
        if (!this.useIndexedDB) {
            return this.deleteFromLocalStorage(storeName, id);
        }

        try {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            store.delete(id);

            await new Promise((resolve, reject) => {
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
            });

            // Also delete from localStorage backup
            this.deleteFromLocalStorage(storeName, id, true);

            return true;
        } catch (error) {
            console.error('IndexedDB delete failed:', error);
            return this.deleteFromLocalStorage(storeName, id);
        }
    }

    /**
     * Query items by index
     * @param {string} storeName
     * @param {string} indexName
     * @param {*} value
     * @returns {Promise<Array>}
     */
    async queryByIndex(storeName, indexName, value) {
        if (!this.useIndexedDB) {
            const items = this.getFromLocalStorage(storeName);
            return items.filter(item => item[indexName] === value);
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => {
                const items = this.getFromLocalStorage(storeName);
                resolve(items.filter(item => item[indexName] === value));
            };
        });
    }

    /**
     * Get items from localStorage
     * @private
     * @param {string} storeName
     * @returns {Array}
     */
    getFromLocalStorage(storeName) {
        try {
            const data = localStorage.getItem(storeName);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('localStorage read error:', error);
            return [];
        }
    }

    /**
     * Save item to localStorage
     * @private
     * @param {string} storeName
     * @param {Object} item
     * @param {boolean} isBackup
     * @returns {boolean}
     */
    saveToLocalStorage(storeName, item, isBackup = false) {
        try {
            const items = this.getFromLocalStorage(storeName);
            const index = items.findIndex(i => i.id === item.id);
            
            if (index !== -1) {
                items[index] = item;
            } else {
                items.push(item);
            }

            localStorage.setItem(storeName, JSON.stringify(items));
            return true;
        } catch (error) {
            if (error.name === 'QuotaExceededError' && !isBackup) {
                // Try to free up space
                this.cleanupOldData();
                // Notify user
                if (typeof showToast === 'function') {
                    showToast('Advertencia', 'Espacio limitado. Considera eliminar datos antiguos.', 'warning');
                }
            }
            console.error('localStorage save error:', error);
            return false;
        }
    }

    /**
     * Delete item from localStorage
     * @private
     * @param {string} storeName
     * @param {string|number} id
     * @param {boolean} isBackup
     * @returns {boolean}
     */
    deleteFromLocalStorage(storeName, id, isBackup = false) {
        try {
            const items = this.getFromLocalStorage(storeName);
            const filtered = items.filter(item => item.id !== id);
            localStorage.setItem(storeName, JSON.stringify(filtered));
            return true;
        } catch (error) {
            console.error('localStorage delete error:', error);
            return false;
        }
    }

    /**
     * Cleanup old data to free space
     * @private
     */
    cleanupOldData() {
        // Remove old activity logs (keep last 50)
        try {
            const activity = this.getFromLocalStorage('activity');
            if (activity.length > 50) {
                const recent = activity.slice(-50);
                localStorage.setItem('activity', JSON.stringify(recent));
            }
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    }

    /**
     * Check storage quota usage
     * @returns {Promise<Object>}
     */
    async checkQuota() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            const usage = estimate.usage || 0;
            const quota = estimate.quota || 0;
            const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;

            return {
                usage,
                quota,
                percentUsed,
                available: quota - usage,
                warning: percentUsed > STORAGE_CONFIG.quotaWarningThreshold * 100
            };
        }

        return { usage: 0, quota: 0, percentUsed: 0, available: 0, warning: false };
    }

    /**
     * Add item to sync queue for offline support
     * @param {string} action
     * @param {string} storeName
     * @param {Object} data
     */
    queueSync(action, storeName, data) {
        if (!this.isOnline) {
            this.pendingSyncs.push({ action, storeName, data, timestamp: Date.now() });
            
            // Save pending syncs to localStorage
            try {
                localStorage.setItem('pendingSyncs', JSON.stringify(this.pendingSyncs));
            } catch (error) {
                console.error('Failed to save pending syncs:', error);
            }
        }
    }

    /**
     * Sync pending changes when online
     * @private
     * @returns {Promise<void>}
     */
    async syncPendingChanges() {
        if (this.pendingSyncs.length === 0) return;

        // Load from localStorage if needed
        try {
            const stored = localStorage.getItem('pendingSyncs');
            if (stored) {
                this.pendingSyncs = JSON.parse(stored);
            }
        } catch (error) {
            console.error('Failed to load pending syncs:', error);
        }

        const syncs = [...this.pendingSyncs];
        this.pendingSyncs = [];

        for (const sync of syncs) {
            try {
                if (sync.action === 'save') {
                    await this.save(sync.storeName, sync.data);
                } else if (sync.action === 'delete') {
                    await this.delete(sync.storeName, sync.data.id);
                }
            } catch (error) {
                console.error('Sync failed:', error);
                // Re-queue failed syncs
                this.pendingSyncs.push(sync);
            }
        }

        // Update localStorage
        try {
            if (this.pendingSyncs.length > 0) {
                localStorage.setItem('pendingSyncs', JSON.stringify(this.pendingSyncs));
            } else {
                localStorage.removeItem('pendingSyncs');
            }
        } catch (error) {
            console.error('Failed to update pending syncs:', error);
        }

        // Notify user if there were syncs
        if (syncs.length > 0 && typeof showToast === 'function') {
            showToast('Sincronizado', `${syncs.length} cambios sincronizados`, 'success');
        }
    }

    /**
     * Export all data for backup
     * @returns {Promise<Object>}
     */
    async exportData() {
        const data = {};
        
        for (const [key, storeName] of Object.entries(STORAGE_CONFIG.stores)) {
            data[key] = await this.getAll(storeName);
        }

        return data;
    }

    /**
     * Import data from backup
     * @param {Object} data
     * @returns {Promise<boolean>}
     */
    async importData(data) {
        try {
            for (const [key, items] of Object.entries(data)) {
                const storeName = STORAGE_CONFIG.stores[key];
                if (storeName && Array.isArray(items)) {
                    for (const item of items) {
                        await this.save(storeName, item);
                    }
                }
            }
            return true;
        } catch (error) {
            console.error('Import failed:', error);
            return false;
        }
    }
}

// Global storage instance
const storage = new StorageManager();

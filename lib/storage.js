/**
 * Memory storage management for per-character persistence
 * @module lib/storage
 */

/**
 * Generate a UUID v4
 * @returns {string} UUID string
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Memory storage manager for character-specific memories
 */
export class MemoryStorage {
    /**
     * Create a MemoryStorage instance
     * @param {string} extensionFolderPath - Path to extension folder
     */
    constructor(extensionFolderPath) {
        this.extensionFolderPath = extensionFolderPath;
        this.dataPath = `${extensionFolderPath}/data/memories`;
        this.cache = new Map(); // In-memory cache for quick access
    }

    /**
     * Get the file path for a character's memories
     * @param {string} characterId - Character identifier
     * @returns {string} File path
     */
    getFilePath(characterId) {
        // Sanitize character ID for use as filename
        const safeId = characterId.replace(/[^a-zA-Z0-9_-]/g, '_');
        return `${this.dataPath}/${safeId}.json`;
    }

    /**
     * Load memories for a character
     * @param {string} characterId - Character identifier
     * @param {string} characterName - Character display name
     * @returns {Promise<object>} Memory data object
     */
    async loadMemories(characterId, characterName = '') {
        // Check cache first
        if (this.cache.has(characterId)) {
            return this.cache.get(characterId);
        }

        const filePath = this.getFilePath(characterId);

        try {
            const response = await fetch(filePath);
            
            if (response.ok) {
                const data = await response.json();
                this.cache.set(characterId, data);
                return data;
            }
        } catch (error) {
            // File doesn't exist or error reading, create new
            console.log(`[VoyageAI Memory] Creating new memory file for ${characterId}`);
        }

        // Create new memory structure
        const newData = {
            character_id: characterId,
            character_name: characterName,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            memories: []
        };

        this.cache.set(characterId, newData);
        return newData;
    }

    /**
     * Save memories for a character
     * @param {string} characterId - Character identifier
     * @param {object} data - Memory data object
     * @returns {Promise<boolean>} Success status
     */
    async saveMemories(characterId, data) {
        const filePath = this.getFilePath(characterId);
        
        // Update timestamp
        data.updated_at = new Date().toISOString();
        
        // Update cache
        this.cache.set(characterId, data);

        try {
            // Use SillyTavern's file writing mechanism
            // This requires the extension to have server-side support
            // For now, we'll use localStorage as a fallback
            const storageKey = `voyageai_memory_${characterId}`;
            localStorage.setItem(storageKey, JSON.stringify(data));
            
            console.log(`[VoyageAI Memory] Saved ${data.memories.length} memories for ${characterId}`);
            return true;
        } catch (error) {
            console.error('[VoyageAI Memory] Save error:', error);
            return false;
        }
    }

    /**
     * Add a new memory
     * @param {string} characterId - Character identifier
     * @param {object} memory - Memory object to add
     * @returns {Promise<object>} The added memory with ID
     */
    async addMemory(characterId, memory) {
        const data = await this.loadMemories(characterId);
        
        const newMemory = {
            id: generateUUID(),
            timestamp: new Date().toISOString(),
            ...memory
        };

        data.memories.push(newMemory);
        await this.saveMemories(characterId, data);

        return newMemory;
    }

    /**
     * Get all memories for a character
     * @param {string} characterId - Character identifier
     * @returns {Promise<Array>} Array of memories
     */
    async getMemories(characterId) {
        const data = await this.loadMemories(characterId);
        return data.memories || [];
    }

    /**
     * Delete a specific memory
     * @param {string} characterId - Character identifier
     * @param {string} memoryId - Memory ID to delete
     * @returns {Promise<boolean>} Success status
     */
    async deleteMemory(characterId, memoryId) {
        const data = await this.loadMemories(characterId);
        
        const initialLength = data.memories.length;
        data.memories = data.memories.filter(m => m.id !== memoryId);
        
        if (data.memories.length < initialLength) {
            await this.saveMemories(characterId, data);
            return true;
        }
        
        return false;
    }

    /**
     * Clear all memories for a character
     * @param {string} characterId - Character identifier
     * @returns {Promise<boolean>} Success status
     */
    async clearMemories(characterId) {
        const data = await this.loadMemories(characterId);
        data.memories = [];
        await this.saveMemories(characterId, data);
        
        console.log(`[VoyageAI Memory] Cleared all memories for ${characterId}`);
        return true;
    }

    /**
     * Get memory statistics for a character
     * @param {string} characterId - Character identifier
     * @returns {Promise<object>} Statistics object
     */
    async getStats(characterId) {
        const data = await this.loadMemories(characterId);
        
        return {
            totalMemories: data.memories.length,
            characterName: data.character_name,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            oldestMemory: data.memories.length > 0 
                ? data.memories[0].timestamp 
                : null,
            newestMemory: data.memories.length > 0 
                ? data.memories[data.memories.length - 1].timestamp 
                : null
        };
    }

    /**
     * Export all memories to a downloadable JSON
     * @param {string} characterId - Character identifier
     * @returns {Promise<string>} JSON string
     */
    async exportMemories(characterId) {
        const data = await this.loadMemories(characterId);
        return JSON.stringify(data, null, 2);
    }

    /**
     * Import memories from JSON
     * @param {string} characterId - Character identifier
     * @param {string} jsonString - JSON string to import
     * @param {boolean} merge - Whether to merge with existing memories
     * @returns {Promise<number>} Number of imported memories
     */
    async importMemories(characterId, jsonString, merge = false) {
        try {
            const importData = JSON.parse(jsonString);
            
            if (!importData.memories || !Array.isArray(importData.memories)) {
                throw new Error('Invalid memory file format');
            }

            const currentData = await this.loadMemories(characterId);
            
            if (merge) {
                // Merge, avoiding duplicates by ID
                const existingIds = new Set(currentData.memories.map(m => m.id));
                const newMemories = importData.memories.filter(m => !existingIds.has(m.id));
                currentData.memories.push(...newMemories);
            } else {
                // Replace
                currentData.memories = importData.memories;
            }

            await this.saveMemories(characterId, currentData);
            
            return importData.memories.length;
        } catch (error) {
            console.error('[VoyageAI Memory] Import error:', error);
            throw error;
        }
    }

    /**
     * Clear the in-memory cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Invalidate cache for a specific character
     * @param {string} characterId - Character identifier
     */
    invalidateCache(characterId) {
        this.cache.delete(characterId);
    }
}

/**
 * Create a memory object
 * @param {string} originalMessage - The original message text
 * @param {string} summary - The summarized version
 * @param {number[]} embedding - The embedding vector
 * @param {object} metadata - Additional metadata
 * @returns {object} Memory object
 */
export function createMemory(originalMessage, summary, embedding, metadata = {}) {
    return {
        original_message: originalMessage,
        summary: summary,
        embedding: embedding,
        metadata: {
            role: metadata.role || 'unknown',
            chat_id: metadata.chatId || null,
            importance: metadata.importance || 0.5,
            ...metadata
        }
    };
}
/**
 * VoyageAI API client for generating embeddings
 * @module lib/voyageai
 */

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

/**
 * VoyageAI embedding client
 */
export class VoyageAIClient {
    /**
     * Create a VoyageAI client instance
     * @param {string} apiKey - VoyageAI API key
     * @param {string} model - Model name (default: voyage-4-large)
     */
    constructor(apiKey, model = 'voyage-4-large') {
        this.apiKey = apiKey;
        this.model = model;
    }

    /**
     * Generate embeddings for one or more texts
     * @param {string|string[]} input - Text or array of texts to embed
     * @param {string} inputType - Type of input: 'document' or 'query'
     * @returns {Promise<{embeddings: number[][], usage: {total_tokens: number}}>}
     */
    async embed(input, inputType = 'document') {
        if (!this.apiKey) {
            throw new Error('VoyageAI API key is not configured');
        }

        const texts = Array.isArray(input) ? input : [input];
        
        if (texts.length === 0) {
            return { embeddings: [], usage: { total_tokens: 0 } };
        }

        try {
            const response = await fetch(VOYAGE_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    input: texts,
                    model: this.model,
                    input_type: inputType
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    `VoyageAI API error: ${response.status} - ${errorData.error?.message || response.statusText}`
                );
            }

            const data = await response.json();
            
            // Extract embeddings in order
            const embeddings = data.data
                .sort((a, b) => a.index - b.index)
                .map(item => item.embedding);

            return {
                embeddings,
                usage: data.usage || { total_tokens: 0 }
            };
        } catch (error) {
            console.error('[VoyageAI Memory] Embedding error:', error);
            throw error;
        }
    }

    /**
     * Generate embedding for a single document (for storage)
     * @param {string} text - Text to embed
     * @returns {Promise<number[]>} Embedding vector
     */
    async embedDocument(text) {
        const result = await this.embed(text, 'document');
        return result.embeddings[0] || [];
    }

    /**
     * Generate embedding for a query (for retrieval)
     * @param {string} text - Query text to embed
     * @returns {Promise<number[]>} Embedding vector
     */
    async embedQuery(text) {
        const result = await this.embed(text, 'query');
        return result.embeddings[0] || [];
    }

    /**
     * Batch embed multiple documents
     * @param {string[]} texts - Array of texts to embed
     * @returns {Promise<number[][]>} Array of embedding vectors
     */
    async embedDocuments(texts) {
        if (texts.length === 0) {
            return [];
        }

        // VoyageAI supports batch requests, but we'll chunk for safety
        const BATCH_SIZE = 128;
        const allEmbeddings = [];

        for (let i = 0; i < texts.length; i += BATCH_SIZE) {
            const batch = texts.slice(i, i + BATCH_SIZE);
            const result = await this.embed(batch, 'document');
            allEmbeddings.push(...result.embeddings);
        }

        return allEmbeddings;
    }

    /**
     * Test the API connection
     * @returns {Promise<boolean>} True if connection successful
     */
    async testConnection() {
        try {
            await this.embed('test', 'document');
            return true;
        } catch (error) {
            console.error('[VoyageAI Memory] Connection test failed:', error);
            return false;
        }
    }

    /**
     * Update the API key
     * @param {string} apiKey - New API key
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
    }

    /**
     * Update the model
     * @param {string} model - New model name
     */
    setModel(model) {
        this.model = model;
    }
}

// Available VoyageAI models for embeddings
export const VOYAGE_MODELS = [
    { id: 'voyage-4-large', name: 'Voyage 4 Large (1024 dims)', dimensions: 1024 },
    { id: 'voyage-3-large', name: 'Voyage 3 Large (1024 dims)', dimensions: 1024 },
    { id: 'voyage-3', name: 'Voyage 3 (1024 dims)', dimensions: 1024 },
    { id: 'voyage-3-lite', name: 'Voyage 3 Lite (512 dims)', dimensions: 512 },
    { id: 'voyage-code-3', name: 'Voyage Code 3 (1024 dims)', dimensions: 1024 }
];

/**
 * Get model information by ID
 * @param {string} modelId - Model ID
 * @returns {object|undefined} Model info object
 */
export function getModelInfo(modelId) {
    return VOYAGE_MODELS.find(m => m.id === modelId);
}
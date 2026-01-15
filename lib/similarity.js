/**
 * Vector similarity utilities for RAG memory retrieval
 * @module lib/similarity
 */

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vecA - First embedding vector
 * @param {number[]} vecB - Second embedding vector
 * @returns {number} Cosine similarity score between -1 and 1
 */
export function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
        console.error('[VoyageAI Memory] Vector dimension mismatch or invalid vectors');
        return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
        return 0;
    }

    return dotProduct / (normA * normB);
}

/**
 * Find top-K most similar memories to a query embedding
 * @param {number[]} queryEmbedding - The query embedding vector
 * @param {Array<{id: string, embedding: number[], summary: string}>} memories - Array of memory objects with embeddings
 * @param {number} topK - Number of top results to return
 * @param {number} threshold - Minimum similarity threshold (0-1)
 * @returns {Array<{memory: object, similarity: number}>} Sorted array of memories with similarity scores
 */
export function findTopKSimilar(queryEmbedding, memories, topK = 5, threshold = 0.7) {
    if (!queryEmbedding || !memories || memories.length === 0) {
        return [];
    }

    // Calculate similarity for each memory
    const scoredMemories = memories
        .filter(memory => memory.embedding && memory.embedding.length > 0)
        .map(memory => ({
            memory,
            similarity: cosineSimilarity(queryEmbedding, memory.embedding)
        }))
        .filter(item => item.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);

    return scoredMemories;
}

/**
 * Calculate the average embedding of multiple vectors
 * @param {number[][]} embeddings - Array of embedding vectors
 * @returns {number[]} Average embedding vector
 */
export function averageEmbeddings(embeddings) {
    if (!embeddings || embeddings.length === 0) {
        return [];
    }

    const dimension = embeddings[0].length;
    const result = new Array(dimension).fill(0);

    for (const embedding of embeddings) {
        for (let i = 0; i < dimension; i++) {
            result[i] += embedding[i];
        }
    }

    for (let i = 0; i < dimension; i++) {
        result[i] /= embeddings.length;
    }

    return result;
}

/**
 * Normalize a vector to unit length
 * @param {number[]} vector - Input vector
 * @returns {number[]} Normalized vector
 */
export function normalizeVector(vector) {
    if (!vector || vector.length === 0) {
        return [];
    }

    let norm = 0;
    for (let i = 0; i < vector.length; i++) {
        norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm === 0) {
        return vector.slice();
    }

    return vector.map(v => v / norm);
}
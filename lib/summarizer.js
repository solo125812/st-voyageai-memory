/**
 * OpenAI-compatible summarization client
 * @module lib/summarizer
 */

const DEFAULT_SUMMARIZATION_PROMPT_EN = `You are a summarization assistant for a roleplay chat.

Your ONLY job is to summarize ONE message into a single, concise but information-rich statement of fact in ENGLISH that will be used as a story log entry.

RULES:
Focus ONLY on story-relevant actions, decisions, emotional beats, and (if present) important worldbuilding details.
Do NOT add new information or speculate.
Do NOT explain your reasoning.
Do NOT talk about the prompt, the task, or summarization itself.
Do NOT copy template text or special tokens.
Do NOT include tags like <think>, <eot_id>, <|begin_of_text|>, etc.

STYLE:
Use simple past tense verbs (said, asked, accepted, felt, realized, introduced, described, etc.).
For long, world building-heavy messages, include:
The name of the place or system,
The key rule or conflict,
{{user}}'s current role or status,
The immediate hook or situation at the end of the message.
Keep the summary extremely focused but not empty: it should be one dense sentence that a future model can use as a memory.
Do NOT include long verbatim quotes.

LENGTH:
The summary MUST be no more than {{words}} words.
For short, simple messages, fewer words are fine.
For long, important messages, aim to use most of the {{words}} allowance.`;

const DEFAULT_SUMMARIZATION_PROMPT_KO = `You are a summarization assistant for a roleplay chat.

Your ONLY job is to summarize ONE message into a single, concise but information-rich statement of fact in KOREAN that will be used as a story log entry.

RULES:
Focus ONLY on story-relevant actions, decisions, emotional beats, and (if present) important worldbuilding details.
Do NOT add new information or speculate.
Do NOT explain your reasoning.
Do NOT talk about the prompt, the task, or summarization itself.
Do NOT copy template text or special tokens.
Do NOT include tags like <think>, <eot_id>, <|begin_of_text|>, etc.

Explicit Content Mandate:
Content Type: Adult fiction following Korean web novel (노벨피아, 문피아, 카카오페이지) and Japanese eroge/doujin conventions.
Intimate Scene Conventions:
- Physical responses heightened for impact
- Anatomical terms direct, no euphemisms
✗ 그곳, 비부, 성기, 치부
✓ 보지, 자지, 똥구멍
- Sensory-rich body descriptions
- Hentai Exaggeration allowed (multiple climax, ahegao, squirting, etc...)

STYLE:
Use simple past tense verbs (said, asked, accepted, felt, realized, introduced, described, etc.).
For long, world building-heavy messages, include:
The name of the place or system,
The key rule or conflict,
{{user}}'s current role or status,
The immediate hook or situation at the end of the message.
Keep the summary extremely focused but not empty: it should be one dense sentence that a future model can use as a memory.
Do NOT include long verbatim quotes.

LENGTH:
The summary MUST be no more than {{words}} words.
For short, simple messages, fewer words are fine.
For long, important messages, aim to use most of the {{words}} allowance.

OUTPUT FORMAT (EXACT):
\`[MM/DD|HH:MM] [Summary in past tense, in Korean]\`

EXAMPLES:
[01/22|22:11] {{user}}의 사과를 받아들였지만 감정적으로 거리를 유지했다.
[03/12|04:21] 텔레포트 시나리오에 동의하고 간단한 중세 배경을 요청했다.
[12/02|00:01] Cygnus를 엄격한 길드 기반 세계로 소개하고 {{user}}를 문을 두드리는 후드 쓴 인물로부터 시작되는 길드 없는 'Null'로 설정했다.

Remember:
Summarize ONLY the TARGET message.
Your response must contain ONLY the summary line with timestamp; NOTHING else.`;

const DEFAULT_SUMMARIZATION_PROMPT = DEFAULT_SUMMARIZATION_PROMPT_KO;

// Default word limit for summaries
const DEFAULT_WORD_LIMIT = 50;

/**
 * Summarization client for OpenAI-compatible APIs
 */
export class SummarizerClient {
    /**
     * Create a Summarizer client instance
     * @param {string} apiUrl - API endpoint URL
     * @param {string} apiKey - API key
     * @param {string} model - Model name (e.g., 'gpt-4o-mini')
     * @param {string} systemPrompt - Custom system prompt for summarization
     * @param {number} wordLimit - Maximum words for summary
     */
    constructor(apiUrl, apiKey, model = 'gpt-4o-mini', systemPrompt = null, wordLimit = DEFAULT_WORD_LIMIT) {
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
        this.model = model;
        this.systemPrompt = systemPrompt || DEFAULT_SUMMARIZATION_PROMPT;
        this.wordLimit = wordLimit;
    }

    /**
     * Get the full API endpoint URL
     * @returns {string} Full API URL
     */
    getEndpointUrl() {
        // Ensure URL ends properly for chat completions
        let url = this.apiUrl.trim();
        
        // Remove trailing slash
        if (url.endsWith('/')) {
            url = url.slice(0, -1);
        }
        
        // Add /chat/completions if not present
        if (!url.endsWith('/chat/completions')) {
            if (!url.endsWith('/v1')) {
                url += '/v1';
            }
            url += '/chat/completions';
        }
        
        return url;
    }

    /**
     * Process system prompt with placeholders
     * @param {object} context - Context with user name, words limit, etc.
     * @returns {string} Processed system prompt
     */
    processSystemPrompt(context = {}) {
        let prompt = this.systemPrompt;
        
        // Replace {{words}} placeholder
        const wordLimit = context.wordLimit || this.wordLimit || DEFAULT_WORD_LIMIT;
        prompt = prompt.replace(/\{\{words\}\}/g, wordLimit.toString());
        
        // Replace {{user}} placeholder with actual user name
        const userName = context.userName || 'User';
        prompt = prompt.replace(/\{\{user\}\}/g, userName);
        
        return prompt;
    }

    /**
     * Summarize a message
     * @param {string} message - The message to summarize
     * @param {object} context - Optional context (role, character name, userName, summaryHistory, rawHistory, etc.)
     * @returns {Promise<string>} Summarized text
     */
    async summarize(message, context = {}) {
        if (!this.apiUrl || !this.apiKey) {
            throw new Error('Summarization API URL and key are required');
        }

        if (!message || message.trim().length === 0) {
            return '';
        }

        const systemPrompt = this.processSystemPrompt(context);
        const userContent = this.formatUserContent(message, context);

        try {
            const response = await fetch(this.getEndpointUrl(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt
                        },
                        {
                            role: 'user',
                            content: userContent
                        }
                    ],
                    max_tokens: 300,
                    temperature: 0.3
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    `Summarization API error: ${response.status} - ${errorData.error?.message || response.statusText}`
                );
            }

            const data = await response.json();
            const summary = data.choices?.[0]?.message?.content?.trim();

            if (!summary) {
                throw new Error('No summary generated');
            }

            return summary;
        } catch (error) {
            console.error('[VoyageAI Memory] Summarization error:', error);
            throw error;
        }
    }

    /**
     * Format the user content for summarization
     * @param {string} message - Original message
     * @param {object} context - Context information (summaryHistory, rawHistory, role, etc.)
     * @returns {string} Formatted content
     */
    formatUserContent(message, context) {
        let content = '';
        
        // Add raw message history if provided (previous chat messages)
        if (context.rawHistory && context.rawHistory.length > 0) {
            content += '=== RECENT CHAT HISTORY (for context only) ===\n';
            for (const msg of context.rawHistory) {
                content += `[${msg.name}]: ${msg.content}\n`;
            }
            content += '=== END OF CHAT HISTORY ===\n\n';
        }
        
        // Add summary history if provided (previous summaries)
        if (context.summaryHistory && context.summaryHistory.length > 0) {
            content += '=== PREVIOUS SUMMARIES (for style reference) ===\n';
            content += context.summaryHistory.join('\n');
            content += '\n=== END OF SUMMARIES ===\n\n';
        }
        
        // Legacy support: also check for 'history' property
        if (!context.summaryHistory && context.history && context.history.length > 0) {
            content += '=== PREVIOUS SUMMARIES (for style reference) ===\n';
            content += context.history.join('\n');
            content += '\n=== END OF SUMMARIES ===\n\n';
        }

        // Add the target message
        content += '=== TARGET MESSAGE TO SUMMARIZE ===\n';
        
        if (context.role) {
            const speaker = context.role === 'user' ? (context.userName || 'User') : (context.characterName || 'Character');
            content += `[${speaker}]: `;
        }
        
        content += message;
        content += '\n=== END OF TARGET MESSAGE ===';

        return content;
    }

    /**
     * Batch summarize multiple messages
     * @param {Array<{message: string, context: object}>} items - Array of messages with context
     * @returns {Promise<string[]>} Array of summaries
     */
    async summarizeBatch(items) {
        const summaries = [];
        
        for (const item of items) {
            try {
                const summary = await this.summarize(item.message, item.context || {});
                summaries.push(summary);
            } catch (error) {
                console.error('[VoyageAI Memory] Batch summarization error:', error);
                summaries.push(''); // Push empty on error
            }
            
            // Small delay between requests to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return summaries;
    }

    /**
     * Test the API connection
     * @returns {Promise<boolean>} True if connection successful
     */
    async testConnection() {
        try {
            await this.summarize('This is a test message.', {});
            return true;
        } catch (error) {
            console.error('[VoyageAI Memory] Summarization connection test failed:', error);
            return false;
        }
    }

    /**
     * Update configuration
     * @param {object} config - Configuration updates
     */
    updateConfig({ apiUrl, apiKey, model, systemPrompt, wordLimit }) {
        if (apiUrl !== undefined) this.apiUrl = apiUrl;
        if (apiKey !== undefined) this.apiKey = apiKey;
        if (model !== undefined) this.model = model;
        if (systemPrompt !== undefined) this.systemPrompt = systemPrompt || DEFAULT_SUMMARIZATION_PROMPT;
        if (wordLimit !== undefined) this.wordLimit = wordLimit;
    }

    /**
     * Set word limit
     * @param {number} limit - Word limit for summaries
     */
    setWordLimit(limit) {
        this.wordLimit = limit;
    }

    /**
     * Get the default system prompt
     * @returns {string} Default prompt
     */
    static getDefaultPrompt() {
        return DEFAULT_SUMMARIZATION_PROMPT;
    }
}

/**
 * Get the default prompts for different languages
 * @returns {object} Object with language code keys
 */
export function getDefaultPrompts() {
    return {
        en: DEFAULT_SUMMARIZATION_PROMPT_EN,
        ko: DEFAULT_SUMMARIZATION_PROMPT_KO
    };
}

/**
 * Create a simple fallback summarizer that truncates text
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function fallbackSummarize(text, maxLength = 200) {
    if (!text || text.length <= maxLength) {
        return text || '';
    }

    // Try to cut at sentence boundary
    const truncated = text.slice(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastQuestion = truncated.lastIndexOf('?');
    const lastExclaim = truncated.lastIndexOf('!');
    
    const lastSentence = Math.max(lastPeriod, lastQuestion, lastExclaim);
    
    if (lastSentence > maxLength * 0.5) {
        return truncated.slice(0, lastSentence + 1);
    }

    // Cut at word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
        return truncated.slice(0, lastSpace) + '...';
    }

    return truncated + '...';
}
/**
 * VoyageAI RAG Memory Extension for SillyTavern
 * Provides long-term memory using VoyageAI embeddings and OpenAI-compatible summarization
 */

// Import SillyTavern modules
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

// Import our modules
import { VoyageAIClient, VOYAGE_MODELS } from "./lib/voyageai.js";
import { SummarizerClient, getDefaultPrompts } from "./lib/summarizer.js";
import { MemoryStorage, createMemory } from "./lib/storage.js";
import { findTopKSimilar } from "./lib/similarity.js";

// Extension configuration
const extensionName = "st-voyageai-memory";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// Default settings
const defaultSettings = {
    enabled: false,
    // Summarization API
    summarization_url: "",
    summarization_key: "",
    summarization_model: "gemini-2.0-flash-exp",
    // VoyageAI
    voyage_api_key: "",
    voyage_model: "voyage-4-large",
    // Behavior
    auto_store: true,
    auto_retrieve: true,
    top_k: 5,
    similarity_threshold: 0.7,
    injection_position: "afterScenario",
    injection_depth: 0,
    // Message summarization filters
    summarize_bot: true,
    summarize_user: true,
    // Advanced
    language: "ko",
    custom_prompt: "",
    memory_template: "[과거 대화에서 관련된 기억들:\n{{memories}}]",
    word_limit: 50,
    // Summary history context
    include_history: true,
    history_count: 3,
    // Raw message history context
    include_raw_history: true,
    raw_history_count: 5,
    raw_include_bot: true,
    raw_include_user: true,
    debug_mode: false
};

// Global instances
let voyageClient = null;
let summarizerClient = null;
let memoryStorage = null;
let isProcessing = false;
let currentCharacterId = null;

/**
 * Initialize the extension
 */
async function init() {
    // Load settings
    await loadSettings();
    
    // Initialize clients
    initClients();
    
    // Initialize storage
    memoryStorage = new MemoryStorage(extensionFolderPath);
    
    // Load settings UI
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $("#extensions_settings2").append(settingsHtml);
    
    // Bind UI events
    bindUIEvents();
    
    // Bind SillyTavern events
    bindSTEvents();
    
    // Update UI with current settings
    updateUI();
    
    log("Extension initialized");
}

/**
 * Load extension settings
 */
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    
    // Merge with defaults
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (extension_settings[extensionName][key] === undefined) {
            extension_settings[extensionName][key] = value;
        }
    }
}

/**
 * Get current settings
 * @returns {object} Current settings
 */
function getSettings() {
    return extension_settings[extensionName];
}

/**
 * Save a setting
 * @param {string} key - Setting key
 * @param {any} value - Setting value
 */
function saveSetting(key, value) {
    extension_settings[extensionName][key] = value;
    saveSettingsDebounced();
}

/**
 * Initialize API clients with current settings
 */
function initClients() {
    const settings = getSettings();
    
    voyageClient = new VoyageAIClient(
        settings.voyage_api_key,
        settings.voyage_model
    );
    
    summarizerClient = new SummarizerClient(
        settings.summarization_url,
        settings.summarization_key,
        settings.summarization_model,
        settings.custom_prompt || null
    );
}

/**
 * Bind UI event handlers
 */
function bindUIEvents() {
    const settings = getSettings();
    
    // Enable toggle
    $("#voyageai_memory_enabled").on("change", function() {
        saveSetting("enabled", $(this).prop("checked"));
        updateStatus();
    });
    
    // Summarization settings
    $("#voyageai_summarization_url").on("input", function() {
        const value = $(this).val();
        saveSetting("summarization_url", value);
        summarizerClient.updateConfig({ apiUrl: value });
    });
    
    $("#voyageai_summarization_key").on("input", function() {
        const value = $(this).val();
        saveSetting("summarization_key", value);
        summarizerClient.updateConfig({ apiKey: value });
    });
    
    $("#voyageai_summarization_model").on("input", function() {
        const value = $(this).val();
        saveSetting("summarization_model", value);
        summarizerClient.updateConfig({ model: value });
    });
    
    // VoyageAI settings
    $("#voyageai_api_key").on("input", function() {
        const value = $(this).val();
        saveSetting("voyage_api_key", value);
        voyageClient.setApiKey(value);
    });
    
    $("#voyageai_model").on("change", function() {
        const value = $(this).val();
        saveSetting("voyage_model", value);
        voyageClient.setModel(value);
    });
    
    // Behavior settings
    $("#voyageai_auto_store").on("change", function() {
        saveSetting("auto_store", $(this).prop("checked"));
    });
    
    $("#voyageai_auto_retrieve").on("change", function() {
        saveSetting("auto_retrieve", $(this).prop("checked"));
    });
    
    $("#voyageai_top_k").on("input", function() {
        saveSetting("top_k", parseInt($(this).val()) || 5);
    });
    
    $("#voyageai_similarity_threshold").on("input", function() {
        saveSetting("similarity_threshold", parseFloat($(this).val()) || 0.7);
    });
    
    $("#voyageai_injection_position").on("change", function() {
        saveSetting("injection_position", $(this).val());
    });

    $("#voyageai_injection_depth").on("input", function() {
        saveSetting("injection_depth", parseInt($(this).val()) || 0);
    });

    // Message summarization filter settings
    $("#voyageai_summarize_bot").on("change", function() {
        saveSetting("summarize_bot", $(this).prop("checked"));
    });

    $("#voyageai_summarize_user").on("change", function() {
        saveSetting("summarize_user", $(this).prop("checked"));
    });
    
    // Language setting
    $("#voyageai_language").on("change", function() {
        const lang = $(this).val();
        saveSetting("language", lang);
        // Update summarizer with new language prompt if no custom prompt is set
        const settings = getSettings();
        if (!settings.custom_prompt) {
            const prompts = getDefaultPrompts();
            summarizerClient.updateConfig({ systemPrompt: prompts[lang] || prompts.ko });
        }
    });
    
    // Advanced settings
    $("#voyageai_word_limit").on("input", function() {
        const value = parseInt($(this).val()) || 50;
        saveSetting("word_limit", value);
        summarizerClient.setWordLimit(value);
    });

    $("#voyageai_include_history").on("change", function() {
        saveSetting("include_history", $(this).prop("checked"));
    });

    $("#voyageai_history_count").on("input", function() {
        saveSetting("history_count", parseInt($(this).val()) || 3);
    });

    // Raw message history settings
    $("#voyageai_include_raw_history").on("change", function() {
        saveSetting("include_raw_history", $(this).prop("checked"));
    });

    $("#voyageai_raw_history_count").on("input", function() {
        saveSetting("raw_history_count", parseInt($(this).val()) || 5);
    });

    $("#voyageai_raw_include_bot").on("change", function() {
        saveSetting("raw_include_bot", $(this).prop("checked"));
    });

    $("#voyageai_raw_include_user").on("change", function() {
        saveSetting("raw_include_user", $(this).prop("checked"));
    });

    $("#voyageai_custom_prompt").on("input", function() {
        const value = $(this).val();
        saveSetting("custom_prompt", value);
        summarizerClient.updateConfig({ systemPrompt: value || null });
    });
    
    $("#voyageai_memory_template").on("input", function() {
        saveSetting("memory_template", $(this).val());
    });
    
    $("#voyageai_debug_mode").on("change", function() {
        saveSetting("debug_mode", $(this).prop("checked"));
    });
    
    // Action buttons
    $("#voyageai_test_summarization").on("click", testSummarizationConnection);
    $("#voyageai_test_embedding").on("click", testEmbeddingConnection);
    $("#voyageai_store_current").on("click", storeCurrentChat);
    $("#voyageai_clear_memories").on("click", clearCurrentMemories);
    $("#voyageai_export_memories").on("click", exportMemories);
    $("#voyageai_import_memories").on("click", () => $("#voyageai_import_file").click());
    $("#voyageai_import_file").on("change", importMemories);
    $("#voyageai_view_memories").on("click", showMemoryViewer);
    
    // Modal events
    $("#voyageai_close_viewer, #voyageai_close_viewer_btn").on("click", hideMemoryViewer);
}

/**
 * Bind SillyTavern event handlers
 */
function bindSTEvents() {
    // Message received (from AI)
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    
    // Message sent (from user)
    eventSource.on(event_types.MESSAGE_SENT, onMessageSent);
    
    // Chat changed
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    
    // Before prompt generation - inject memories
    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, onBeforePromptGeneration);
}

/**
 * Handle received messages (AI responses)
 * @param {number} messageId - Message index
 */
async function onMessageReceived(messageId) {
    const settings = getSettings();
    if (!settings.enabled || !settings.auto_store) return;
    
    // Check if bot messages should be summarized
    if (!settings.summarize_bot) {
        log("Bot message summarization disabled, skipping");
        return;
    }
    
    const context = getContext();
    const message = context.chat[messageId];
    
    if (!message || message.is_system) return;
    
    await processAndStoreMessage(message.mes, "assistant", context);
}

/**
 * Handle sent messages (user messages)
 * @param {number} messageId - Message index
 */
async function onMessageSent(messageId) {
    const settings = getSettings();
    if (!settings.enabled || !settings.auto_store) return;
    
    // Check if user messages should be summarized
    if (!settings.summarize_user) {
        log("User message summarization disabled, skipping");
        return;
    }
    
    const context = getContext();
    const message = context.chat[messageId];
    
    if (!message || message.is_system) return;
    
    await processAndStoreMessage(message.mes, "user", context);
}

/**
 * Handle chat/character change
 */
async function onChatChanged() {
    const context = getContext();
    
    if (context.characterId) {
        currentCharacterId = context.characterId;
        memoryStorage.invalidateCache(currentCharacterId);
        await updateMemoryStats();
        log(`Switched to character: ${context.name2}`);
    }
}

/**
 * Inject memories before prompt generation
 * @param {object} data - Prompt generation data
 */
async function onBeforePromptGeneration(data) {
    const settings = getSettings();
    if (!settings.enabled || !settings.auto_retrieve) return;
    
    const context = getContext();
    if (!context.characterId) return;
    
    try {
        // Get the last user message as query
        const lastUserMessage = [...context.chat]
            .reverse()
            .find(m => m.is_user && !m.is_system);
        
        if (!lastUserMessage) return;
        
        const relevantMemories = await retrieveRelevantMemories(lastUserMessage.mes);
        
        if (relevantMemories.length > 0) {
            const memoryText = formatMemoriesForInjection(relevantMemories);
            
            // Determine injection method
            const position = settings.injection_position;
            const depth = settings.injection_depth || 0;
            
            // Add to extension prompts with depth support
            if (data.extensionPrompts) {
                const promptEntry = {
                    identifier: 'voyageai_memories',
                    content: memoryText,
                    position: position
                };
                
                // If depth is specified and position supports it, add depth
                if (depth > 0) {
                    promptEntry.depth = depth;
                    promptEntry.position = 'atDepth'; // Override to use depth-based injection
                }
                
                data.extensionPrompts.push(promptEntry);
            }
            
            log(`Injected ${relevantMemories.length} memories into context (position: ${position}, depth: ${depth})`);
        }
    } catch (error) {
        console.error('[VoyageAI Memory] Error injecting memories:', error);
    }
}

/**
 * Get recent memory summaries for history context
 * @param {string} characterId - Character ID
 * @param {number} count - Number of recent summaries to retrieve
 * @returns {Promise<string[]>} Array of recent summaries
 */
async function getRecentSummaries(characterId, count = 3) {
    try {
        const memories = await memoryStorage.getMemories(characterId);
        if (memories.length === 0) return [];
        
        // Sort by timestamp descending and take the most recent
        const recent = [...memories]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, count)
            .reverse() // Put in chronological order
            .map(m => m.summary);
        
        return recent;
    } catch (error) {
        console.error('[VoyageAI Memory] Error getting recent summaries:', error);
        return [];
    }
}

/**
 * Get recent raw chat messages for history context
 * @param {object} context - SillyTavern context
 * @param {number} count - Number of recent messages to retrieve
 * @param {boolean} includeBot - Include bot/assistant messages
 * @param {boolean} includeUser - Include user messages
 * @param {number} excludeIndex - Message index to exclude (the current message being processed)
 * @returns {Array<{role: string, name: string, content: string}>} Array of recent messages
 */
function getRecentRawMessages(context, count = 5, includeBot = true, includeUser = true, excludeIndex = -1) {
    if (!context.chat || context.chat.length === 0) return [];
    
    const messages = [];
    
    // Iterate from the end of chat backwards, excluding system messages and the current message
    for (let i = context.chat.length - 1; i >= 0 && messages.length < count; i--) {
        const msg = context.chat[i];
        
        // Skip system messages
        if (msg.is_system) continue;
        
        // Skip the message being processed (if specified)
        if (excludeIndex >= 0 && i === excludeIndex) continue;
        
        // Check if we should include this message type
        const isUser = msg.is_user;
        if (isUser && !includeUser) continue;
        if (!isUser && !includeBot) continue;
        
        // Skip empty or very short messages
        if (!msg.mes || msg.mes.trim().length < 5) continue;
        
        messages.push({
            role: isUser ? 'user' : 'assistant',
            name: isUser ? (context.name1 || 'User') : (context.name2 || 'Character'),
            content: msg.mes
        });
    }
    
    // Reverse to get chronological order
    return messages.reverse();
}

/**
 * Process and store a message
 * @param {string} messageText - The message text
 * @param {string} role - 'user' or 'assistant'
 * @param {object} context - SillyTavern context
 */
async function processAndStoreMessage(messageText, role, context) {
    if (isProcessing) {
        log("Already processing, skipping message");
        return;
    }
    
    if (!messageText || messageText.trim().length < 20) {
        log("Message too short, skipping");
        return;
    }
    
    const settings = getSettings();
    isProcessing = true;
    showProcessingIndicator("Processing message...");
    
    try {
        // Get recent summaries for history context if enabled
        let summaryHistory = [];
        if (settings.include_history && context.characterId) {
            summaryHistory = await getRecentSummaries(context.characterId, settings.history_count || 3);
        }
        
        // Get recent raw messages for context if enabled
        let rawHistory = [];
        if (settings.include_raw_history) {
            // Find the index of the current message to exclude it
            const currentMsgIndex = context.chat.findIndex(m => m.mes === messageText);
            rawHistory = getRecentRawMessages(
                context,
                settings.raw_history_count || 5,
                settings.raw_include_bot !== false,
                settings.raw_include_user !== false,
                currentMsgIndex
            );
        }
        
        // Step 1: Summarize with full context
        showProcessingIndicator("Summarizing...");
        const summary = await summarizerClient.summarize(messageText, {
            role: role,
            characterName: context.name2,
            userName: context.name1 || 'User',
            wordLimit: settings.word_limit || 50,
            summaryHistory: summaryHistory,
            rawHistory: rawHistory
        });
        
        if (!summary) {
            throw new Error("Failed to generate summary");
        }
        
        // Step 2: Generate embedding
        showProcessingIndicator("Generating embedding...");
        const embedding = await voyageClient.embedDocument(summary);
        
        if (!embedding || embedding.length === 0) {
            throw new Error("Failed to generate embedding");
        }
        
        // Step 3: Store memory
        showProcessingIndicator("Storing memory...");
        const memory = createMemory(messageText, summary, embedding, {
            role: role,
            chatId: context.chatId
        });
        
        await memoryStorage.addMemory(context.characterId, memory);
        
        log(`Stored memory for ${role}: ${summary.substring(0, 50)}...`);
        await updateMemoryStats();
        
        toastr.success("Memory stored successfully", "VoyageAI Memory");
    } catch (error) {
        console.error('[VoyageAI Memory] Processing error:', error);
        toastr.error(`Failed to process message: ${error.message}`, "VoyageAI Memory");
    } finally {
        isProcessing = false;
        hideProcessingIndicator();
    }
}

/**
 * Retrieve relevant memories for a query
 * @param {string} queryText - The query text
 * @returns {Promise<Array>} Relevant memories with similarity scores
 */
async function retrieveRelevantMemories(queryText) {
    const settings = getSettings();
    const context = getContext();
    
    if (!context.characterId) return [];
    
    try {
        // Generate query embedding
        const queryEmbedding = await voyageClient.embedQuery(queryText);
        
        if (!queryEmbedding || queryEmbedding.length === 0) {
            return [];
        }
        
        // Load memories
        const memories = await memoryStorage.getMemories(context.characterId);
        
        if (memories.length === 0) return [];
        
        // Find similar memories
        const results = findTopKSimilar(
            queryEmbedding,
            memories,
            settings.top_k,
            settings.similarity_threshold
        );
        
        log(`Found ${results.length} relevant memories`);
        return results;
    } catch (error) {
        console.error('[VoyageAI Memory] Retrieval error:', error);
        return [];
    }
}

/**
 * Format memories for context injection
 * @param {Array} memories - Array of {memory, similarity} objects
 * @returns {string} Formatted memory text
 */
function formatMemoriesForInjection(memories) {
    const settings = getSettings();
    
    const memoryTexts = memories.map((item, index) => {
        const memory = item.memory;
        const score = (item.similarity * 100).toFixed(0);
        return `${index + 1}. [${memory.metadata.role}] ${memory.summary} (relevance: ${score}%)`;
    }).join('\n');
    
    const template = settings.memory_template || "[Relevant memories:\n{{memories}}]";
    return template.replace('{{memories}}', memoryTexts);
}

/**
 * Test summarization API connection
 */
async function testSummarizationConnection() {
    const $status = $("#voyageai_summarization_status");
    $status.text("Testing...").removeClass().addClass("voyageai-status voyageai-status-pending");
    
    try {
        const success = await summarizerClient.testConnection();
        if (success) {
            $status.text("✓ Connected").removeClass().addClass("voyageai-status voyageai-status-success");
        } else {
            throw new Error("Connection failed");
        }
    } catch (error) {
        $status.text("✗ Failed").removeClass().addClass("voyageai-status voyageai-status-error");
        toastr.error(`Summarization API test failed: ${error.message}`, "VoyageAI Memory");
    }
}

/**
 * Test VoyageAI embedding connection
 */
async function testEmbeddingConnection() {
    const $status = $("#voyageai_embedding_status");
    $status.text("Testing...").removeClass().addClass("voyageai-status voyageai-status-pending");
    
    try {
        const success = await voyageClient.testConnection();
        if (success) {
            $status.text("✓ Connected").removeClass().addClass("voyageai-status voyageai-status-success");
        } else {
            throw new Error("Connection failed");
        }
    } catch (error) {
        $status.text("✗ Failed").removeClass().addClass("voyageai-status voyageai-status-error");
        toastr.error(`VoyageAI API test failed: ${error.message}`, "VoyageAI Memory");
    }
}

/**
 * Store all messages from current chat
 */
async function storeCurrentChat() {
    const context = getContext();
    
    if (!context.characterId || !context.chat) {
        toastr.warning("No active chat to process", "VoyageAI Memory");
        return;
    }
    
    const messages = context.chat.filter(m => !m.is_system && m.mes && m.mes.length >= 20);
    
    if (messages.length === 0) {
        toastr.info("No messages to store", "VoyageAI Memory");
        return;
    }
    
    if (!confirm(`This will process ${messages.length} messages. Continue?`)) {
        return;
    }
    
    let processed = 0;
    let failed = 0;
    
    for (const message of messages) {
        try {
            showProcessingIndicator(`Processing ${processed + 1}/${messages.length}...`);
            
            const role = message.is_user ? "user" : "assistant";
            
            // Summarize
            const summary = await summarizerClient.summarize(message.mes, {
                role: role,
                characterName: context.name2
            });
            
            // Embed
            const embedding = await voyageClient.embedDocument(summary);
            
            // Store
            const memory = createMemory(message.mes, summary, embedding, {
                role: role,
                chatId: context.chatId
            });
            
            await memoryStorage.addMemory(context.characterId, memory);
            processed++;
            
            // Rate limiting delay
            await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
            console.error('[VoyageAI Memory] Error processing message:', error);
            failed++;
        }
    }
    
    hideProcessingIndicator();
    await updateMemoryStats();
    
    toastr.success(`Processed ${processed} messages (${failed} failed)`, "VoyageAI Memory");
}

/**
 * Clear memories for current character
 */
async function clearCurrentMemories() {
    const context = getContext();
    
    if (!context.characterId) {
        toastr.warning("No active character", "VoyageAI Memory");
        return;
    }
    
    if (!confirm(`Clear all memories for ${context.name2}? This cannot be undone.`)) {
        return;
    }
    
    await memoryStorage.clearMemories(context.characterId);
    await updateMemoryStats();
    
    toastr.success("Memories cleared", "VoyageAI Memory");
}

/**
 * Export memories to JSON file
 */
async function exportMemories() {
    const context = getContext();
    
    if (!context.characterId) {
        toastr.warning("No active character", "VoyageAI Memory");
        return;
    }
    
    try {
        const json = await memoryStorage.exportMemories(context.characterId);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${context.name2}_memories.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toastr.success("Memories exported", "VoyageAI Memory");
    } catch (error) {
        toastr.error(`Export failed: ${error.message}`, "VoyageAI Memory");
    }
}

/**
 * Import memories from JSON file
 */
async function importMemories(event) {
    const context = getContext();
    
    if (!context.characterId) {
        toastr.warning("No active character", "VoyageAI Memory");
        return;
    }
    
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        const merge = confirm("Merge with existing memories? (Cancel to replace)");
        const count = await memoryStorage.importMemories(context.characterId, text, merge);
        
        await updateMemoryStats();
        toastr.success(`Imported ${count} memories`, "VoyageAI Memory");
    } catch (error) {
        toastr.error(`Import failed: ${error.message}`, "VoyageAI Memory");
    }
    
    // Reset file input
    event.target.value = '';
}

/**
 * Show memory viewer modal
 */
async function showMemoryViewer() {
    const context = getContext();
    
    if (!context.characterId) {
        toastr.warning("No active character", "VoyageAI Memory");
        return;
    }
    
    const memories = await memoryStorage.getMemories(context.characterId);
    const $list = $("#voyageai_memories_list");
    $list.empty();
    
    if (memories.length === 0) {
        $list.html(`
            <div class="voyageai-empty-state">
                <div class="voyageai-empty-state-icon">🧠</div>
                <div>No memories stored yet</div>
            </div>
        `);
    } else {
        // Sort by timestamp descending (newest first)
        const sortedMemories = [...memories].sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );
        
        for (const memory of sortedMemories) {
            const roleClass = memory.metadata.role === 'user' 
                ? 'voyageai-memory-role-user' 
                : 'voyageai-memory-role-assistant';
            
            const timeAgo = formatTimeAgo(new Date(memory.timestamp));
            
            $list.append(`
                <div class="voyageai-memory-item" data-id="${memory.id}">
                    <div class="voyageai-memory-header">
                        <span class="voyageai-memory-time">${timeAgo}</span>
                        <span class="voyageai-memory-role ${roleClass}">${memory.metadata.role}</span>
                    </div>
                    <div class="voyageai-memory-summary">${escapeHtml(memory.summary)}</div>
                    <div class="voyageai-memory-original">${escapeHtml(memory.original_message.substring(0, 200))}...</div>
                    <div class="voyageai-memory-actions">
                        <button class="voyageai-memory-action-btn delete" title="Delete memory">🗑️</button>
                    </div>
                </div>
            `);
        }
        
        // Bind delete handlers
        $list.find(".voyageai-memory-action-btn.delete").on("click", async function() {
            const $item = $(this).closest(".voyageai-memory-item");
            const id = $item.data("id");
            
            if (confirm("Delete this memory?")) {
                await memoryStorage.deleteMemory(context.characterId, id);
                $item.fadeOut(() => $item.remove());
                await updateMemoryStats();
            }
        });
    }
    
    $("#voyageai_memory_viewer").show();
}

/**
 * Hide memory viewer modal
 */
function hideMemoryViewer() {
    $("#voyageai_memory_viewer").hide();
}

/**
 * Update UI with current settings
 */
function updateUI() {
    const settings = getSettings();
    
    $("#voyageai_memory_enabled").prop("checked", settings.enabled);
    $("#voyageai_summarization_url").val(settings.summarization_url);
    $("#voyageai_summarization_key").val(settings.summarization_key);
    $("#voyageai_summarization_model").val(settings.summarization_model);
    $("#voyageai_api_key").val(settings.voyage_api_key);
    $("#voyageai_model").val(settings.voyage_model);
    $("#voyageai_auto_store").prop("checked", settings.auto_store);
    $("#voyageai_auto_retrieve").prop("checked", settings.auto_retrieve);
    $("#voyageai_top_k").val(settings.top_k);
    $("#voyageai_similarity_threshold").val(settings.similarity_threshold);
    $("#voyageai_injection_position").val(settings.injection_position);
    $("#voyageai_injection_depth").val(settings.injection_depth || 0);
    $("#voyageai_summarize_bot").prop("checked", settings.summarize_bot !== false);
    $("#voyageai_summarize_user").prop("checked", settings.summarize_user !== false);
    $("#voyageai_language").val(settings.language || "ko");
    $("#voyageai_word_limit").val(settings.word_limit || 50);
    $("#voyageai_include_history").prop("checked", settings.include_history);
    $("#voyageai_history_count").val(settings.history_count || 3);
    $("#voyageai_include_raw_history").prop("checked", settings.include_raw_history);
    $("#voyageai_raw_history_count").val(settings.raw_history_count || 5);
    $("#voyageai_raw_include_bot").prop("checked", settings.raw_include_bot !== false);
    $("#voyageai_raw_include_user").prop("checked", settings.raw_include_user !== false);
    $("#voyageai_custom_prompt").val(settings.custom_prompt);
    $("#voyageai_memory_template").val(settings.memory_template);
    $("#voyageai_debug_mode").prop("checked", settings.debug_mode);
    
    updateStatus();
    updateMemoryStats();
}

/**
 * Update status display
 */
function updateStatus() {
    const settings = getSettings();
    const $status = $("#voyageai_status");
    
    if (settings.enabled) {
        $status.text("Active").removeClass().addClass("voyageai-stat-value voyageai-status-success");
    } else {
        $status.text("Disabled").removeClass().addClass("voyageai-stat-value voyageai-status-ready");
    }
}

/**
 * Update memory statistics display
 */
async function updateMemoryStats() {
    const context = getContext();
    
    if (!context.characterId) {
        $("#voyageai_memory_count").text("0");
        $("#voyageai_last_updated").text("N/A");
        return;
    }
    
    try {
        const stats = await memoryStorage.getStats(context.characterId);
        $("#voyageai_memory_count").text(stats.totalMemories);
        
        if (stats.updatedAt) {
            $("#voyageai_last_updated").text(formatTimeAgo(new Date(stats.updatedAt)));
        } else {
            $("#voyageai_last_updated").text("Never");
        }
    } catch (error) {
        console.error('[VoyageAI Memory] Stats error:', error);
    }
}

/**
 * Show processing indicator
 * @param {string} text - Status text
 */
function showProcessingIndicator(text) {
    let $indicator = $(".voyageai-processing");
    
    if ($indicator.length === 0) {
        $indicator = $(`
            <div class="voyageai-processing">
                <div class="voyageai-spinner"></div>
                <span class="voyageai-processing-text">${text}</span>
            </div>
        `);
        $("body").append($indicator);
    } else {
        $indicator.find(".voyageai-processing-text").text(text);
    }
}

/**
 * Hide processing indicator
 */
function hideProcessingIndicator() {
    $(".voyageai-processing").remove();
}

/**
 * Format timestamp as time ago
 * @param {Date} date - Date object
 * @returns {string} Formatted string
 */
function formatTimeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    
    return date.toLocaleDateString();
}

/**
 * Escape HTML entities
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Debug logging
 * @param {string} message - Log message
 */
function log(message) {
    const settings = getSettings();
    if (settings.debug_mode) {
        console.log(`[VoyageAI Memory] ${message}`);
    }
}

// Initialize on DOM ready
jQuery(async () => {
    await init();
});
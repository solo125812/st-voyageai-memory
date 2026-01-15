# VoyageAI RAG Memory for SillyTavern

A SillyTavern extension that provides long-term memory capabilities using VoyageAI embeddings and OpenAI-compatible summarization APIs. This extension captures chat messages, summarizes them, generates vector embeddings, and retrieves relevant memories to enhance character interactions.

## Features

- 🧠 **Automatic Memory Storage**: Automatically processes and stores new messages as memories
- 🔍 **Semantic Retrieval**: Uses VoyageAI embeddings to find contextually relevant memories
- 📝 **Customizable Summarization**: Works with any OpenAI-compatible API for message summarization
- 💾 **Per-Character Storage**: Separate memory banks for each character
- ⚙️ **Flexible Configuration**: Adjustable similarity thresholds, top-K retrieval, and injection positions
- 📤 **Import/Export**: Backup and restore memories as JSON files
- 👁️ **Memory Viewer**: Browse and manage stored memories

## Installation

### Using SillyTavern Extension Installer (Recommended)

1. Open SillyTavern
2. Go to **Extensions** → **Install Extension**
3. Enter the repository URL: `https://github.com/SillyTavern/st-voyageai-memory`
4. Click **Install**

### Manual Installation

1. Navigate to your SillyTavern installation directory
2. Go to `public/scripts/extensions/third-party/`
3. Clone or copy this repository:
   ```bash
   git clone https://github.com/SillyTavern/st-voyageai-memory.git
   ```
4. Restart SillyTavern

## Configuration

### Prerequisites

Before using this extension, you'll need:

1. **VoyageAI API Key**: Get one from [VoyageAI](https://www.voyageai.com/)
2. **OpenAI-Compatible API**: Any API that follows OpenAI's chat completions format:
   - OpenAI API
   - OpenRouter
   - Local LLM APIs (LM Studio, Ollama with OpenAI compatibility, etc.)
   - Azure OpenAI
   - Any other compatible endpoint

### Settings

Open the extension settings panel (right sidebar → VoyageAI RAG Memory):

#### Summarization API
| Setting | Description |
|---------|-------------|
| API URL | Your OpenAI-compatible endpoint (e.g., `https://api.openai.com/v1`) |
| API Key | Your API key |
| Model | Model name for summarization (e.g., `gpt-4o-mini`) |

#### VoyageAI Settings
| Setting | Description |
|---------|-------------|
| API Key | Your VoyageAI API key |
| Model | Embedding model (default: `voyage-4-large`) |

#### Behavior Settings
| Setting | Default | Description |
|---------|---------|-------------|
| Auto-store | ✅ On | Automatically store new messages |
| Auto-retrieve | ✅ On | Automatically inject relevant memories |
| Top K | 5 | Number of memories to retrieve |
| Similarity Threshold | 0.7 | Minimum relevance score (0-1) |
| Injection Position | After Scenario | Where to insert memories in prompt |

## Usage

### Automatic Mode

1. Configure your API keys
2. Enable the extension
3. Start chatting - memories are automatically stored and retrieved

### Manual Actions

- **Store Current Chat**: Process all messages from the current conversation
- **Clear Memories**: Delete all memories for the current character
- **Export**: Download memories as a JSON file
- **Import**: Load memories from a JSON file
- **View Memories**: Browse stored memories in a modal

## How It Works

### Storage Flow

```
Message → Summarization API → Summary → VoyageAI → Embedding → Local Storage
```

1. New message is detected
2. Message is summarized using your configured LLM
3. Summary is embedded using VoyageAI
4. Memory (summary + embedding + metadata) is stored locally

### Retrieval Flow

```
User Message → VoyageAI → Query Embedding → Similarity Search → Top-K Memories → Prompt Injection
```

1. Before sending a message, the extension generates an embedding
2. Cosine similarity is calculated against all stored memories
3. Top-K most relevant memories above the threshold are selected
4. Memories are formatted and injected into the prompt context

## Memory Format

Memories are stored as JSON with the following structure:

```json
{
  "id": "uuid",
  "timestamp": "ISO-8601 date",
  "original_message": "Full original message",
  "summary": "Condensed summary",
  "embedding": [0.123, -0.456, ...],
  "metadata": {
    "role": "user|assistant",
    "chat_id": "session identifier",
    "importance": 0.5
  }
}
```

## Advanced Configuration

### Custom Summarization Prompt

You can customize how messages are summarized by providing your own system prompt in Advanced Settings.

### Memory Injection Template

Customize the format of injected memories using the template field. Use `{{memories}}` as a placeholder:

```
[Character's memories of past conversations:
{{memories}}]
```

## Troubleshooting

### "Connection test failed"

- Verify your API keys are correct
- Check the API URL format
- Ensure your API has available credits

### Memories not being retrieved

- Lower the similarity threshold
- Check if memories exist using the View Memories button
- Enable debug mode to see console logs

### High API costs

- Use a cheaper model for summarization (e.g., `gpt-4o-mini`)
- Disable auto-store and manually process important conversations
- Use `voyage-3-lite` for smaller embeddings

## API Costs

| Service | Model | Approximate Cost |
|---------|-------|------------------|
| VoyageAI | voyage-4-large | ~$0.00012/1K tokens |
| OpenAI | gpt-4o-mini | ~$0.00015/1K tokens |

## Privacy

- All data is stored locally in your browser's localStorage
- API keys are stored in SillyTavern's extension settings
- Messages are sent to your configured APIs for processing

## Support

- GitHub Issues: [Report bugs](https://github.com/SillyTavern/st-voyageai-memory/issues)
- SillyTavern Discord: Join the community for help

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License

MIT License - See [LICENSE](LICENSE) for details

## Changelog

### v1.0.0
- Initial release
- VoyageAI embedding integration
- OpenAI-compatible summarization
- Per-character memory storage
- Auto-store and auto-retrieve functionality
- Memory viewer and management tools
- Import/export functionality
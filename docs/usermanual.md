# Mode User Manual

## Welcome to Mode
Mode is your Personal AI Code Copilot designed to streamline your coding process. With features like chat-based assistance, intelligent merge, and autocomplete, Mode integrates directly with LLM providers to personalize your coding experience.

---

## Installation

1. **Download the Extension**:
   - Visit the [Visual Studio Marketplace Page](https://marketplace.visualstudio.com/items?itemName=aruna-labs.mode) and click **Install**.

2. **Enable the Extension**:
   - Open Visual Studio Code.
   - Navigate to the Extensions view (`Ctrl+Shift+X` on Mac, `Ctrl+Shift+X` on Windows) and ensure Mode is enabled.

3. **Set API Keys**:
   - Open the Mode settings in the Activity Bar.
   - Enter your OpenAI or other provider API key in the designated field. **Note: At least one API key is required for Mode to function unless you are using local models (e.g., through Ollama or LM Studio).**
   - Save and restart VS Code to apply changes.

---

## Features

### Chat
Get instant help with understanding code, planning, and choosing the best approach.

![Chat](https://cdn.jsdelivr.net/gh/modedevteam/mode-assets/Chat.gif)

- **Invoke the Chat**:
  - Press `Cmd+L` (Mac) or `Ctrl+L` (Windows) to open the chat window.
  - Type your query or command. Mode will provide contextual suggestions based on your input.
  - Mode automatically adds the current file or any highlighted code as context, along with any open editors.

- **Adding Context**:
  - You can add context by pressing the 'Add Context' button, 'Add an image' button, or by invoking the chat on any file.
  - Note that image input only works with models that support vision capabilities (e.g., those from OpenAI and Anthropic).

### Auto Merge

Mode intelligently applies suggestions, without breaking your changes, giving you a true pair-programming experience. *Right now, we recommend Anthropic and OpenAI models for best results.*

![Pair](https://cdn.jsdelivr.net/gh/modedevteam/mode-assets/ApplyChanges.gif)

- **Auto Merge Prompt**:
  - Mode uses a special prompt to apply changes automatically. The best models for this are Anthropic and OpenAI at this time.

### Autocomplete
  - Mode will intelligently suggest code completions based on the context of your project and preferred coding style.

---

## Settings and Configuration

1. **Providers**:
   - Mode supports a variety of hosted providers, including OpenAI, Anthropic, OpenRouter, Google, Mistral, Cohere, and local options like Ollama or LM Studio.
   - Models within these providers are user-configurable.
   - **Configuration**:
     - The `mode.providers` configuration in the `package.json` file allows you to specify which AI providers and models are available for use in Mode.
     - Each provider can have multiple models, and you can configure properties such as:
       - `name`: The exact model name as recognized by the provider.
       - `displayName`: The name displayed in the UI for easy identification.
       - `endpoint`: The URL endpoint used to access the model's API. Currently, this is only supported for local models.
       - `vision`: Indicates if the model supports image input and processing.
       - `largeContext`: Specifies if the model can handle large context inputs. Use this sparingly, only if you have a very basic model that has a small context window.
       - `autocomplete`: Determines if the model supports code completion suggestions.
         **Note: By default, Mode tags the more cost-effective models with this feature to optimize resource usage.**
     - The `visible` property determines if the provider is shown in the UI.
     - You can add or update models as they become available, ensuring that Mode is always using the latest and most suitable models for your needs.
     - To set up API keys, click the key icon in the Mode interface or use the 'Mode: Manage API Keys' command.

2. **Prompt Customization**:
   - Tailor Mode's system prompt to suite your needs.
   - **Custom Prompt Settings**:
     - Use these settings to personalize Mode's behavior or completely override the default prompts with your own. This allows you to customize how Mode interacts with you, ensuring it aligns with your specific needs and preferences.
     - `mode.chat.additionalPrompt`: Add an additional prompt to the system prompt. This prompt will be added after the default system prompt.
     - **Note: You can disable Mode's default prompt using the settings below, but this will also disable Mode's Merge capability, as it requires the contract defined in Mode's default prompt.**
         - `mode.chat.disablePrePrompt`: Prevent Mode from adding its own system prompt, providing a vanilla experience.
         - `mode.chat.promptOverride`: Replace Mode's default system prompt with your custom prompt. Examples: 'You are a helpful assistant.', 'Provide concise and accurate answers.', or 'Assist the user with coding queries in a friendly manner.'
     - `mode.autocomplete.promptOverride`: Provide a custom prompt in markdown format for AI-powered autocompletion.

---

## Common Use Cases

Mode is designed to assist you in various coding scenarios.

### Running Local Models

Using Mode with local models ensures your data remains on your machine and gives you AI-powered coding assistance without requiring an internet connection.

Example configuration of two local models hosted on Ollama and LM Studio:

```json
"mode.providers": [
  {
    "name": "local",
    "models": [
      {
        "name": "llama3.2",
        "displayName": "Llama 3.2 (Ollama)",
        "endpoint": "http://localhost:1234/v1",
        "autocomplete": true
      },
      {
        "name": "llama-3.2-3b-instruct",
        "displayName": "Llama 3.2 (LM Studio)",
        "endpoint": "http://localhost:1234/v1",
        "autocomplete": true
      }
    ],
    "visible": true
  }
]
```

#### Running with Ollama and LM Studio
- **Setup**: Ensure that Ollama and/or LM Studio are installed and properly configured on your system.
- **Integration**: Configure the `mode.providers` settings to include models under the "Local" provider. In the example above, we've added `llama3.2` twice, one hosted on Ollama and another hosted on LM Studio.
- **Usage**: Once configured, Mode will automatically ping the endpoints of the local models (e.g., http://localhost:1234/v1 for Ollama and http://localhost:1234/v1 for LM Studio).
- **Note: After making any configuration changes, press `Cmd+R` (Mac) or `Ctrl+R` (Windows) to refresh Mode and apply the updates.**

---

## FAQs

### How do I update Mode?
- Mode updates automatically via the VS Code Marketplace. To check for updates manually:
  - Open the Extensions view.
  - Search for Mode and click **Update** if available.

### Is there a trial period or subscription?
- No, Mode is open-source and free to use.

---

## Support

- **Community Repository**:
  - For issues, discussions, and feedback, visit our [GitHub Repository](https://github.com/modedevteam/mode).

- **Discord Server**:
  - Join the Mode community on Discord for real-time support and feature discussions. [Join here](https://discord.gg/FRDxms57pG)

- **Email**:
  - Reach us at [hi@getmode.dev](mailto:hi@getmode.dev)
---

Thank you for choosing Mode! We’re excited to help you code smarter and faster.

We will continue to add to this documentation to ensure you have the most up-to-date information and support.


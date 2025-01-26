# Changelog

## [1.0.28] - 2025-01-26

### Added
- Anthropic models now support autocoding!
- Added autocoding support as a configurable option, you can choose it for advanced models (that can return structured JSON output reliably) in the settings
- Save user preferences for autocoding

### Fixed
- Switching between models now clears chat history to remove previous system prompts

### Removed
- Direct Cohere and Mistral support - haven't been able to get them to work reliably

## [1.0.27] - 2025-01-23

### Fixed
- Fixed OpenRouter failing silently (regression introduced in 1.0.26)

## [1.0.26] - 2025-01-21

### Added
- Added autofixing of errors
- Now streaming all explanations and code changes

### Fixed
- UI: Made the coding block animations smoother

## [1.0.25] - 2025-01-20
### Fixed
- Fixed JSON parsing issues when rendering response with tool use
- Fixed chat history not being saved

## [1.0.24] - 2025-01-12

### Fixed
- An issue where follow-up questions were erroring out during autonomous coding

## [1.0.23] - 2025-01-12

### Fixed
- Code changes are now streamed (more pleasing UX)
- Removed unnecessary console logs
- Fix out of bound issues with some edits close to EOF

## [1.0.20] - 2025-01-11
### Added
- Autonomous coding mode for OpenAI GPT models! This allows the model to write code without users have to manually approved or merge every single change.
- Over the course of the next few releases, we will be adding autonomous coding support to more models and features.

## [1.0.19] - 2025-01-02
### Fixed
- Improve merge accuracy for more complex merges (e.g. making multiple changes to the same file)
- Repository URL

## [1.0.18] - 2024-12-31
### Added
- Significantly improved accuracy of merge. Merge now reliably works across most models

## [1.0.17] - 2024-12-24
### Added
- Introduced documentation for the project's core features and usage guidelines (usermanual.md)
### Fixed
- Removed unncessary tags

## [1.0.16] - 2024-12-24
### Added
- Configurable display name for models
- VSCode marketplace badges
- Dummy API key for OpenAI SDK to work with local endpoints
- Introduced the ability to add an additional prompt, disable default prompts, and define your own

### Fixed
- Resolved issue where Prompt Override didn't work

### Changed
- Updated `README.md`
- Made Show AI merge more stringent

### Removed
- Deleted unnecessary package file
- Removed context restrictions for local models

## [1.0.15] - 2024-12-21
### Added
OpenRouter and LM Studio Support

## [1.0.14] - 2024-12-19
### Added
Add the latest o1 and gemini 2 (thinking) models

## [1.0.13] - 2024-12-14
### Added
* Autocomplete (experimental)

## [1.0.12] - 2024-11-29
### Added
* Ollama support

## [1.0.11] - 2024-11-28
### Fixed
* Increase max token limit to prevent unintentional trimming of response for more complex asks
* Improved the prompt - the output is more conversational

### Added
* Renamed config to mode.[feature].providers to allow per-feature model settings

## [1.0.10] - 2024-11-23
### Fixed
* Improved Merge performance and accuracy
* The last used model is now saved immediately
* Discord Link

## [1.0.9] - 2024-11-21
### Added
* Client upgrades to support OpenAI o1 models

## [1.0.8] - 2024-11-21
### Added
* Merge is now faster and more accurate
* Option to copy a previous question

## [1.0.7] - 2024-11-15
### Added
* Users can now configure their own models

### Fixed
* Improve 'Ask Mode' experience and accuracy

### Removed
* Manual merge - it's not too different from copying code, and we will focus on Merge with AI going forward

## [1.0.6] - 2024-11-14
### Added
* Users can now @-mention context!
* Improve chat and merge results by excluding non-source files from scope (configurable)

### Fixed
* Improved pasted code’s indendation
* Made the chat loading animation smoother
* Show consistent merge options

### Removed
* Remove the ability to adjust prompt and temperature until we are getting really reliable results from the LLM or until users request it

## [1.0.5] - 2024-11-11
### Added
- Now Mode automatically adds the currently opened files as chat context so users don't have to manually add them
- Include unsaved changes in the file context

### Fixed
- Fixed syntax highlighting not working for some languages

## [1.0.4] - 2024-11-10
### Fixed
- (Continued) Fixed open chat command not working for some users

## [1.0.3] - 2024-11-10
### Fixed
- Fixed open chat command not working for some users

## [1.0.2] - 2024-11-09
### Added
- Updated README.md and added CHANGELOG.md

## [1.0.1] - 2024-11-09
### Added
- Logo assets

## [1.0.0] - 2024-11-09
### Initial Release
- Launched Mode, the personal AI coding copilot.
- Core features: AI-powered chat for coding assistance, intuitive code-merge, direct model connection, and customizable options.
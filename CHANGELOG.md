# Changelog

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
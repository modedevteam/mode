import * as vscode from 'vscode';
import { AIMessage } from '../../common/llms/aiClient';
import MarkdownIt = require('markdown-it');
import { StreamProcessor } from './streamProcessor';
import { AIClient } from '../../common/llms/aiClient';
import { formatFileContent } from '../../common/rendering/llmTranslationUtils';
import { SessionManager } from './chatSessionManager';

// New class to handle message processing
export class MessageHandler {
	private streamProcessor: StreamProcessor;
	private isCancelled = false;

	constructor(
		private readonly _view: vscode.WebviewView,
		private readonly aiClient: AIClient | null,
		private readonly md: MarkdownIt,
		private readonly sessionManager: SessionManager
	) {
		this.streamProcessor = new StreamProcessor(_view, md, this.sessionManager);
	}

	public stopGeneration() {
		this.isCancelled = true;
		this.aiClient?.stopGeneration();
	}

	public async handleMessage(
		message: string,
		images: { id: string; data: string; fileName?: string }[],
		codeSnippets: { fileName: string; range: string; code: string }[] = [],
		fileUrls: string[] = [],
		currentFilePath: string | null = null
	): Promise<void> {
		try {
			this.isCancelled = false;

			// Access messages from sessionManager
			const messages = this.sessionManager.getCurrentSession().messages;

			// Add the user message
			messages.push({ role: "user", content: message, name: "Mode" });

			// Add each image as a separate message
			images.forEach(image => {
				messages.push({
					role: "user",
					content: image.data,
					type: 'image'
				});
			});

			// Add each code snippet as a separate message
			codeSnippets.forEach(snippet => {
				messages.push({
					role: "user",
					content: `{{Code Snippet}}${snippet.fileName} (${snippet.range})\n\n${snippet.code}{{/Code Snippet}}`
				});
			});

			// Add current file as a separate message
			if (currentFilePath) {
				messages.push({
					role: "user",
					content: `{{Current File Path}}${currentFilePath}{{/Current File Path}}`
				});
			}

			// Format the file contents
			for (const fileUrl of fileUrls) {
				const formattedFileContent = (await formatFileContent(fileUrl)).join('\n');
				messages.push({
					role: "user",
					content: formattedFileContent
				});
			}

			// call LLM provider and stream the response
			let isFirstToken = true;

			await this.aiClient!.chat(messages as AIMessage[], {
				onToken: (token) => {
					if (this.isCancelled) {
						return;
					}

					if (isFirstToken) {
						// notify webview to start streaming on first token
						this._view.webview.postMessage({ command: 'chatStream', action: 'startStream' });
						isFirstToken = false;
					}

					this.streamProcessor.processToken(token);
				},
				onComplete: (fullText) => {
					if (this.isCancelled) {
						return;
					}

									// Send buffered markdown lines as a complete formatted block
				this.streamProcessor.finalize();

					// save the raw full text for diagnostic purposes
					this.sessionManager.getCurrentSession().messages.push({
						role: "assistant",
						content: fullText,
						name: "Mode"
					});
				}
			});

				// Mark the end of the stream
				if (!this.isCancelled) {
					this._view.webview.postMessage({
						command: 'chatStream',
						action: 'endStream'
					});
				}
		} catch (error) {
			let errorMessage: string;
			let fullError: string;
			try {
				// Attempt to parse and pretty-print the error as JSON
				fullError = JSON.stringify(JSON.parse(JSON.stringify(error)), null, 2);
				errorMessage = error instanceof Error ? error.message : String(error);
			} catch {
				// If parsing fails, use the error message as is
				errorMessage = error instanceof Error ? error.message : String(error);
				fullError = errorMessage;
			}

			this._view.webview.postMessage({
				command: 'addChatError',
				message: 'apiError.openai.error',
				errorMessage: this.md.render(errorMessage),
				fullError: this.md.render('```json\n' + fullError + '\n```')
			});
		}
	}
}
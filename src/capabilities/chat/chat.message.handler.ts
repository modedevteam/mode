/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AIMessage } from '../../common/llms/llm.client';
import MarkdownIt from 'markdown-it';
import { ChatResponseHandler } from './chat.response.handler';
import { AIClient } from '../../common/llms/llm.client';
import { formatFileContent } from '../../common/rendering/llm.translation.utils';
import { ChatSessionManager } from './chat.session.handler';
import { HIGHLIGHTED_CODE_START, HIGHLIGHTED_CODE_END, CURRENT_FILE_PATH_START, CURRENT_FILE_PATH_END } from '../../common/llms/llm.prompt';
import { applyFileChanges } from '../tools/apply.file.changes';

// New class to handle message processing
export class ChatMessageHandler {
	private streamProcessor: ChatResponseHandler;
	private isCancelled = false;
	private toolCalls: any[] = [];

	constructor(
		private readonly _view: vscode.WebviewView,
		private readonly aiClient: AIClient | null,
		private readonly md: MarkdownIt,
		private readonly sessionManager: ChatSessionManager
	) {
		this.streamProcessor = new ChatResponseHandler(_view, md, this.sessionManager);
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
		currentFilePath: string | null = null,
		auto: boolean
	): Promise<void> {
		try {
			this.isCancelled = false;
			this.toolCalls = [];

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
					content: `${HIGHLIGHTED_CODE_START}${snippet.fileName} (${snippet.range})\n\n${snippet.code}${HIGHLIGHTED_CODE_END}`
				});
			});

			// Add current file as a separate message
			if (currentFilePath) {
				messages.push({
					role: "user",
					content: `${CURRENT_FILE_PATH_START}${currentFilePath}${CURRENT_FILE_PATH_END}`
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
			let streamStarted = false;

			await this.aiClient!.chat(messages as AIMessage[], {
				onToken: (token) => {
					if (this.isCancelled) {
						return;
					}

					if (isFirstToken) {
						// notify webview to start streaming on first token
						this._view.webview.postMessage({ command: 'chatStream', action: 'startStream' });
						isFirstToken = false;
						streamStarted = true;
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
				},
				onToolCall: (toolCall) => {
					if (this.isCancelled) {
						return;
					}

					// Start stream if it hasn't been started by onToken
					if (!streamStarted) {
						this._view.webview.postMessage({ command: 'chatStream', action: 'startStream' });
						streamStarted = true;
					}

					// Only add complete tool calls with arguments
					if (toolCall.function?.arguments) {
						try {
							// Parse the arguments string into a JSON object
							const parsedArguments = JSON.parse(toolCall.function.arguments);
							toolCall.function.arguments = parsedArguments;
							this.toolCalls.push(toolCall);

							// Call apply changes if the function name matches
							if (toolCall.function.name === 'apply_file_changes') {
								applyFileChanges(parsedArguments, this.streamProcessor);
							}
						} catch (error) {
							console.error('Failed to parse tool call arguments:', error);
						}
					}
				}
			});

			// Add collected tool calls after streaming is complete
			if (this.toolCalls.length > 0) {
				this.sessionManager.getCurrentSession().messages.push({
					role: "assistant",
					content: this.toolCalls,
					name: "Mode"
				});
			}

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
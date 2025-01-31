/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AIMessage, StreamToken } from '../../../common/llms/clients/llm.client';
import MarkdownIt from 'markdown-it';
import { TextResponseProcessor } from '../response/text.response.processor';
import { AIClient } from '../../../common/llms/clients/llm.client';
import { formatFileContent } from '../../../common/rendering/llm.translation.utils';
import { ChatSessionManager } from './chat.session.handler';
import { HIGHLIGHTED_CODE_START, HIGHLIGHTED_CODE_END, CURRENT_FILE_PATH_START, CURRENT_FILE_PATH_END } from '../../../common/llms/llm.prompt';
import { applyFileChanges } from '../../tools/apply.file.changes';
import { StreamResponseProcessor } from '../response/stream.response.processor';
import { sanitizeJsonString } from '../../../common/rendering/json.utils';

// New class to handle message processing
export class ChatMessageHandler {
	private chatV2ResponseProcessor: TextResponseProcessor;
	private autoCodingStreamProcessor: StreamResponseProcessor;
	private isCancelled = false;
	private toolCalls: any[] = [];

	constructor(
		private readonly _view: vscode.WebviewView,
		private readonly aiClient: AIClient | null,
		private readonly md: MarkdownIt,
		private readonly sessionManager: ChatSessionManager
	) {
		this.chatV2ResponseProcessor = new TextResponseProcessor(_view, md);
		this.autoCodingStreamProcessor = new StreamResponseProcessor(_view, md);
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
		applyChanges: boolean,
		supportsAutocoding: boolean
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
			let streamStarted = false;

			let lastToolCall: any = null;
			let lastFullText: string = '';

			await this.aiClient!.chat(messages as AIMessage[], {
				onToken: (token) => {
					if (this.isCancelled) return;

					if (!streamStarted) {
						if (supportsAutocoding) {
							this.autoCodingStreamProcessor.startStream();
						} else {
							// Chatv2 stream processordoesn't have this method, so we need to do this manually
							this._view.webview.postMessage({ command: 'chatStream', action: 'startStream' });
						}
						streamStarted = true;
					}

					if (supportsAutocoding) {
						// Use the auto coding stream processor because these are models that support strict outputs
						this.autoCodingStreamProcessor.processToken(token.content);
					} else {
						// Use the chat v2 response processor for models that are more unpredictable
						this.chatV2ResponseProcessor.processToken(token.content);
					}
				},
				onComplete: (fullText) => {
					if (this.isCancelled) return;

					// Store the full text
					lastFullText = fullText;

					// Finalize the stream
					if (supportsAutocoding) {
						this.autoCodingStreamProcessor.endStream();
					} else {
						this.chatV2ResponseProcessor.finalize();
					}

					this.sessionManager.getCurrentSession().messages.push({
						role: "assistant",
						content: fullText,
						name: supportsAutocoding ? "Mode.AutoCoding" : "Mode.ChatResponse"
					});
				},
				onToolCall: (toolCall) => {
					if (this.isCancelled) return;

					// Store the tool call
					lastToolCall = toolCall;
					this.toolCalls.push(lastToolCall);

					// End the tool display stream before calling the tool
					this.autoCodingStreamProcessor.endStream();
				}
			},
				supportsAutocoding);

			// if autocoding is enabled, apply the file changes
			if (applyChanges) {
				try {
					const jsonString = lastToolCall 
						? lastToolCall.function.arguments 
						: sanitizeJsonString(lastFullText);
					const parsedArguments = JSON.parse(jsonString);
					applyFileChanges(parsedArguments);
				} catch (error) {
					console.error('Failed to parse tool call arguments:', error);
				}
			}

			// Add collected tool calls after streaming is complete
			if (this.toolCalls.length > 0) {
				this.sessionManager.getCurrentSession().messages.push({
					role: "assistant",
					content: this.toolCalls,
					name: "Mode.FunctionCall"
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
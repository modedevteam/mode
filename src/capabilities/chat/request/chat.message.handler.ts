/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AIMessage, StreamToken } from '../../../common/llms/llm.client';
import MarkdownIt from 'markdown-it';
import { TextResponseProcessor } from '../response/text.response.processor';
import { AIClient } from '../../../common/llms/llm.client';
import { formatFileContent } from '../../../common/rendering/llm.translation.utils';
import { ChatSessionManager } from './chat.session.handler';
import { HIGHLIGHTED_CODE_START, HIGHLIGHTED_CODE_END, CURRENT_FILE_PATH_START, CURRENT_FILE_PATH_END } from '../../../common/llms/llm.prompt';
import { applyFileChanges } from '../../tools/apply.file.changes';
import { ToolResponseProcessor } from '../response/tool.response.processor';

// New class to handle message processing
export class ChatMessageHandler {
	private textResponseProcessor: TextResponseProcessor;
	private toolProcessor: ToolResponseProcessor;
	private isCancelled = false;
	private toolCalls: any[] = [];

	constructor(
		private readonly _view: vscode.WebviewView,
		private readonly aiClient: AIClient | null,
		private readonly md: MarkdownIt,
		private readonly sessionManager: ChatSessionManager
	) {
		this.textResponseProcessor = new TextResponseProcessor(_view, md);
		this.toolProcessor = new ToolResponseProcessor(_view, md);
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
			let streamStarted = false;

			await this.aiClient!.chat(messages as AIMessage[], {
				onToken: (token) => {
					if (this.isCancelled) return;

					if (!streamStarted) {
						this._view.webview.postMessage({ command: 'chatStream', action: 'startStream' });
						streamStarted = true;
					}

					// Handle tool-complete chunks to properly end tool streaming
					if (token.type === 'tool-complete') {
						this.toolProcessor.endToolStream();
					} else if (token.type === 'tool') {
						this.toolProcessor.processToolChunk(token.content);
					} else if (token.type === 'text') {
						// Only process text chunks if we're not currently processing a tool
						if (!this.toolProcessor.isProcessingTool()) {
							this.textResponseProcessor.processToken(token.content);
						}
					}
				},
				onComplete: (fullText) => {
					if (this.isCancelled) return;
					
					// Only finalize the text stream if there's any text to process.
					if (fullText && fullText.trim().length > 0) {
						this.textResponseProcessor.finalize();
					}

					this.sessionManager.getCurrentSession().messages.push({
						role: "assistant",
							content: fullText,
							name: "Mode.ChatResponse"
					});
				},
				onToolCall: (toolCall) => {
					if (this.isCancelled) return;

					// End the tool display stream before calling the tool
					this.toolProcessor.endToolStream();

					// if autocoding is enabled, apply the file changes
					if (auto) {
						try {
							const parsedArguments = JSON.parse(toolCall.function.arguments);
							toolCall.function.arguments = parsedArguments;
						this.toolCalls.push(toolCall);

						if (toolCall.function.name === 'apply_file_changes') {
							applyFileChanges(parsedArguments, this.textResponseProcessor);
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
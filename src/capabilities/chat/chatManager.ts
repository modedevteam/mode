/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import { SessionManager } from './chatSessionManager';
import { MessageHandler } from './messageHandler';
import { AIClientFactory } from '../../common/llms/aiClientFactory';
import { AIClient, AIMessage } from '../../common/llms/aiClient';
import { AIModelUtils } from '../../common/llms/aiModelUtils';
import { StreamProcessor } from './streamProcessor';
import { ApiKeyManager } from '../../common/llms/aiApiKeyManager';

export class ChatManager {
	private aiClient: AIClient | null = null;
	private md: MarkdownIt;
	private currentModel: string;
	private currentHandler: MessageHandler | null = null;
	private readonly context: vscode.ExtensionContext;

	constructor(
		private readonly _view: vscode.WebviewView,
		private readonly sessionManager: SessionManager,
		context: vscode.ExtensionContext
	) {
		this.md = new MarkdownIt();
		this.currentModel = '';
		this.context = context;
	}

	private async initializeClient(selectedModel: string): Promise<{ success: boolean; message?: string }> {
		if (this.currentModel !== selectedModel || !this.aiClient) {
			const modelInfo = AIModelUtils.getModelInfo(selectedModel)!;
			const provider = modelInfo.provider;
			const apiKey = await new ApiKeyManager(this.context).getApiKey(provider);
			const result = await AIClientFactory.createClient(provider, selectedModel, apiKey, modelInfo.endpoint);
			if (result.success && result.client) {
				this.aiClient = result.client;
				this.currentModel = selectedModel;
			}
			return { success: result.success, message: result.message };
		}
		return { success: true };
	}

	public async sendMessage(
		outputChannel: vscode.OutputChannel,
		message: string,
		images: { id: string; data: string; fileName?: string }[],
		codeSnippets: { fileName: string; range: string; code: string }[] = [],
		fileUrls: string[] = [],
		currentFile: string | null = null,
		selectedModel: string,
		auto: boolean
	): Promise<void> {

		const initResult = await this.initializeClient(selectedModel);

		if (!initResult.success) {
			this._view.webview.postMessage({
				command: 'addChatError',
				role: 'assistant',
				message: initResult.message
			});
			return;
		}

		if (!this.sessionManager.getCurrentSessionId()) {
			this.sessionManager.createNewSession();
		}
		this.currentHandler = new MessageHandler(
			this._view,
			this.aiClient!,
			this.md,
			this.sessionManager
		);
		await this.currentHandler.handleMessage(message, images, codeSnippets, fileUrls, currentFile, auto);
		this.sessionManager.saveSessions();

		// Generate overview
		this.generateSessionOverview(outputChannel, message).then(overview => {
			this.sessionManager.updateCurrentSessionOverview(overview);
		});
	}

	private async generateSessionOverview(outputChannel: vscode.OutputChannel, message: string): Promise<string> {
		if (!this.aiClient) {
			return "New Chat";
		}

		try {
			let overview = '';
			await this.aiClient.chat([
				{ role: "system", "content": "Summarize the current conversation in five or fewer meaningful words. If the conversation cannot be summarized, respond with 'New Chat'." },
				{ role: "user", content: message }
			], {
				onToken: (token: string) => {
					overview += token;
				},
				onComplete: (fullText: string) => {
					overview = fullText;
				}
			});
			return overview || "New Chat";
		} catch (error) {
			return "New Chat";
		}
	}

	public getChatSessions() {
		return this.sessionManager.getChatSessions();
	}

	public loadChatSession(sessionId: string) {
		const session = this.sessionManager.loadChatSession(sessionId);
		if (session) {
			// Clear the current chat in the webview
			this._view.webview.postMessage({ command: 'clearChat' });
			// Render the messages in the session
			session.messages.forEach((message: AIMessage) => {
				if (message.name === 'Mode') {
					if (message.role === 'user') {
						this._view.webview.postMessage({
							command: 'addMessage',
							role: message.role,
							content: message.content
						});
					} else if (message.role === 'assistant') {
						// Process the message content line by line using the stream processor
						const streamProcessor = new StreamProcessor(this._view, this.md, this.sessionManager);
						this._view.webview.postMessage({ command: 'chatStream', action: 'startStream' });
						for (const line of (message.content as string).split('\n')) {
							streamProcessor.processLine(line);
						}
						this._view.webview.postMessage({ command: 'chatStream', action: 'endStream' });
					}
				}
			});
		}
	}

	public stopGeneration() {
		this.currentHandler?.stopGeneration();
	}
}

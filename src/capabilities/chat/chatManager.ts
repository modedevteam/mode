import * as vscode from 'vscode';
import MarkdownIt = require('markdown-it');
import { createMarkdownIt as createMarkdown } from '../../common/rendering/md';
import { SessionManager } from './chatSessionManager';
import { MessageHandler } from './messageHandler';
import { AIClientFactory } from '../../common/llms/aiClientFactory';
import { AIClient } from '../../common/llms/aiClient';
import { AIModel } from '../../common/llms/aiModel';

export class ChatManager {
	private aiClient: AIClient | null = null;
	private md: MarkdownIt;
	private currentModel: string;
	private currentHandler: MessageHandler | null = null;

	constructor(
		private readonly _view: vscode.WebviewView,
		private readonly sessionManager: SessionManager,
		context: vscode.ExtensionContext
	) {
		this.md = createMarkdown();
		AIClientFactory.initialize(context);
		this.currentModel = '';
	}

	private async initializeClient(selectedModel: string): Promise<{ success: boolean; message?: string }> {
		if (this.currentModel !== selectedModel || !this.aiClient) {
			const provider = AIModel.getModelInfo(selectedModel)!.provider;
			const result = await AIClientFactory.createClient(provider, selectedModel);
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
		selectedModel: string
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
			this.sessionManager.getCurrentSession().messages
		);
		await this.currentHandler.handleMessage(outputChannel, message, images, codeSnippets, fileUrls, currentFile);
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
			await this.aiClient.chat(outputChannel, [
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
			session.messages.forEach(message => {
				if ((message.role === 'user' || message.role === 'assistant') && message.name === 'Mode') {
					this._view.webview.postMessage({
						command: 'addMessage',
						role: message.role,
						content: message.content
					});
				}
			});
		}
	}

	public stopGeneration() {
		this.currentHandler?.stopGeneration();
	}
}

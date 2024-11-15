import * as vscode from 'vscode';
import { AIMessage } from '../../common/llms/aiClient';
import MarkdownIt = require('markdown-it');
import * as fs from 'fs';
import { StreamProcessor } from './streamProcessor';
import { AIClient } from '../../common/llms/aiClient';

// New class to handle message processing
export class MessageHandler {
	private streamProcessor: StreamProcessor;
	private isCancelled = false;

	constructor(
		private readonly _view: vscode.WebviewView,
		private readonly aiClient: AIClient | null,
		private readonly md: MarkdownIt,
		private readonly chatSession: AIMessage[]
	) {
		this.streamProcessor = new StreamProcessor(_view, md);
	}

	public stopGeneration() {
		this.isCancelled = true;
		this.aiClient?.stopGeneration();
	}

	public async handleMessage(
		outputChannel: vscode.OutputChannel,
		message: string,
		images: { id: string; data: string; fileName?: string }[],
		codeSnippets: { fileName: string; range: string; code: string }[] = [],
		fileUrls: string[] = [],
		currentFile: string | null = null
	): Promise<void> {
		try {
			this.isCancelled = false;

			// Add the user message, the system message was previously added in chatSessionManager.ts
			this.chatSession.push({ role: "user", content: message, name: "Mode" });

			// Add each image as a separate message
			images.forEach(image => {
				this.chatSession.push({
					role: "user",
					content: image.data,
					type: 'image'
				});
			});

			// Add each code snippet as a separate message
			codeSnippets.forEach(snippet => {
				this.chatSession.push({
					role: "user",
					content: `File: ${snippet.fileName} (${snippet.range})\n\n${snippet.code}`
				});
			});

			// Add current file as a separate message
			if (currentFile) {
				this.chatSession.push({
					role: "user",
					content: `Current File: ${currentFile}`
				});
			}

			// Add each file URL as a separate message with its content, symbols, and URI
			for (const fileUrl of fileUrls) {
				// Convert the file URL to a path using vscode.Uri
				const uri = vscode.Uri.parse(fileUrl);
				const filePath = uri.fsPath;

				// Check if the document is open and get its content including unsaved changes
				const openDocument = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
				const fileContent = openDocument ? openDocument.getText() : fs.readFileSync(filePath, 'utf-8');

				// Get document symbols
				const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeDocumentSymbolProvider', uri);

				// Format symbols as a string
				const symbolsString = symbols?.map(symbol =>
					`${symbol.kind}: ${symbol.name} (${symbol.location.range.start.line}-${symbol.location.range.end.line})`
				).join('\n') || 'No symbols found';

				this.chatSession.push({
					role: "user",
					content: `File URL: ${fileUrl}\nURI: ${uri.toString()}\n\nSymbols:\n${symbolsString}\n\nContent:\n${fileContent}`
				});
			}

			// call LLM provider and stream the response
			let finalRenderedContent = '';
			let isFirstToken = true;
			await this.aiClient!.chat(outputChannel, this.chatSession as AIMessage[], {
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

					// save the fullText for diagnostic purposes
					this.chatSession.push({
						role: "assistant",
						content: fullText,
						name: "Mode.Diagnostics"
					});

					// Remove code_analysis blocks before rendering
					const processedText = fullText.replace(/<code_analysis>[\s\S]*?<\/code_analysis>/g, '');
					finalRenderedContent = this.md.render(processedText);
				}
			});

			// Save the rendered content to the chat session
			if (!this.isCancelled) {
				this.chatSession.push({
					role: "assistant",
					content: finalRenderedContent,
					name: "Mode"
				});

				// Send the rendered content with the endStream message
				this._view.webview.postMessage({
					command: 'chatStream',
					action: 'endStream',
					message: { finalRenderedContent: finalRenderedContent }
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
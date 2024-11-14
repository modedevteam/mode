import * as vscode from 'vscode';
import { ChatManager } from '../../capabilities/chat/chatManager';
import * as path from 'path';
import hljs from 'highlight.js';
import { ChatViewHtmlGenerator } from './chatViewHtmlGenerator';
import { DiffManager } from '../../capabilities/diff/diffManager';
import { ApiKeyManager } from '../../common/llms/aiApiKeyManager';
import { AIModel } from '../../common/llms/aiModel';
import { ErrorMessages } from '../../common/user-messages/errorMessages';
import { safeLanguageIdentifier } from '../../capabilities/context/safeLanguageIdentifier';
import { SearchUtils } from '../../common/io/searchUtils';

export class ModeChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'mode.chatView';
	private _view?: vscode.WebviewView;
	private _chatManager?: ChatManager;
	private _htmlGenerator: ChatViewHtmlGenerator;
	private _modifiedContentMap: Map<string, string> = new Map();
	private _diffManager: DiffManager;
	private _apiKeyManager: ApiKeyManager;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _extensionContext: vscode.ExtensionContext,
		private readonly _outputChannel: vscode.OutputChannel
	) {
		this._htmlGenerator = new ChatViewHtmlGenerator(_extensionUri);
		this._setupContentProvider();
		this._apiKeyManager = new ApiKeyManager(_extensionContext);
		this._diffManager = new DiffManager(this._outputChannel, this._apiKeyManager);
	}

	private _setupContentProvider() {
		const provider = new ModifiedContentProvider(this._modifiedContentMap);
		this._extensionContext.subscriptions.push(
			vscode.workspace.registerTextDocumentContentProvider('modified', provider)
		);
	}

	// This method is called when the webview is first created	
	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		try {
			this._view = webviewView;
			this._chatManager = new ChatManager(webviewView, this._extensionContext);

			// Configure webview options
			webviewView.webview.options = {
				enableScripts: true,
				localResourceRoots: [this._extensionUri]
			};

			// Set the HTML content of the webview
			webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

			// Set up message listener for communication between webview and extension
			webviewView.webview.onDidReceiveMessage(message => {
				switch (message.command) {
					case 'sendMessage':
						this._handleSendMessage(
							message.text,
							message.images,
							message.codeSnippets,
							message.fileUrls,
							message.currentFile,
							message.selectedModel
						);
						break;
					case 'showQuickPick':
						this._handleQuickPickSelection(message.source);
						break;
					case 'openFile':
						this._openFileInEditor(message.fileUri);
						break;
					case 'showChatHistory':
						this.showChatHistory();
						break;
					case 'showDiff':
						this._handleShowDiff(message.code, message.fileUri, message.manual);
						break;
					case 'manageApiKeys':
						vscode.commands.executeCommand('mode.manageApiKeys');
						break;
					case 'cancelMessage':
						this._chatManager?.stopGeneration();
						break;
					case 'openNewChat':
						vscode.commands.executeCommand('mode.openChat');
						break;
					case 'modelSelected':
						AIModel.setLastUsedModel(message.model);
						break;
				}
			});
		} catch (error) {
			this._outputChannel.appendLine(ErrorMessages.RESOLVE_CHAT_UI_ERROR(error));
			this._outputChannel.show();
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		return this._htmlGenerator.generateHtml(webview);
	}

	// Handle sending messages through the chat service
	private async _handleSendMessage(
		message: string,
		images: { id: string; data: string; fileName?: string }[] = [],
		codeSnippets: { fileName: string; range: string; code: string }[] = [],
		fileUrls: string[] = [],
		currentFile: string | null = null,
		selectedModel: string
	) {
		// add the currently opened files to the fileUrls so users don't have to manually add them
		// only include files, not output channel, terminal, etc.
		const openedFileUrls = vscode.window.visibleTextEditors
			.filter(editor => editor.document.uri.scheme === 'file') // Filter to include only file URIs
			.map(editor => editor.document.uri.toString());

		// merge the currently opened files with the manually added files, keeping only unique values
		fileUrls = [...new Set([...fileUrls, ...openedFileUrls])];

		if (this._chatManager) {
			this._chatManager.sendMessage(this._outputChannel, message, images, codeSnippets, fileUrls, currentFile, selectedModel);
		}
	}

	public handleTextSelection() {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const selection = editor.selection;
			const text = editor.document.getText(selection);
			if (text) {
				const document = editor.document;
				const fileName = path.basename(document.fileName);
				const startLine = selection.start.line + 1;
				const endLine = selection.end.line + 1;
				const range = `${startLine}-${endLine}`;

				// Process the text to remove base indentation
				const lines = text.split('\n');
				const nonEmptyLines = lines.filter(line => line.trim().length > 0);
				const minIndent = Math.min(...nonEmptyLines.map(line => {
					const match = line.match(/^\s*/);
					return match ? match[0].length : 0;
				}));
				
				const processedText = lines
					.map(line => line.slice(minIndent))
					.join('\n');

				// Determine the language for syntax highlighting
				const language = safeLanguageIdentifier(editor.document.languageId);

				// Apply syntax highlighting
				let highlightedCode;
				try {
					highlightedCode = hljs.highlight(processedText, { language }).value;
				} catch (error) {
					const errorMessage = ErrorMessages.CODE_HIGHLIGHTING_ERROR(error, language);
					highlightedCode = processedText; // Fallback to plain text if highlighting fails
					this._outputChannel.appendLine(errorMessage);
					this._outputChannel.show();
				}

				// Send a message to the webview to update the context pill and add the highlighted code container
				this._view?.webview.postMessage({
					command: 'addCodePill',
					fileName: fileName,
					range: range,
					highlightedCode: highlightedCode
				});
			}
		}

		// Always focus the text area, regardless of whether there's an active editor or selected text
		this._view?.webview.postMessage({ command: 'focusTextArea' });
	}

	public sendMessageToWebview(message: any) {
		this._view?.webview.postMessage(message);
	}

	public handleCurrentFileSelection() {
		// Check if there is an active editor and send the file name to the webview
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const fileName = path.basename(editor.document.fileName);
			const fileUri = vscode.Uri.file(editor.document.uri.fsPath).toString(); // Normalize URI
			this.sendMessageToWebview({ command: 'addFilePill', fileName, fileUri, currentFile: true });
		}
	}

	private async _handleQuickPickSelection(source?: string) {
		try {
			const selectedFile = await SearchUtils.showFileQuickPick();
			if (!selectedFile) {
				this.sendMessageToWebview({
					command: 'addFilePill',
					fileName: undefined,
					fileUri: undefined,
					...(source && { source })
				});
				return;
			}
	
			const fileUri = SearchUtils.createFileUri(selectedFile);
			if (!fileUri) {
				this._outputChannel.appendLine('Error: Invalid file URI');
				return;
			}
	
			const fileExtension = path.extname(selectedFile.label).toLowerCase();
			const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
			const isImage = imageExtensions.includes(fileExtension);
	
			if (isImage) {
				try {
					const uri = vscode.Uri.parse(fileUri);
					const imageBuffer = await vscode.workspace.fs.readFile(uri);
	
					// Determine MIME type based on file extension
					const mimeType = this._getMimeType(fileExtension);
					
					// Convert to base64
					const base64Image = `data:${mimeType};base64,${Buffer.from(imageBuffer).toString('base64')}`;
	
					this.sendMessageToWebview({
						command: 'addImagePill',
						fileName: selectedFile.label,
						imageData: base64Image,
						fileUri,
						...(source && { source })
					});
				} catch (error) {
					this._outputChannel.appendLine(`Error processing image file: ${error}`);
					this._outputChannel.show();
				}
			} else {
				this.sendMessageToWebview({
					command: 'addFilePill',
					fileName: selectedFile.label,
					fileUri,
					...(source && { source })
				});
			}
		} catch (error) {
			this._outputChannel.appendLine(`Error selecting file: ${error}`);
			this._outputChannel.show();
		}
	}
	
	// Helper method to determine MIME type
	private _getMimeType(extension: string): string {
		const mimeTypes: { [key: string]: string } = {
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.png': 'image/png',
			'.gif': 'image/gif',
			'.webp': 'image/webp',
			'.bmp': 'image/bmp'
		};
		return mimeTypes[extension] || 'application/octet-stream';
	}

	// New method to open a file in the editor
	private async _openFileInEditor(fileUri: string) {
		const uri = vscode.Uri.parse(fileUri);
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(document, { preview: false }); // Open in a new tab
	}

	public resetChatSession() {
		this._chatManager?.resetSession(); // Call resetSession on the ChatService
		this._view?.webview.postMessage({ command: 'clearChat' }); // Clear the chat in the webview
	}

	public showChatHistory() {
		if (this._chatManager) {
			const sessions = this._chatManager.getChatSessions();
			const quickPickItems = sessions.map(session => ({
				label: session.overview || 'Chat at ' + new Date(session.systemTime).toLocaleString(),
				description: this.getTimeAgo(session.systemTime),
				detail: this.getFirstUserMessage(session.messages) || 'No user messages',
				id: session.id
			}));

			// Sort the quickPickItems in descending order based on systemTime
			quickPickItems.sort((a, b) => {
				const timeA = new Date(sessions.find(s => s.id === a.id)?.systemTime || 0).getTime();
				const timeB = new Date(sessions.find(s => s.id === b.id)?.systemTime || 0).getTime();
				return timeB - timeA;
			});

			vscode.window.showQuickPick(quickPickItems, {
				placeHolder: 'Select a chat session',
				matchOnDescription: true,
				matchOnDetail: true
			}).then(selected => {
				if (selected) {
					this._chatManager?.loadChatSession(selected.id);
					this._view?.webview.postMessage({ command: 'loadChatSession', sessionId: selected.id });
				}
			});
		}
	}

	private getTimeAgo(timestamp: number): string {
		const now = Date.now();
		const diffInSeconds = Math.floor((now - timestamp) / 1000);

		if (diffInSeconds < 60) {
			return 'just now';
		} else if (diffInSeconds < 3600) {
			const minutes = Math.floor(diffInSeconds / 60);
			return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
		} else if (diffInSeconds < 86400) {
			const hours = Math.floor(diffInSeconds / 3600);
			return `${hours} hour${hours > 1 ? 's' : ''} ago`;
		} else {
			const days = Math.floor(diffInSeconds / 86400);
			return `${days} day${days > 1 ? 's' : ''} ago`;
		}
	}

	private getFirstUserMessage(messages: any[]): string {
		const userMessage = messages.find(msg => msg.role === 'user');
		return userMessage ? userMessage.content.toString() : '';
	}

	private async _handleShowDiff(rawCode: string, fileUri: string, manual: boolean) {
		await this._diffManager.showDiff(rawCode, fileUri, manual);
	}

	public clearModifiedContent(uri: vscode.Uri) {
		this._modifiedContentMap.delete(uri.toString());
	}

	public handleAskMode(diagnosticMessage: string, lineNumber: number) {
		const question = lineNumber !== 0
			? `Can you help me with this error on line ${lineNumber}: "${diagnosticMessage}"`
			: `Can you help me with this error: "${diagnosticMessage}"`;

		this._view?.webview.postMessage({
			command: 'askMode',
			question: question
		});
	}
}

class ModifiedContentProvider implements vscode.TextDocumentContentProvider {
	constructor(private modifiedContentMap: Map<string, string>) { }

	provideTextDocumentContent(uri: vscode.Uri): string {
		const originalUri = uri.with({ scheme: 'file' });
		return this.modifiedContentMap.get(originalUri.toString()) || '';
	}
}

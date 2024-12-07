import * as vscode from 'vscode';
import { ChatManager } from '../../capabilities/chat/chatManager';
import * as path from 'path';
import { ChatViewHtmlGenerator } from './chatViewHtmlGenerator';
import { DiffManager } from '../../capabilities/diff/diffManager';
import { ApiKeyManager } from '../../common/llms/aiApiKeyManager';
import { AIModelUtils } from '../../common/llms/aiModelUtils';
import { ErrorMessages } from '../../common/user-messages/errorMessages';
import { SearchUtils } from '../../common/io/searchUtils';
import { SessionManager } from '../../capabilities/chat/chatSessionManager';
import { CodeSelection, PillRenderer } from '../../common/rendering/pills';

export class ModeChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'mode.chatView';
	private _view?: vscode.WebviewView;
	private _chatManager?: ChatManager;
	private _htmlGenerator: ChatViewHtmlGenerator;
	private _modifiedContentMap: Map<string, string> = new Map();
	private _diffManager: DiffManager;
	private _apiKeyManager: ApiKeyManager;
	private _sessionManager: SessionManager;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _extensionContext: vscode.ExtensionContext,
		private readonly _outputChannel: vscode.OutputChannel
	) {
		this._htmlGenerator = new ChatViewHtmlGenerator(_extensionUri);
		this._setupContentProvider();
		this._apiKeyManager = new ApiKeyManager(_extensionContext);
		this._sessionManager = new SessionManager(_extensionContext);
		this._diffManager = new DiffManager(this._outputChannel, this._apiKeyManager, this._sessionManager);
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
			this._chatManager = new ChatManager(webviewView, this._sessionManager, this._extensionContext);

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
						this._handleShowDiff(message.code, message.fileUri, message.codeId);
						break;
					case 'manageApiKeys':
						vscode.commands.executeCommand('mode.manageApiKeys');
						break;
					case 'cancelMessage':
						this._chatManager?.stopGeneration();
						break;
					case 'chatSession':
						if (message.action === 'new') {
							vscode.commands.executeCommand('mode.openChat');
						}
						break;
					case 'modelSelected':
						AIModelUtils.setLastUsedModel(message.model);
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
		// Check if the selected model supports large context
		const modelSupportsContext = AIModelUtils.supportsLargeContext(selectedModel);

		if (modelSupportsContext) {
			// Add the currently opened files to the fileUrls so users don't have to manually add them
			// Only include files, not output channel, terminal, etc.
			const openedFileUrls = vscode.window.visibleTextEditors
				.filter(editor => editor.document.uri.scheme === 'file') // Filter to include only file URIs
				.map(editor => editor.document.uri.toString());

			// Merge the currently opened files with the manually added files, keeping only unique values
			fileUrls = [...new Set([...fileUrls, ...openedFileUrls])];
		} else {
			// Clear fileUrls if model does not support large context
			fileUrls = [];
		}

		if (this._chatManager) {
			// Check if the selected model supports images
			const modelSupportsImages = AIModelUtils.supportsVision(selectedModel);
			const imagesToSend = modelSupportsImages ? images : [];

			this._chatManager.sendMessage(this._outputChannel, message, imagesToSend, codeSnippets, fileUrls, currentFile, selectedModel);
		}
	}

	public handleTextSelection() {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const selection = editor.selection;
			const text = editor.document.getText(selection);
			if (text) {
				const codeSelection: CodeSelection = {
					text,
					fileName: path.basename(editor.document.fileName),
					startLine: selection.start.line + 1,
					endLine: selection.end.line + 1,
					language: editor.document.languageId
				};

				const processedCode = PillRenderer.processCodeSelection(
					codeSelection,
					this._outputChannel
				);

				this._view?.webview.postMessage({
					command: 'addCodePill',
					...processedCode
				});
			}
		}

		// Always focus the text area, regardless of whether there's an active editor or selected text
		this._view?.webview.postMessage({ command: 'focusTextArea' });
	}

	findCommonIndentation(lines: string[]): number {
		const nonEmptyLines = lines.filter(line => line.trim().length > 0);
		if (nonEmptyLines.length === 0) return 0;

		// Count leading whitespace characters
		const leadingSpaces = nonEmptyLines.map(line => {
			const match = line.match(/^[\t ]*/);
			return match ? match[0].length : 0;
		});

		return Math.min(...leadingSpaces);
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
		this._sessionManager.saveSessions();
		this._sessionManager.createNewSession();
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

	private async _handleShowDiff(rawCode: string, fileUri: string, codeId: string) {
		await this._diffManager.showDiff(rawCode, fileUri, codeId);
	}

	public clearModifiedContent(uri: vscode.Uri) {
		this._modifiedContentMap.delete(uri.toString());
	}

	public async handleAskMode(diagnosticMessage: string, lineNumber: number) {
		const editor = vscode.window.activeTextEditor;
		if (editor && lineNumber > 0) {
			try {
				// Create a selection for the specific line
				const line = editor.document.lineAt(lineNumber - 1);
				const selection = new vscode.Selection(
					line.range.start,
					line.range.end
				);

				// Set the editor selection and reveal the line
				editor.selection = selection;
				editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);

				// Create CodeSelection object
				const codeSelection: CodeSelection = {
					text: editor.document.getText(selection),
					fileName: path.basename(editor.document.fileName),
					startLine: lineNumber,
					endLine: lineNumber,
					language: editor.document.languageId
				};

				// Use PillRenderer to process the code selection
				const processedCode = PillRenderer.processCodeSelection(
					codeSelection,
					this._outputChannel
				);

				// Add the code pill
				this._view?.webview.postMessage({
					command: 'addCodePill',
					...processedCode
				});
			} catch (error) {
				this._outputChannel.appendLine(`Error processing code selection in Ask mode: ${error}`);
			}

			// Construct and send the question
			const question = `Can you help me with this error on line ${lineNumber}: "${diagnosticMessage}"\n`;
			this._view?.webview.postMessage({
				command: 'askMode',
				question: question
			});
		} else if (!editor) {
			// Handle case when no editor is active
			const question = `Can you help me with this error: "${diagnosticMessage}"`;
			this._view?.webview.postMessage({
				command: 'askMode',
				question: question
			});
		}
	}

	public reloadView() {
		if (this._view) {
			// Reset the HTML content of the webview
			this._view.webview.html = this._getHtmlForWebview(this._view.webview);
		}
	}
}

class ModifiedContentProvider implements vscode.TextDocumentContentProvider {
	constructor(private modifiedContentMap: Map<string, string>) { }

	provideTextDocumentContent(uri: vscode.Uri): string {
		const originalUri = uri.with({ scheme: 'file' });
		return this.modifiedContentMap.get(originalUri.toString()) || '';
	}
}

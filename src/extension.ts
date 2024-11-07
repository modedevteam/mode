import * as vscode from 'vscode';
import { ModeChatViewProvider } from './browser/chatViewProvider';
import { WelcomeViewProvider } from './browser/welcomeViewProvider';
import { ApiKeyManager } from './common/apiKeyManager';
import { AIModel } from './common/aiModel';
import { AskModeCodeActionProvider } from './browser/askModeCodeActionProvider';
import { ErrorMessages } from './common/errorMessages';

export function activate(context: vscode.ExtensionContext) {
	// Create output channel
	const outputChannel = vscode.window.createOutputChannel('Mode');
	context.subscriptions.push(outputChannel);
	
	// Initialize default AI model settings
	AIModel.initialize(context);

	// Initialize API Key Manager
	const apiKeyManager = new ApiKeyManager(context);
	
	// Register API Key Manager commands
	context.subscriptions.push(...apiKeyManager.registerCommands());

	// Register the new sidebar view
	const provider = new ModeChatViewProvider(context.extensionUri, context, outputChannel);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ModeChatViewProvider.viewType, provider)
	);

	// Register the command to open Mode
	const disposable = vscode.commands.registerCommand('mode.openChat', async (diagnosticMessage?: string, lineNumber?: number) => {
		try {
			await vscode.commands.executeCommand('mode.chatView.focus');
			provider.resetChatSession();
			provider.handleTextSelection();
			provider.handleCurrentFileSelection();

			// Handle the diagnostic message and line number if they're provided
			if (diagnosticMessage) {
				provider.handleAskMode(diagnosticMessage, lineNumber ?? 0);
			}
		} catch (error) {
			outputChannel.appendLine(ErrorMessages.OPEN_CHAT_EXTENSION_ERROR(error));
			outputChannel.show();
		}
	});

	// Dispose of the disposables when the extension is deactivated
	context.subscriptions.push(disposable);

	// Listen for changes in the active text editor
	vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor) {
			const fileUri = editor.document.uri.toString();
			provider.sendMessageToWebview({ command: 'activeEditorChanged', fileUri });
		}
	});

	// Add this new command registration
	context.subscriptions.push(
		vscode.commands.registerCommand('mode.showChatHistory', () => {
			provider.showChatHistory();
		})
	);

	// Clean up modified content when closing the diff editor
	// TODO: Move this into @applyChangesHandler
	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument((document) => {
			if (document.uri.scheme === 'modified') {
				const originalUri = document.uri.with({ scheme: 'file' });
				provider.clearModifiedContent(originalUri);
			}
		})
	);

	// Register the code action provider
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider('*', new AskModeCodeActionProvider(provider), {
			providedCodeActionKinds: AskModeCodeActionProvider.providedCodeActionKinds
		})
	);

	// Create the welcome view provider
	const welcomeProvider = new WelcomeViewProvider(context.extensionUri);

	// Add a command to show the welcome page
	context.subscriptions.push(
		vscode.commands.registerCommand('mode.showWelcomePage', () => {
			welcomeProvider.show();
		})
	);

	// Show the welcome page when the extension is activated for the first time
	if (context.globalState.get('modeWelcomeShown') !== true) {
		vscode.commands.executeCommand('mode.showWelcomePage');
		context.globalState.update('modeWelcomeShown', true);
	}
}

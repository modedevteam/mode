import * as vscode from 'vscode';
import { ModeChatViewProvider } from './browser/chat/chatViewProvider';
import { WelcomeViewProvider } from './browser/welcome/welcomeViewProvider';
import { ApiKeyManager } from './common/llms/aiApiKeyManager';
import { AIModel } from './common/llms/aiModel';
import { AskModeCodeActionProvider } from './capabilities/quickfix/askModeCodeActionProvider';
import { ErrorMessages } from './common/user-messages/errorMessages';
import { registerInstance } from './capabilities/licensing/instanceManager';
import { LicenseManager } from './capabilities/licensing/licenseManager';

// Add at the top of the file, outside the activate function
const LICENSE_CHECK_INTERVAL = 1000 * 60 * 60 * 24; // 24 hours in milliseconds

export async function activate(context: vscode.ExtensionContext) {

	// Register instance ID
	const instanceId = registerInstance(context);

	// Validate license
	const licenseManager = new LicenseManager(context);
	const isLicenseValid = await licenseManager.handleLicense();
	
	if (!isLicenseValid) {
		return;
	}

	// Add periodic license check
	const intervalHandle = setInterval(async () => {
		const isStillValid = await licenseManager.handleLicense();
		if (!isStillValid) {
			// Clear the interval
			clearInterval(intervalHandle);
			// Deactivate the extension
			vscode.commands.executeCommand('workbench.action.reloadWindow');
		}
	}, LICENSE_CHECK_INTERVAL);

	// Add the interval handle to subscriptions so it gets cleaned up on deactivation
	context.subscriptions.push({ dispose: () => clearInterval(intervalHandle) });

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

export async function deactivate(context: vscode.ExtensionContext) {
	// Deactivate the license
    const licenseManager = new LicenseManager(context);
    await licenseManager.deactivateLicense();
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { ModeChatViewProvider } from './browser/chat/chatViewProvider';
import { ApiKeyManager } from './common/llms/aiApiKeyManager';
import { AIModelUtils } from './common/llms/aiModelUtils';
import { AskModeCodeActionProvider } from './capabilities/quickfix/askModeCodeActionProvider';
import { ErrorMessages } from './common/user-messages/errorMessages';
import { LanguageServerClient } from './capabilities/autocomplete/client';

// Add at the top of the file, outside the activate function
const LICENSE_CHECK_INTERVAL = 1000 * 60 * 60 * 24; // 24 hours in milliseconds

let languageClient: LanguageServerClient;

export async function activate(context: vscode.ExtensionContext) {

	// Create output channel
	const outputChannel = vscode.window.createOutputChannel('Mode');
	context.subscriptions.push(outputChannel);

	// Initialize default AI model settings
	AIModelUtils.initialize(context);

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
			// Reload the view
			provider.reloadView();

			// Focus the chat view
			await vscode.commands.executeCommand('mode.chatView.focus');

			// Reset the chat session
			provider.resetChatSession();

			// Handle text selection
			provider.handleTextSelection();

			// Handle the current file selection
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

	// Initialize the language server client
	const serverModule = context.asAbsolutePath(
		path.join('out', 'capabilities', 'autocomplete', 'server.js')
	);
	languageClient = new LanguageServerClient(serverModule, context);
	await languageClient.start();
}

export async function deactivate(context: vscode.ExtensionContext) {
	return languageClient?.stop();
}

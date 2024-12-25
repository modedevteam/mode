/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AIModelUtils } from '../../common/llms/aiModelUtils';

export class ChatViewHtmlGenerator {
	constructor(private readonly _extensionUri: vscode.Uri) { }

	public generateHtml(webview: vscode.Webview): string {
		// Get URIs for resources
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css'));
		const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'browser', 'scripts', 'webviewScript.js'));
		const highlightJsTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
			? 'atom-one-dark.css'
			: 'atom-one-light.css';

		const highlightJsCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'highlight.js', 'styles', highlightJsTheme));

		// Construct the HTML
		let html = `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:;">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Chat View</title>
				<link href="${styleUri}" rel="stylesheet" />
				<link href="${codiconsUri}" rel="stylesheet" />
				<link href="${highlightJsCssUri}" rel="stylesheet" />
			</head>
			<body>`;

		html += this._getChatOutputHtml();
		html += this._getChatInputContainerHtml();

		html += `
				<script src="${scriptUri}"></script>
			</body>
			</html>`;

		return html;
	}

	private _getChatOutputHtml(): string {
		return '<div id="chat-output"></div>';
	}

	private _getChatInputContainerHtml(): string {
		let html = '<div id="chat-input-container">';
		html += '<div id="context-container"></div>';
		html += this._getIconContainerTopHtml();
		html += this._getChatInputHtml();
		html += this._getIconContainerHtml();
		html += '</div>';
		return html;
	}

	private _getIconContainerTopHtml(): string {
		return `
			<div id="icon-container-top">
				<div class="left-icons">
					<button id="add-file-button" class="icon-button" title="Add context"><i class="codicon codicon-file-add"></i></button>
					<!-- <button id="add-mention-button" class="icon-button"><i class="codicon codicon-mention"></i></button> -->
					<button id="add-file-media-button" class="icon-button" title="Add an image"><i class="codicon codicon-file-media"></i></button>
					<input type="file" id="image-upload" accept="image/*" style="display: none;">
					${this._getDropdownHtml()}
				</div>
				<div class="right-icons">
					<button id="new-chat-button" class="icon-button" title="New chat (⌘L)"><i class="codicon codicon-add"></i></button>
					<button id="history-button" class="icon-button" title="Show previous chats"><i class="codicon codicon-history"></i></button>
					<button id="manage-keys-button" class="icon-button" title="Manage API Keys"><i class="codicon codicon-key"></i></button>
				</div>
			</div>`;
	}

	private _getDropdownHtml(): string {
		const models = AIModelUtils.getAllModels();
		const defaultModel = AIModelUtils.getLastUsedModel();
		
		const modelOptions = Object.entries(models)
			.map(([modelId, modelData]) => {
				const displayName = modelData.displayName || modelId;
				return `
					<a href="#" data-option="${modelId}">
						${displayName}
					</a>
				`;
			})
			.join('');

		const defaultDisplayName = models[defaultModel]?.displayName || defaultModel;

		return `
			<div class="dropdown">
				<button class="dropdown-toggle" title="Select model">
					<span class="selected-model" data-model-id="${defaultModel}">${defaultDisplayName}</span>
					<i class="codicon codicon-chevron-down"></i>
				</button>
				<div class="dropdown-content">
					${modelOptions}
				</div>
			</div>`;
	}

	private _getChatInputHtml(): string {
		return `
			<div id="chat-input">
				<textarea id="message-input" placeholder="Ask Anything" rows="1"></textarea>
			</div>`;
	}

	private _getIconContainerHtml(): string {
		return `
			<div id="icon-container">
				<div class="right-aligned-buttons">
					<button id="send-button" class="icon-button" disabled title="Send (enter)"><i class="codicon codicon-comment-discussion"></i></button>
					<!-- <button id="search-button" class="icon-button"><i class="codicon codicon-search-fuzzy"></i></button> -->
				</div>
			</div>`;
	}
}

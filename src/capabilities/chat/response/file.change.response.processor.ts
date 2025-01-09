/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import { MarkdownRenderer } from '../../../common/rendering/markdown.renderer';

export class FileChangeResponseProcessor {
	private buffer: string = '';
	private markdownRenderer: MarkdownRenderer;

	constructor(
		private readonly _view: vscode.WebviewView,
		private readonly md: MarkdownIt
	) {
		this.markdownRenderer = new MarkdownRenderer(_view, md);
	}

	startChange() {
		this.markdownRenderer.startMarkdownBlock();
	}

	processToken(token: string) {
		this.buffer += token;
		// Process the token through markdown renderer
		this.markdownRenderer.processMarkdownToken(token);
	}

	endChange() {
		this.markdownRenderer.endMarkdownBlock();
		this.buffer = '';
	}
}

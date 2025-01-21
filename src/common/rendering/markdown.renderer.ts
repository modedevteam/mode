/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';

export class MarkdownRenderer {
    private collectedMarkdownTokens: string[] = [];

    constructor(
        private readonly _view: vscode.WebviewView,
        private readonly md: MarkdownIt
    ) { }

    public processMarkdownToken(token: string): void {
        // Add token to buffer
        this.collectedMarkdownTokens.push(token);

        // Send entire buffer to be rendered each time there's a new token.
        // This is a bit wasteful, but it's easier to implement and looks pleasing to the user.
        // Other if we just send every token individually (and the whole rendered buffer occasionally), we need to address
        // that the existing rendered content is wrapped in a <p> tag and new tokens will be added to a new line,
        // which isn't as pleasing to the user.
        this.sendBufferedMarkdownTokens();
    }

    private sendBufferedMarkdownTokens(action: string = 'addMarkdownLine'): void {
        const bufferedContent = this.collectedMarkdownTokens.join('');
        const renderedBufferedContent = this.md.render(bufferedContent);
        this._view.webview.postMessage({
            command: 'chatStream',
            action: action,
            lines: renderedBufferedContent
        });
    }

    public startMarkdownBlock(): void {
        this._view.webview.postMessage({ command: 'chatStream', action: 'startMarkdownBlock' });
    }

    public endMarkdownBlock(value?: string): void {
        
        // If there's a value, use that over what's in the buffer
        if (value) {
            this._view.webview.postMessage({
                command: 'chatStream',
                action: 'endMarkdownBlock',
                lines: this.md.render(value)
            });
        } else {
            this.sendBufferedMarkdownTokens('endMarkdownBlock');
        }

        // Clear the collected markdown tokens
        this.collectedMarkdownTokens = [];
    }
}

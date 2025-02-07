/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import { MarkdownRenderer } from '../../../common/rendering/markdown.renderer';
import { FileChangesResponseProcessor } from './file.changes.response.processor';

export class StreamResponseProcessor {
    private _isProcessingTool = false;
    private isCapturingExplanation = false;
    private isCapturingChanges = false;
    private buffer = '';
    private markdownRenderer: MarkdownRenderer;
    private fileChangesProcessor: FileChangesResponseProcessor;

    constructor(
        private readonly _view: vscode.WebviewView,
        private readonly md: MarkdownIt
    ) {
        this.markdownRenderer = new MarkdownRenderer(_view, md);
        this.fileChangesProcessor = new FileChangesResponseProcessor(_view, md);
    }

    public startStream() {
        this._view.webview.postMessage({ command: 'chatStream', action: 'startStream' });
	}

    public processToken(chunkText: string) {

        if (!this._isProcessingTool) {
            this._isProcessingTool = true;
        }

        // Append the new chunk to the buffer
        this.buffer += chunkText;

        // Check for explanation in accumulated buffer
        if (this.buffer.match(/{"explanation":(\s*)"/) && !this.isCapturingExplanation) {
            this.isCapturingExplanation = true;
            this.markdownRenderer.startMarkdownBlock();
            this.buffer = this.buffer.replace(/{"explanation":(\s*)"/, '');
        }

        // Check for changes array in accumulated buffer
        if (this.buffer.match(/,(\s*)"changes"(\s*):(\s*)\[/) && !this.isCapturingChanges) {
            this.isCapturingChanges = true;
            this.buffer = this.buffer.replace(/,(\s*)"changes"(\s*):(\s*)\[/, '');
        }

        if (this.isCapturingExplanation) {
            const quoteIndex = this.buffer.indexOf('"');
            if (quoteIndex !== -1) {
                if (quoteIndex > 0) {
                    // Convert escaped newlines to actual newlines before processing
                    const processedText = this.buffer.substring(0, quoteIndex).replace(/\\n/g, '\n');
                    this.markdownRenderer.processMarkdownToken(processedText);
                }
                this.isCapturingExplanation = false;
                this.markdownRenderer.endMarkdownBlock();
                this.buffer = this.buffer.substring(quoteIndex + 1);
                return;
            }
            // Convert escaped newlines for the buffer too
            const processedBuffer = this.buffer.replace(/\\n/g, '\n');
            this.markdownRenderer.processMarkdownToken(processedBuffer);
            this.buffer = '';
        }

        if (this.isCapturingChanges) {
            // Process the entire buffer as part of changes
            this.fileChangesProcessor.processToken(this.buffer);
            this.buffer = '';
            // Changes capture will be stopped by endToolStream()
        }
    }

    public endStream() {
        if (this.isCapturingChanges) {
            this.fileChangesProcessor.endFileChanges();
        }
        this._isProcessingTool = false;
        this.isCapturingExplanation = false;
        this.isCapturingChanges = false;
        this.buffer = '';
    }

    public isProcessingTool(): boolean {
        return this._isProcessingTool;
    }
} 
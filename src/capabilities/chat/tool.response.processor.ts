/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import { MarkdownRenderer } from '../../common/rendering/markdown.renderer';
import { FILE_CHANGE_END, FILE_CHANGE_START, FILE_PATH_END, FILE_PATH_START, LANGUAGE_END, LANGUAGE_START, REPLACE_END, REPLACE_START, SEARCH_END, SEARCH_START } from '../../common/llms/llm.prompt';

const EVENT_TYPE_CHANGES_START = 'changes_start'; // marks the start of all changes
const EVENT_TYPE_CHANGES_END = 'changes_end'; // marks the end of all changes
const EVENT_TYPE_CHANGE_START = 'change_start'; // marks the start of a single change
const EVENT_TYPE_CHANGE_END = 'change_end'; // marks the end of a single change
const EVENT_TYPE_EXPLANATION = 'explanation';
const EVENT_TYPE_LANGUAGE = 'language';
const EVENT_TYPE_FILE_PATH = 'file_path';
const EVENT_TYPE_SEARCH_CONTENT = 'search_content';
const EVENT_TYPE_REPLACE_CONTENT = 'replace_content';

export class ToolResponseProcessor {
    private _isProcessingTool = false;
    private isCapturingExplanation = false;
    private buffer = '';
    private markdownRenderer: MarkdownRenderer;

    constructor(
        private readonly _view: vscode.WebviewView,
        private readonly md: MarkdownIt
    ) {
        this.markdownRenderer = new MarkdownRenderer(_view, md);
    }

    public processToolChunk(chunkText: string) {
        if (!this._isProcessingTool) {
            this._isProcessingTool = true;
        }

        // Append the new chunk to the buffer
        this.buffer += chunkText;

        // Check for explanation in accumulated buffer, including the opening '{'
        if (this.buffer.includes('{"explanation":"') && !this.isCapturingExplanation) {
            this.isCapturingExplanation = true;
            this.markdownRenderer.startMarkdownBlock();
            // Remove the explanation marker from the buffer
            this.buffer = this.buffer.replace('{"explanation":"', '');
        }

        if (this.isCapturingExplanation) {
            const quoteIndex = this.buffer.indexOf('"');
            if (quoteIndex !== -1) {
                // Process everything before the quote
                if (quoteIndex > 0) {
                    this.markdownRenderer.processMarkdownToken(this.buffer.substring(0, quoteIndex));
                }
                this.isCapturingExplanation = false;
                this.markdownRenderer.endMarkdownBlock();
                // Clear processed content from buffer, keeping anything after the quote
                this.buffer = this.buffer.substring(quoteIndex + 1);
                return;
            }
            // If no quote found, process the entire buffer
            this.markdownRenderer.processMarkdownToken(this.buffer);
            this.buffer = '';
        }
    }

    public endToolStream() {
        this._isProcessingTool = false;
        this.isCapturingExplanation = false;
        this.buffer = '';
    }

    public isProcessingTool(): boolean {
        return this._isProcessingTool;
    }
} 
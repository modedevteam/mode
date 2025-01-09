/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { detectFileNameUri } from '../../../common/io/file.utils';
import { ChatSessionManager } from '../request/chat.session.handler';
import { isChatPrePromptDisabled, isPromptOverrideEmpty } from '../../../common/config.utils';
import { 
	FILE_CHANGE_END, 
	FILE_CHANGE_START, 
	REPLACE_END, 
	REPLACE_START, 
	SEARCH_START,
	SEARCH_END, 
	FILE_PATH_START,
	FILE_PATH_END,
	LANGUAGE_MATCH
} from '../../../common/llms/llm.prompt';
import { Logger } from '../../../common/logging/logger';

// New StreamProcessor class
export class TextResponseProcessor {
	private isInRegularCodeBlock = false;
	private isInMergeCodeBlock = false;
	private isInSearchBlock = false;
	private isInReplaceBlock = false;
	private currentLanguage = '';
	private buffer = '';
	private renderedContent = '';
	private isExpectingFilePath = false;
	private isInAnalysisBlock = false;
	private tempFilePath: string | null = null;
	private isExpectingLanguage = false;
	private filename: string | null = null;
	private fileUri: string | null = null;
	private collectedCodeLines: string[] = [];
	private collectedMarkdownLines: string[] = [];
	private collectedSearchLines: string[] = [];
	private collectedReplaceLines: string[] = [];
	private readonly logger = Logger.getInstance();

	constructor(
		private readonly _view: vscode.WebviewView,
		private readonly md: MarkdownIt,
		private readonly _sessionManager: ChatSessionManager
	) { }

	public async processToken(token: string): Promise<void> {
		this.buffer += token;

		// Process complete lines if we have any
		while (this.buffer.includes('\n')) {
			const newlineIndex = this.buffer.indexOf('\n');
			const line = this.buffer.slice(0, newlineIndex);
			this.buffer = this.buffer.slice(newlineIndex + 1);
			this.processLine(line);
		}
	}

	/*
	 * Process a single line of text
	 * The LLM may return a code block in the markdown output (when explaining code) or in the code_changes block
	 * when suggesting changes to code.
	 */
	public processLine(line: string): void {
		this.logger.log(line);
		if (this.ignoreAnalysisBlocks(line)) {
			return;
		}

		// Handle search block start
		if (line.includes(SEARCH_START)) {
			this.isInSearchBlock = true;
			this.endMarkdownBlock();
			
			// Extract content between SEARCH_START and SEARCH_END if both exist in the same line
			if (line.includes(SEARCH_END)) {
				const startIndex = line.indexOf(SEARCH_START) + SEARCH_START.length;
				const endIndex = line.indexOf(SEARCH_END);
				const content = line.substring(startIndex, endIndex).trim();
				if (content) {
					this.collectedSearchLines.push(content);
				}
				this.isInSearchBlock = false;
				return;
			}

			// Process remaining content after SEARCH_START
			const remainingContent = line.substring(line.indexOf(SEARCH_START) + SEARCH_START.length);
			if (remainingContent.trim()) {
				this.collectedSearchLines.push(remainingContent);
			}
			return;
		}

		// Handle search block end
		if (line.includes(SEARCH_END)) {
			// Process content before SEARCH_END
			const contentBeforeEnd = line.substring(0, line.indexOf(SEARCH_END));
			if (contentBeforeEnd.trim()) {
				this.collectedSearchLines.push(contentBeforeEnd);
			}
			this.isInSearchBlock = false;
			return;
		}

		// Handle replace block start
		if (line.includes(REPLACE_START)) {
			this.isInReplaceBlock = true;
			this.endMarkdownBlock();
			
			// Extract content between REPLACE_START and REPLACE_END if both exist in the same line
			if (line.includes(REPLACE_END)) {
				const startIndex = line.indexOf(REPLACE_START) + REPLACE_START.length;
				const endIndex = line.indexOf(REPLACE_END);
				const content = line.substring(startIndex, endIndex).trim();
				if (content) {
					this.collectedReplaceLines.push(content);
					this.processCodeLine(content);
				}
				this.isInReplaceBlock = false;
				return;
			}

			// Process remaining content after REPLACE_START
			const remainingContent = line.substring(line.indexOf(REPLACE_START) + REPLACE_START.length);
			if (remainingContent.trim()) {
				this.collectedReplaceLines.push(remainingContent);
				this.processCodeLine(remainingContent);
			}
			return;
		}

		// Handle replace block end
		if (line.includes(REPLACE_END)) {
			// Process content before REPLACE_END
			const contentBeforeEnd = line.substring(0, line.indexOf(REPLACE_END));
			if (contentBeforeEnd.trim()) {
				this.collectedReplaceLines.push(contentBeforeEnd);
				this.processCodeLine(contentBeforeEnd);
			}
			this.isInReplaceBlock = false;
			return;
		}

		// Detect start of markdown code block
		if (line.trim().startsWith('```')) {
			this.isInRegularCodeBlock = !this.isInRegularCodeBlock;
			if (this.isInRegularCodeBlock) {
				// Close the current markdown block
				this.endMarkdownBlock(); 

				// Extract language if specified after ```
				const language = line.trim().slice(3).trim();
				this.currentLanguage = language || '';
				// Signal the start of a regular code block
				this._view.webview.postMessage({
					command: 'chatStream',
					action: 'startCodeBlock',
					language: this.currentLanguage || undefined
				});
			} else {
				this.endCodeBlock();

				// Open a new markdown block after a code block ends
				this.startMarkdownBlock();
			}
			return;
		}

		// Start {{code_changes}} blocks
		if (line.includes(FILE_CHANGE_START)) {
			// Close any existing code blocks first
			if (this.isInRegularCodeBlock) {
				this.endCodeBlock();
				this.isInRegularCodeBlock = false;
			}
			if (this.isInMergeCodeBlock) {
				this.processMergeBlock();
				this.isInMergeCodeBlock = false;
			}

			this.isInMergeCodeBlock = true;
			this.isExpectingFilePath = true;
			this.endMarkdownBlock(); // Close the current markdown block
			return;
		}

		// End {{code_changes}} blocks
		if (line.includes(FILE_CHANGE_END)) {
			this.processMergeBlock();
			this.isInMergeCodeBlock = false;
			this.endCodeBlock();

			// Open a new markdown block after a code block ends
			this.startMarkdownBlock();
			return;
		}

		// Extract file path from {{fp}} tag
		if (this.isExpectingFilePath) {
			const fpMatch = line.match(new RegExp(`${FILE_PATH_START}(.*?)${FILE_PATH_END}`));
			if (fpMatch) {
				this.tempFilePath = fpMatch[1];
				this.isExpectingFilePath = false;
				this.isExpectingLanguage = true; // Now expect language directly instead of code ID
				return;
			}
		}

		// Extract language from {{l}} tag
		if (this.isExpectingLanguage) {
			const langMatch = line.match(new RegExp(LANGUAGE_MATCH));
			if (langMatch && this.tempFilePath) {
				const language = langMatch[1];
				const { filename, fileUri } = detectFileNameUri(this.tempFilePath);
				this.filename = filename;
				this.fileUri = fileUri;

				// Set the current language
				this.currentLanguage = language || '';

				// Signal the start of a merge code block
				this._view.webview.postMessage({
					command: 'chatStream',
					action: 'startCodeBlock',
					filename: this.filename || undefined,
					fileUri: this.fileUri || undefined,
					language: language || undefined
				});

				// Reset the temporary file path and language expectation
				this.tempFilePath = null;
				this.isExpectingLanguage = false;
				return;
			}
		}

		// Process lines within the {{code_changes}} block
		if (this.isInMergeCodeBlock) {
			if (this.isInSearchBlock) {
				this.collectedSearchLines.push(line);
			} else if (this.isInReplaceBlock) {
				this.collectedReplaceLines.push(line);
				// also stream the line to the webview
				this.processCodeLine(line);
			}
		} else if (this.isInRegularCodeBlock) {
			// Process lines within a regular code block
			this.processCodeLine(line);
		} else {
			// Process lines outside {{code_changes}} blocks
			this.processMarkdownLine(line);
		}
	}

	/*
	 * Ignore analysis blocks
	 */
	private ignoreAnalysisBlocks(line: string): boolean {
		// Start and end {{analysis}} blocks
		if (line.includes('{{analysis}}')) {
			this.isInAnalysisBlock = true;
			return true;
		}

		// End {{analysis}} blocks
		if (line.includes('{{/analysis}}')) {
			this.isInAnalysisBlock = false;
			return true;
		}

		// Only check for analysis now
		if (this.isInAnalysisBlock) {
			return true;
		}

		return false;
	}

	private processCodeLine(line: string): void {
		// Send each line immediately
		const formattedContent = hljs.highlight(line.replace(/\t/g, '    '), { language: this.currentLanguage }).value + '<br>';
		this._view.webview.postMessage({ command: 'chatStream', action: 'addCodeLine', codeLine: formattedContent });

		// Collect code lines for later processing
		this.collectedCodeLines.push(line);

		// Occasionally send the buffered code lines
		if (this.collectedCodeLines.length % 5 === 0) { // Example condition: every 5 lines
			const bufferedContent = this.collectedCodeLines.join('\n');
			const highlightedCodeBlock = hljs.highlight(bufferedContent.replace(/\t/g, '    '), { language: this.currentLanguage }).value;
			this._view.webview.postMessage({
				command: 'chatStream',
				action: 'addCodeLine',
				language: this.currentLanguage || undefined,
				code: highlightedCodeBlock
			});
		}
	}

	private sendBufferedMarkdownLines(action: string = 'addMarkdownLine'): void {
		const bufferedContent = this.collectedMarkdownLines.join('\n');
		const renderedBufferedContent = this.md.render(bufferedContent);
		this._view.webview.postMessage({
			command: 'chatStream',
			action: action,
			lines: renderedBufferedContent
		});
	}

	private processMarkdownLine(line: string): void {
		// Check if it's the start of a markdown block
		if (this.collectedMarkdownLines.length === 0) {
			this.startMarkdownBlock();
		}

		// Send each line immediately
		const renderedContent = this.md.render(line);
		this._view.webview.postMessage({
			command: 'chatStream',
			action: 'addMarkdownLine',
			line: renderedContent
		});

		// Collect markdown lines for later processing
		this.collectedMarkdownLines.push(line);

		// Resend the buffered markdown lines every 5 lines
		if (this.collectedMarkdownLines.length % 5 === 0) {
			this.sendBufferedMarkdownLines();
		}
	}

	private endCodeBlock(): void {
		// Process and send collected code lines with highlight.js when the code block ends
		const fullCodeBlock = this.collectedCodeLines.join('\n');
		const highlightedCodeBlock = hljs.highlight(fullCodeBlock.replace(/\t/g, '    '), { language: this.currentLanguage }).value;
		
		this._view.webview.postMessage({
			command: 'chatStream',
			action: 'endCodeBlock',
			code: highlightedCodeBlock,
			filename: this.filename || undefined,
			fileUri: this.fileUri || undefined,
			language: this.currentLanguage || undefined,
			showAIMerge: !isChatPrePromptDisabled() && isPromptOverrideEmpty()
		});
		this.collectedCodeLines = [];
	}

	public getRenderedContent(): string {
		return this.renderedContent;
	}

	private startMarkdownBlock(): void {
		// Add any additional logic needed before starting a markdown block
		this._view.webview.postMessage({ command: 'chatStream', action: 'startMarkdownBlock' });
	}

	private endMarkdownBlock(): void {
		// Send the buffered markdown lines while signalling the end of a markdown block
		this.sendBufferedMarkdownLines('endMarkdownBlock');

		// Clear the collected markdown lines
		this.collectedMarkdownLines = [];
	}

	public finalize(): void {
		// Process any remaining content in the buffer as one line
		if (this.buffer.length > 0) {
			this.processLine(this.buffer);
			this.buffer = ''; // Clear the buffer after processing
		}

		// Send the buffered markdown lines while signalling the end of a markdown block
		this.endMarkdownBlock();
	}

	private processMergeBlock(): void {
		if (this.collectedSearchLines.length === 0 || this.collectedReplaceLines.length === 0) {
			return;
		}

		// Generate a diff between search and replace blocks
		const searchContent = this.collectedSearchLines.join('\n');
		const replaceContent = this.collectedReplaceLines.join('\n');

		// Send the diff to the webview
		this._view.webview.postMessage({
			command: 'chatStream',
			action: 'endCodeBlock',
			originalCode: hljs.highlight(searchContent.replace(/\t/g, '    '), { language: this.currentLanguage }).value,
			code: hljs.highlight(replaceContent.replace(/\t/g, '    '), { language: this.currentLanguage }).value,
			filename: this.filename || undefined,
			fileUri: this.fileUri || undefined,
			language: this.currentLanguage || undefined,
			showAIMerge: !isChatPrePromptDisabled() && isPromptOverrideEmpty()
		});

		// Remove line number references
		this.collectedSearchLines = [];
		this.collectedReplaceLines = [];

		// Start a new markdown block after the diff
		this.startMarkdownBlock();
	}
}

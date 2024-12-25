/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { detectFileNameUri } from '../../common/io/fileUtils';
import { SessionManager } from './chatSessionManager';
import { isChatPrePromptDisabled, getChatPromptOverride, isPromptOverrideEmpty } from '../../common/configUtils';

// New StreamProcessor class
export class StreamProcessor {
	private isInRegularCodeBlock = false;
	private isInMergeCodeBlock = false;
	private currentLanguage = '';
	private buffer = '';
	private renderedContent = '';
	private isExpectingFilePath = false;
	private isInCodeAnalysis = false;
	private isInChangeAnalysis = false;
	private tempFilePath: string | null = null;
	private isExpectingLanguage = false;
	private isExpectingCodeId = false;
	private codeId: string | null = null;
	private filename: string | null = null;
	private fileUri: string | null = null;
	private collectedCodeLines: string[] = [];
	private collectedUnprocessedCodeLines: string[] = [];
	private collectedMarkdownLines: string[] = [];

	constructor(
		private readonly _view: vscode.WebviewView,
		private readonly md: MarkdownIt,
		private readonly _sessionManager: SessionManager
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
		if (this.ignoreAnalysisBlocks(line)) {
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

		// Start and end {{code_changes}} blocks
		if (line.includes('{{code_changes}}')) {
			this.isInMergeCodeBlock = true;
			this.isExpectingFilePath = true;
			this.endMarkdownBlock(); // Close the current markdown block
			return;
		}

		// End {{code_changes}} blocks
		if (line.includes('{{/code_changes}}')) {
			this.isInMergeCodeBlock = false;
			this.endCodeBlock();

			// Open a new markdown block after a code block ends
			this.startMarkdownBlock();
			return;
		}

		// Extract file path from {{fp}} tag
		if (this.isExpectingFilePath) {
			const fpMatch = line.match(/{{fp}}(.*?){{\/fp}}/);
			if (fpMatch) {
				this.tempFilePath = fpMatch[1];
				this.isExpectingFilePath = false;
				this.isExpectingCodeId = true; // Now expect the code ID
				return;
			}
		}

		// Extract code ID from {{ci}} tag
		if (this.isExpectingCodeId) {
			const ciMatch = line.match(/{{ci}}(.*?){{\/ci}}/);
			if (ciMatch) {
				this.isExpectingCodeId = false;
				this.codeId = ciMatch[1];
				this.isExpectingLanguage = true; // Now expect the language
				return;
			}
		}

		// Extract language from {{l}} tag
		if (this.isExpectingLanguage) {
			const langMatch = line.match(/{{l}}(.*?){{\/l}}/);
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

		// Process lines within a merge code block
		if (this.isInMergeCodeBlock) {

			// Collect unprocessed code lines for merge purposes
			this.collectedUnprocessedCodeLines.push(line);

			// Only process lines that match the specific tags
			const addMatch = line.match(/{{a}}(.*?){{\/a}}/);
			const modMatch = line.match(/{{m}}(.*?){{\/m}}/);
			const contextMatch = line.match(/{{c}}(.*?){{\/c}}/);

			if (addMatch || modMatch || contextMatch) {
				const codeContent = addMatch?.[1] || modMatch?.[1] || contextMatch?.[1] || '';
				this.processCodeLine(codeContent);
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
		// Start and end {{code_analysis}} blocks
		if (line.includes('{{code_analysis}}')) {
			this.isInCodeAnalysis = true;
			return true;
		}

		// End {{code_analysis}} blocks
		if (line.includes('{{/code_analysis}}')) {
			this.isInCodeAnalysis = false;
			return true;
		}

		// Start and end {{change_analysis}} blocks
		if (line.includes('{{change_analysis}}')) {
			this.isInChangeAnalysis = true;
			return true;
		}

		// End {{change_analysis}} blocks
		if (line.includes('{{/change_analysis}}')) {
			this.isInChangeAnalysis = false;
			return true;
		}

		// Always ignore lines within {{code_analysis}} or {{change_analysis}} blocks
		if (this.isInCodeAnalysis || this.isInChangeAnalysis) {
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
			code: highlightedCodeBlock, // Send the highlighted code block
			filename: this.filename || undefined,
			fileUri: this.fileUri || undefined,
			codeId: this.codeId || undefined,
			language: this.currentLanguage || undefined, // Send the language
			showAIMerge: !isChatPrePromptDisabled() && isPromptOverrideEmpty()
		});
		this.collectedCodeLines = []; // Clear the collected lines

		// Invoke setCodeBlock with unprocessed code lines
		const sessionId = this._sessionManager.getCurrentSessionId(); // Example method to get sessionId
		const fullText = this.collectedUnprocessedCodeLines.join('\n'); // Use unprocessed code lines
		this._sessionManager.setCodeBlock(sessionId!, this.codeId!, fullText);
		this.collectedUnprocessedCodeLines = []; // Clear the unprocessed lines
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
}

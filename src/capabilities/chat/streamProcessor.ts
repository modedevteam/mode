import * as vscode from 'vscode';
import MarkdownIt = require('markdown-it');
import hljs from 'highlight.js';
import { detectFileNameUri } from '../../common/io/fileUtils';

// New StreamProcessor class
export class StreamProcessor {
	private isInCodeBlock = false;
	private currentLanguage = '';
	private buffer = '';
	private renderedContent = '';
	private isExpectingFilename = false;
	private isInCodeAnalysis = false;

	constructor(
		private readonly _view: vscode.WebviewView,
		private readonly md: MarkdownIt
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

	private processLine(line: string): void {
		if (line.includes('<code_analysis>')) {
			this.isInCodeAnalysis = true;
			return;
		}
		if (line.includes('</code_analysis>')) {
			this.isInCodeAnalysis = false;
			return;
		}
		
		if (this.isInCodeAnalysis) {
			return;
		}

		if (this.isExpectingFilename) {
			const { filename, fileUri } = detectFileNameUri(line);

			// Signal the start of the code block
			this._view.webview.postMessage({
				command: 'chatStream',
				action: 'startCodeBlock',
				language: this.currentLanguage,
				filename: filename || undefined,  	// Use detected filename or undefined if not found
				fileUri: fileUri || undefined  		// Use detected file URI or undefined if not found
			});

			// Reset the flag
			this.isExpectingFilename = false;

			// If we got a filename, we don't need to process the line as code
			if (filename) {
				return;
			}
		}

		if (line.trim().startsWith('```')) {
			this.handleCodeBlockDelimiter(line);
		} else if (this.isInCodeBlock) {
			this.processCodeLine(line);
		} else {
			this.processMarkdownLine(line);
		}
	}

	private handleCodeBlockDelimiter(line: string): void {
		this.isInCodeBlock = !this.isInCodeBlock;
		if (this.isInCodeBlock) {
			// Signal that we're expecting a filename on the next line
			this.isExpectingFilename = true;

			// Set the current language, the code block will started after we get the filename
			this.currentLanguage = line.substring(3).trim();
		} else {
			this._view.webview.postMessage({ command: 'chatStream', action: 'endCodeBlock' });
			this.currentLanguage = '';
		}
	}

	private processCodeLine(line: string): void {
		const formattedContent = hljs.highlight(line, { language: this.currentLanguage }).value + '<br>';
		this._view.webview.postMessage({ command: 'chatStream', action: 'addCodeWord', word: formattedContent });
	}

	private processMarkdownLine(line: string): void {
		const renderedContent = this.md.render(line);
		this._view.webview.postMessage({ command: 'chatStream', action: 'addWord', word: renderedContent });
	}

	public getRenderedContent(): string {
		return this.renderedContent;
	}
}

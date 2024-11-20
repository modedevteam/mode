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
	private isExpectingFilePath = false;
	private isInCodeAnalysis = false;
	private isInChangeAnalysis = false;
	private tempFilePath: string | null = null;
	private isExpectingLanguage = false;

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

		// Ignore lines within {{cl}} blocks
		if (line.includes('{{cl}}') || line.includes('{{/cl}}')) {
			return;
		}

		// Start and end {{code_analysis}} blocks
		if (line.includes('{{code_analysis}}')) {
			this.isInCodeAnalysis = true;
			return;
		}

		// End {{code_analysis}} blocks
		if (line.includes('{{/code_analysis}}')) {
			this.isInCodeAnalysis = false;
			return;
		}

		// Start and end {{change_analysis}} blocks
		if (line.includes('{{change_analysis}}')) {
			this.isInChangeAnalysis = true;
			return;
		}

		// End {{change_analysis}} blocks
		if (line.includes('{{/change_analysis}}')) {
			this.isInChangeAnalysis = false;
			return;
		}

		// Start and end {{code_changes}} blocks
		if (line.includes('{{code_changes}}')) {
			this.isInCodeBlock = true;
			this.isExpectingFilePath = true;
			return;
		}

		// End {{code_changes}} blocks
		if (line.includes('{{/code_changes}}')) {
			this.isInCodeBlock = false;
			this._view.webview.postMessage({ command: 'chatStream', action: 'endCodeBlock' });
			return;
		}

		// Ignore lines within {{code_analysis}} or {{change_analysis}} blocks
		if (this.isInCodeAnalysis || this.isInChangeAnalysis) {
			return;
		}

		// Extract file path from {{fp}} tag
		if (this.isExpectingFilePath) {
			const fpMatch = line.match(/{{fp}}(.*?){{\/fp}}/);
			if (fpMatch) {
				this.tempFilePath = fpMatch[1];
				this.isExpectingFilePath = false;
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

				// Set the current language
				this.currentLanguage = language || '';

				// Signal the start of the code block
				this._view.webview.postMessage({
					command: 'chatStream',
					action: 'startCodeBlock',
					language: language || undefined,  	// Use detected language or undefined if not found
					filename: filename || undefined,  	// Use detected filename or undefined if not found
					fileUri: fileUri || undefined  		// Use detected file URI or undefined if not found
				});

				// Reset the temporary file path and language expectation
				this.tempFilePath = null;
				this.isExpectingLanguage = false;
				return;
			}
		}

		// Process lines within {{code_changes}} blocks
		if (this.isInCodeBlock) {
			// Process only lines with {{a}} or {{m}} tags
			const addMatch = line.match(/{{a}}(.*?){{\/a}}/);
			const modMatch = line.match(/{{m}}(.*?){{\/m}}/);
			const contextMatch = line.match(/{{c}}(.*?){{\/c}}/);

			if (addMatch || modMatch || contextMatch) {
				const codeContent = addMatch?.[1] || modMatch?.[1] || contextMatch?.[1];
				if (codeContent) {
					this.processCodeLine(codeContent);
				}
			}
		} else {
			// Process lines outside {{code_changes}} blocks
			this.processMarkdownLine(line);
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

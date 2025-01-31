/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import { MarkdownRenderer } from '../../../common/rendering/markdown.renderer';
import {
	FILE_CHANGE_START,
	FILE_CHANGE_END,
	FILE_PATH_START,
	FILE_PATH_END,
	SEARCH_START,
	SEARCH_END,
	REPLACE_START,
	REPLACE_END,
	LANGUAGE_START,
	LANGUAGE_END
} from '../../../common/llms/llm.prompt';
import { TextResponseProcessor } from './text.response.processor';

export class FileChangeResponseProcessor {
	private buffer: string = '';
	private textProcessor: TextResponseProcessor;
	private markdownRenderer: MarkdownRenderer;

	private tokenTypes: Record<string, {
		prefix: string;
		endPrefix: string;
		onStart?: (value: string) => void;
		onToken?: (currentToken: string, fullToken: string) => void;
		onEnd?: (value: string) => void;
		streaming?: boolean;
	}> = {
			filePath: {
				prefix: '"filePath":\\s*"',
				endPrefix: '",\\s*"language":',
				onStart: () => {
					this.textProcessor.processLine(FILE_CHANGE_START);
				},
				onToken: () => {
				},
				onEnd: (value: string) => {
					this.textProcessor.processLine(`${FILE_PATH_START}${value}${FILE_PATH_END}`);
				}
			},
			language: {
				prefix: '"language":\\s*"',
				endPrefix: '",\\s*"fileAction":',
				onStart: () => { },
				onToken: () => {},
				onEnd: (value: string) => {
					this.textProcessor.processLine(`${LANGUAGE_START}${value}${LANGUAGE_END}`);
				}
			},
			fileAction: {
				prefix: '"fileAction":\\s*"',
				endPrefix: '",\\s*"updateAction":',
				onStart: () => { },
				onToken: () => { },
				onEnd: () => { }
			},
			updateAction: {
				prefix: '"updateAction":\\s*"',
				endPrefix: '",\\s*"searchContent":',
				onStart: () => { },
				onToken: () => { },
				onEnd: () => { }
			},
			searchContent: {
				prefix: '"searchContent":\\s*"',
				endPrefix: '",\\s*"replaceContent":',
				onStart: () => {
					this.textProcessor.processLine(SEARCH_START);
				},
				onToken: () => {},
				onEnd: (value: string) => {
					value.split('\n').forEach((line) => {
						this.textProcessor.processLine(line);
					});
					this.textProcessor.processLine(SEARCH_END);
				}
			},
			replaceContent: {
				prefix: '"replaceContent":\\s*"',
				endPrefix: '",\\s*"explanation":',
				streaming: true,
				onStart: (value) => {
					this.textProcessor.processLine(REPLACE_START);
					this.textProcessor.processToken(value);
				},
				onToken: (currentToken: string, fullToken: string) => {
					this.textProcessor.processToken(fullToken
						.replace(/\\t/g, '\t')
						.replace(/\\n/g, '\n')
						.replace(/\\r/g, '\r')
						.replace(/\\"/g, '"')
						.replace(/\\\\/g, '\\'),
						true // codeStreaming
					);
				},
				onEnd: (value: string) => {
					this.textProcessor.processLine(REPLACE_END,
						/* codeStreaming = */ true,
						/* finalCodeBlock = */ value
							.replace(/\\t/g, '\t')
							.replace(/\\n/g, '\n')
							.replace(/\\r/g, '\r')
							.replace(/\\"/g, '"')
							.replace(/\\\\/g, '\\'));
					this.textProcessor.processLine(FILE_CHANGE_END,
						/* codeStreaming = */ true,
						/* finalCodeBlock = */ value
							.replace(/\\t/g, '\t')
							.replace(/\\n/g, '\n')
							.replace(/\\r/g, '\r')
							.replace(/\\"/g, '"')
							.replace(/\\\\/g, '\\'));
				}
			},
			explanation: {
				prefix: '"explanation":\\s*"',
				endPrefix: '",\\s*"end_change":',
				streaming: true,
				onStart: () => {
					this.markdownRenderer.startMarkdownBlock();
				},
				onToken: (currentToken: string, fullToken: string) => {
					this.markdownRenderer.processMarkdownToken(currentToken);
				},
				onEnd: (value: string) => {
					// Sometimes some of the characters of the next block are sent as tokens
					// e.g "I'm updating the method call to use 'textResponseProcessor' instead of 'textProcessor'.","end_change":""
					// So we need to send the entire properly formatted value here to clean it up
					this.markdownRenderer.endMarkdownBlock(value);
				}
			},
			end_change: {
				// This token is just a delimiter to mark the end of a change block - no processing needed
				prefix: '"end_change":\\s*"',
				endPrefix: '"',
				onStart: () => { },
				onToken: (value: string) => { },
				onEnd: () => { }
			}
		};

	private currentToken: { type: string; value: string } | null = null;

	constructor(
		private readonly _view: vscode.WebviewView,
		private readonly md: MarkdownIt
	) {
		this.textProcessor = new TextResponseProcessor(_view, md);
		this.markdownRenderer = new MarkdownRenderer(_view, md);
	}

	private processTokenStart(token: string): boolean {
		for (const [type, config] of Object.entries(this.tokenTypes)) {
			const regex = new RegExp(config.prefix);
			const match = this.buffer.match(regex);
			if (match) {
				const start = match.index! + match[0].length;
				const initialValue = this.buffer.substring(start);
				this.buffer = this.buffer.substring(start);
				this.currentToken = { type, value: initialValue };
				config.onStart?.(initialValue);
				// If this is a streaming token type, process the initial value
				if (config.streaming) {
					config.onToken?.(initialValue, initialValue);
				}
				return true;
			}
		}
		return false;
	}

	processToken(token: string) {
		if (!this.currentToken) {
			this.buffer += token;
			if (this.processTokenStart(token)) {
				return;
			}
		} else {
			this.currentToken.value += token;
			const config = this.tokenTypes[this.currentToken.type];

			// Stream tokens if the config specifies streaming
			if (config.streaming) {
				config.onToken?.(token, this.currentToken.value);
			}

			const endRegex = new RegExp(config.endPrefix);
			const endMatch = this.currentToken.value.match(endRegex);
			
			if (endMatch) {
				const endIndex = endMatch.index!;

				// Only parse and call onEnd for non-streaming types
				if (!config.streaming) {
					try {
						// First unescape any escaped quotes that are part of the content
						const cleanedValue = this.currentToken.value
							.substring(0, endIndex)
							.replace(/\\\\/g, '\\')
							.replace(/\\"/g, '"');
						
						// Then handle newlines and tabs
						const value = cleanedValue
							.replace(/\\n/g, '\n')
							.replace(/\\t/g, '\t');
							
						config.onEnd?.(value);
					} catch (error) {
						console.error('Error parsing token:', error);
					}
				} else {
					config.onEnd?.(this.currentToken.value.substring(0, endIndex));
				}

				const tokenValue = this.currentToken.value;
				this.currentToken = null;
				this.buffer = tokenValue.substring(endIndex);
			}
		}
	}

	startChange() {
		// No need for markdown block markers anymore
	}

	endChange() {
		this.buffer = '';
	}
}

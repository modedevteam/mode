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

	private tokenTypes: Record<string, {
		prefix: string;
		endPrefix: string;
		onStart?: (value: string) => void;
		onToken?: (value: string) => void;
		onEnd?: (value: string) => void;
	}> = {
			filePath: {
				prefix: '"filePath":"',
				endPrefix: '","language":',
				onStart: () => {
					this.textProcessor.processLine(FILE_CHANGE_START);
				},
				onToken: (value: string) => {
					this.textProcessor.processLine(`${FILE_PATH_START}${value}${FILE_PATH_END}`);
				},
				onEnd: () => { }
			},
			language: {
				prefix: '"language":"',
				endPrefix: '","fileAction":',
				onStart: () => { },
				onToken: (value: string) => {
					this.textProcessor.processLine(`${LANGUAGE_START}${value}${LANGUAGE_END}`);
				},
				onEnd: () => { }
			},
			fileAction: {
				prefix: '"fileAction":"',
				endPrefix: '","updateAction":',
				onStart: () => { },
				onToken: (value: string) => { },
				onEnd: () => { }
			},
			updateAction: {
				prefix: '"updateAction":"',
				endPrefix: '","searchContent":',
				onStart: () => { },
				onToken: (value: string) => { },
				onEnd: () => { }
			},
			searchContent: {
				prefix: '"searchContent":"',
				endPrefix: '","replaceContent":',
				onStart: () => {
					this.textProcessor.processLine(SEARCH_START);
				},
				onToken: (value: string) => {
					value.split('\n').forEach((line) => {
						this.textProcessor.processLine(line);
					});
				},
				onEnd: () => {
					this.textProcessor.processLine(SEARCH_END);
				}
			},
			replaceContent: {
				prefix: '"replaceContent":"',
				endPrefix: '","explanation":',
				onStart: () => {
					this.textProcessor.processLine(REPLACE_START);
				},
				onToken: (value: string) => {
					value.split('\n').forEach((line) => {
						this.textProcessor.processLine(line);
					});
				},
				onEnd: () => {
					this.textProcessor.processLine(REPLACE_END);
					this.textProcessor.processLine(FILE_CHANGE_END);
				}
			},
			explanation: {
				prefix: '"explanation":"',
				endPrefix: '","end_change":',
				onStart: () => { },
				onToken: (value: string) => this.textProcessor.processToken(value),
				onEnd: () => { }
			},
			end_change: {
				// This token is just a delimiter to mark the end of a change block - no processing needed
				prefix: '"end_change":"',
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
	}

	private processTokenStart(token: string): boolean {
		for (const [type, config] of Object.entries(this.tokenTypes)) {
			if (this.buffer.includes(config.prefix)) {
				const start = this.buffer.indexOf(config.prefix) + config.prefix.length;
				const initialValue = this.buffer.substring(start);
				this.buffer = this.buffer.substring(start);
				this.currentToken = { type, value: initialValue };
				config.onStart?.(initialValue);
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

			const config = this.tokenTypes[this.currentToken.type as keyof typeof this.tokenTypes];

			if (this.currentToken.value.includes(config.endPrefix)) {
				const endIndex = this.currentToken.value.indexOf(config.endPrefix);
				const value = JSON.parse(`"${this.currentToken.value.substring(0, endIndex)}"`);

				config.onToken?.(value);
				config.onEnd?.(value);

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
		this.textProcessor.finalize();
		this.buffer = '';
	}
}

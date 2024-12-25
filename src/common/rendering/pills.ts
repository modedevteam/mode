/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as vscode from 'vscode';
import hljs from 'highlight.js';
import { safeLanguageIdentifier } from '../../capabilities/context/safeLanguageIdentifier';
import { ErrorMessages } from '../user-messages/errorMessages';

export interface CodeSelection {
    text: string;
    fileName: string;
    startLine: number;
    endLine: number;
    language: string;
}

export interface ProcessedCode {
    fileName: string;
    range: string;
    highlightedCode: string;
}

export class PillRenderer {
    /**
     * Process selected text by removing common indentation while preserving structure
     */
    static processSelectedText(text: string): string {
        const lines = text.replace(/\t/g, '    ').split('\n');
        const nonEmptyLines = lines.filter(line => line.trim().length > 0);

        if (nonEmptyLines.length === 0) {
            return text;
        }

        const commonPrefixLength = this.findCommonIndentation(nonEmptyLines);

        return lines.map(line => {
            if (line.trim().length === 0) {
                return '';
            }
            return line.slice(commonPrefixLength);
        }).join('\n');
    }

    /**
     * Find common indentation across all lines
     */
    static findCommonIndentation(lines: string[]): number {
        const nonEmptyLines = lines.filter(line => line.trim().length > 0);
        if (nonEmptyLines.length === 0) return 0;

        const leadingSpaces = nonEmptyLines.map(line => {
            const match = line.match(/^[\t ]*/);
            return match ? match[0].length : 0;
        });

        return Math.min(...leadingSpaces);
    }

    /**
     * Process code selection and return highlighted code
     */
    static processCodeSelection(
        selection: CodeSelection,
        outputChannel: vscode.OutputChannel
    ): ProcessedCode {
        const processedText = this.processSelectedText(selection.text);
        const range = `${selection.startLine}-${selection.endLine}`;
        
        let highlightedCode: string;
        try {
            highlightedCode = hljs.highlight(processedText, { 
                language: safeLanguageIdentifier(selection.language) 
            }).value;
        } catch (error) {
            const errorMessage = ErrorMessages.CODE_HIGHLIGHTING_ERROR(
                error, 
                selection.language
            );
            highlightedCode = processedText;
            outputChannel.appendLine(errorMessage);
            outputChannel.show();
        }

        return {
            fileName: selection.fileName,
            range,
            highlightedCode
        };
    }
}
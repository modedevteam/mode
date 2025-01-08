/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TextResponseProcessor } from '../chat/text.response.processor';
import { displayFileChanges } from './display.file.changes';

/*
 * Represents a single change to a file.
 */
export interface FileChange {
    filePath: string;
    fileAction: 'modify' | 'create' | 'delete' | 'rename';
    updateAction: 'replace' | 'delete' | 'insert';
    language: string;
    searchContent: string;
    replaceContent?: string;
    explanation?: string;
}

/*
 * Represents a set of changes to be applied.
 */
export interface ChangeSet {
    explanation: string;
    changes: FileChange[];
}

/*
 * The main function that applies the changes. Entry point for the tool call.
 */
export async function applyFileChanges(toolCallArguments: string | any, handler: TextResponseProcessor): Promise<void> {
    try {
        // Handle both string and object inputs
        const changes: ChangeSet = typeof toolCallArguments === 'string'
            ? JSON.parse(toolCallArguments)
            : {
                explanation: toolCallArguments.explanation,
                changes: toolCallArguments.changes
            };


        // Pass the handler to displayChanges
        // await displayFileChanges(changes, handler);

        // Then apply each change
        for (const change of changes.changes) {
            await applyFileChange(change);
        }
    } catch (error) {
        console.error('Error applying changes:', error);
        throw error;
    }
}

/*
 * Handles line-by-line replacement that theoretically preserves indentation but can be buggy
 */
function replaceStrategyV2(
    document: vscode.TextDocument,
    uri: vscode.Uri,
    edit: vscode.WorkspaceEdit,
    start: vscode.Position,
    end: vscode.Position,
    change: FileChange
): vscode.Range {
    const replaceLines = (change.replaceContent || '').split('\n');
    const startLine = document.lineAt(start.line);
    const endLine = document.lineAt(start.line + change.searchContent.split('\n').length - 1);
    const range = new vscode.Range(startLine.range.start, endLine.range.end);

    edit.replace(uri, range, replaceLines.join('\n'));
    // Return the range that was actually modified
    return new vscode.Range(
        startLine.range.start,
        document.lineAt(start.line + replaceLines.length - 1).range.end
    );
}

/*
 * Searches for content in document using line-by-line matching strategy
 */
function searchStrategy(document: vscode.TextDocument, searchContent: string): vscode.Position | null {
    const documentLines = document.getText().split('\n');
    const searchLines = searchContent.split('\n');
    const firstLine = normalizeWhitespace(searchLines[0].trim());

    for (let i = 0; i < documentLines.length; i++) {
        if (i > documentLines.length - searchLines.length) {
            break;
        }

        const normalizedDocLine = normalizeWhitespace(documentLines[i].trim());
        if (normalizedDocLine === firstLine) {
            let isFullMatch = true;

            // Verify subsequent lines with normalized whitespace
            for (let j = 1; j < searchLines.length; j++) {
                const normalizedDocNextLine = normalizeWhitespace(documentLines[i + j].trim());
                const normalizedSearchLine = normalizeWhitespace(searchLines[j].trim());

                if (normalizedDocNextLine !== normalizedSearchLine) {
                    isFullMatch = false;
                    break;
                }
            }

            if (isFullMatch) {
                return document.positionAt(
                    documentLines.slice(0, i).join('\n').length +
                    (i > 0 ? 1 : 0)
                );
            }
        }
    }

    return null;
}

/*
 * Normalizes whitespace by first replacing all types of whitespace with spaces,
 * then collapsing all whitespace to a single space, and finally removing all remaining whitespace.
 */
function normalizeWhitespace(text: string): string {
    return text
        // First unescape any escaped characters
        .replace(/\\t/g, '\t')
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        // Then remove all whitespace characters completely
        .replace(/\s+/g, '');
}

/*
 * Applies individual changes to the file.
 */
export async function applyFileChange(change: FileChange): Promise<void> {
    // Get the document
    const uri = vscode.Uri.file(change.filePath);
    let document: vscode.TextDocument;

    try {
        document = await vscode.workspace.openTextDocument(uri);
    } catch (error) {
        if (change.fileAction === 'create') {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(change.replaceContent || ''));
            return;
        }
        throw error;
    }

    // Handle different file actions
    switch (change.fileAction) {
        case 'modify': {
            const edit = new vscode.WorkspaceEdit();
            const startPosition = searchStrategy(document, change.searchContent);

            if (!startPosition) {
                throw new Error(`Could not find content to replace in ${change.filePath}`);
            }

            const endPosition = document.positionAt(
                document.offsetAt(startPosition) + change.searchContent.length
            );

            // Store the actual range that was modified
            let modifiedRange: vscode.Range;

            if (change.updateAction === 'delete') {
                modifiedRange = new vscode.Range(startPosition, endPosition);
                edit.delete(uri, modifiedRange);
            } else {
                modifiedRange = replaceStrategyV2(document, uri, edit, startPosition, endPosition, change);
            }

            await vscode.workspace.applyEdit(edit);

            // Get the editor and format the modified range
            const editor = await vscode.window.showTextDocument(uri);
            
            // Set the selection to the modified range and then format
            editor.selection = new vscode.Selection(modifiedRange.start, modifiedRange.end);
            await vscode.commands.executeCommand('editor.action.formatSelection');

            const decorationType = vscode.window.createTextEditorDecorationType({
                backgroundColor: new vscode.ThemeColor('diffEditor.insertedTextBackground'),
                border: '1px solid',
                borderColor: new vscode.ThemeColor('diffEditor.insertedTextBorder')
            });

            editor.setDecorations(decorationType, [{ range: modifiedRange }]);

            // Remove decoration after 5 seconds
            setTimeout(() => {
                decorationType.dispose();
            }, 5000);

            break;
        }
        case 'create':
            await vscode.workspace.fs.writeFile(uri, Buffer.from(change.replaceContent || ''));
            break;
        case 'delete':
            await vscode.workspace.fs.delete(uri);
            break;
        case 'rename': {
            if (!change.replaceContent) {
                console.error('No target path provided for rename operation');
                return;
            }
            const targetUri = vscode.Uri.file(change.replaceContent);
            await vscode.workspace.fs.rename(uri, targetUri);
            break;
        }
    }
}

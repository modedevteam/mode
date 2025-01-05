/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ChatResponseHandler } from '../chat/chat.response.handler';
import { ANALYSIS_END, ANALYSIS_START, FILE_CHANGE_END, FILE_CHANGE_START, REPLACE_END, REPLACE_START, SEARCH_END, SEARCH_START } from '../../common/llms/llm.prompt';
import { FILE_PATH_END, FILE_PATH_START, LANGUAGE_END, LANGUAGE_START } from '../../common/llms/llm.prompt';

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
 * Formats the changes by processing escape sequences in content.
 */
function formatChanges(changes: ChangeSet): ChangeSet {
    return {
        explanation: changes.explanation,
        changes: changes.changes.map(change => ({
            ...change,
            searchContent: processEscapeSequences(change.searchContent),
            replaceContent: change.replaceContent ? processEscapeSequences(change.replaceContent) : undefined,
            explanation: change.explanation ? processEscapeSequences(change.explanation) : undefined
        }))
    };
}

/*
 * Helper function to process escape sequences in strings
 */
function processEscapeSequences(content: string): string {
    return content
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\\\/g, '\\')
        .replace(/\\"/g, '"');
}

/*
 * The main function that applies the changes. Entry point for the tool call.
 */
export async function applyFileChanges(toolCallArguments: string | any, handler: ChatResponseHandler): Promise<void> {
    try {
        // Handle both string and object inputs
        let changes: ChangeSet = typeof toolCallArguments === 'string'
            ? JSON.parse(toolCallArguments)
            : {
                explanation: toolCallArguments.explanation,
                changes: toolCallArguments.changes
            };

        // Format the changes
        changes = formatChanges(changes);

        // Pass the handler to displayChanges
        await displayFileChanges(changes, handler);

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
 * Displays the changes to the user. Renders the changes in the webview.
 */
export async function displayFileChanges(changes: ChangeSet, handler: ChatResponseHandler): Promise<void> {
    // Display explanation
    await handler.processLine(changes.explanation);

    for (const change of changes.changes) {
        // Start file change block
        handler.processLine(FILE_CHANGE_START);
        handler.processLine(`${FILE_PATH_START}${change.filePath}${FILE_PATH_END}`);
        handler.processLine(`${LANGUAGE_START}${change.language}${LANGUAGE_END}`);

        // Show search content
        handler.processLine(SEARCH_START);
        handler.processLine(change.searchContent);
        handler.processLine(SEARCH_END);

        // Show replace content if applicable
        if (change.replaceContent) {
            handler.processLine(REPLACE_START);
            handler.processLine(change.replaceContent);
            handler.processLine(REPLACE_END);
        }

        handler.processLine(FILE_CHANGE_END);

        // End with change-specific explanation if it exists
        if (change.explanation) {
            handler.processLine(change.explanation);
        }
    }

    handler.finalize();
}

/*
 * Simple replacement strategy that just swaps the content
 */
function replaceStrategyV1(
    document: vscode.TextDocument,
    uri: vscode.Uri,
    edit: vscode.WorkspaceEdit,
    start: vscode.Position,
    end: vscode.Position,
    change: FileChange
): void {
    edit.replace(
        uri,
        new vscode.Range(start, end),
        change.replaceContent || ''
    );
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
): void {
    const replaceLines = (change.replaceContent || '').split('\n');
    const startLine = document.lineAt(start.line);
    const endLine = document.lineAt(start.line + change.searchContent.split('\n').length - 1);
    edit.replace(
        uri,
        new vscode.Range(startLine.range.start, endLine.range.end),
        replaceLines.join('\n')
    );
}

/*
 * Searches for content in document using line-by-line matching strategy
 */
function searchStrategy(document: vscode.TextDocument, searchContent: string): vscode.Position | null {
    const documentLines = document.getText().split('\n');
    const searchLines = searchContent.split('\n');
    const firstLine = normalizeWhitespace(searchLines[0].trim());

    // Add logging for the search pattern
    console.log('Search pattern (normalized):');
    searchLines.forEach((line, i) => {
        console.log(`${i}: "${normalizeWhitespace(line.trim())}"`);
    });

    for (let i = 0; i < documentLines.length; i++) {
        if (i > documentLines.length - searchLines.length) {
            break;
        }

        const normalizedDocLine = normalizeWhitespace(documentLines[i].trim());
        // Log when we find a potential first line match
        if (normalizedDocLine === firstLine) {
            console.log(`\nPotential match at line ${i}:`);
            console.log(`Document: "${normalizedDocLine}"`);
            console.log(`Search : "${firstLine}"`);

            let isFullMatch = true;

            // Verify subsequent lines with normalized whitespace
            for (let j = 1; j < searchLines.length; j++) {
                const normalizedDocNextLine = normalizeWhitespace(documentLines[i + j].trim());
                const normalizedSearchLine = normalizeWhitespace(searchLines[j].trim());
                
                console.log(`\nComparing line ${i + j}:`);
                console.log(`Document: "${normalizedDocNextLine}"`);
                console.log(`Search : "${normalizedSearchLine}"`);

                if (normalizedDocNextLine !== normalizedSearchLine) {
                    console.log('❌ No match');
                    isFullMatch = false;
                    break;
                }
                console.log('✓ Match');
            }

            if (isFullMatch) {
                console.log('\n✅ Found complete match!');
                return document.positionAt(
                    documentLines.slice(0, i).join('\n').length + 
                    (i > 0 ? 1 : 0)
                );
            }
        }
    }

    console.log('\n❌ No matches found in document');
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
                console.error(`Could not find content to replace in ${change.filePath}`);
                return;
            }

            const endPosition = document.positionAt(
                document.offsetAt(startPosition) + change.searchContent.length
            );

            if (change.updateAction === 'delete') {
                edit.delete(uri, new vscode.Range(startPosition, endPosition));
            } else {
                replaceStrategyV2(document, uri, edit, startPosition, endPosition, change);
            }

            await vscode.workspace.applyEdit(edit);

            // Format the changed section using the correct formatting command
            await vscode.commands.executeCommand('editor.action.formatSelection',
                uri,
                new vscode.Range(startPosition, endPosition)
            );

            // Add temporary decoration to highlight the change
            const editor = await vscode.window.showTextDocument(uri);
            const decorationType = vscode.window.createTextEditorDecorationType({
                backgroundColor: new vscode.ThemeColor('diffEditor.insertedTextBackground'),
                border: '1px solid',
                borderColor: new vscode.ThemeColor('diffEditor.insertedTextBorder')
            });

            const range = new vscode.Range(
                editor.document.positionAt(startPosition.line),
                editor.document.positionAt(endPosition.line)
            );

            // Add the decoration
            editor.setDecorations(decorationType, [{ range }]);

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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileResolver } from '../../common/io/fileUtils';
import * as os from 'os';
import { ErrorMessages } from '../../common/user-messages/errorMessages';
import { SessionManager } from '../chat/chatSessionManager';

export class DiffManager {
    private _applyChangesButton?: vscode.StatusBarItem;
    private _diffEditor?: vscode.TextEditor;
    constructor(
        private readonly _outputChannel: vscode.OutputChannel,
        private readonly _sessionManager: SessionManager
    ) {
    }

    async showDiff(fileUri: string, originalCode: string, newCode: string) {
        // Remove any existing "Apply Changes" button and open diff
        this.removeExistingDiffs();

        const originalUri = await FileResolver.resolveFile(fileUri);
        if (!originalUri) {
            return; // Abort if no file was resolved
        }

        // Prepare the diff
        const proposedChangesUri = this.prepareChanges(originalUri, originalCode, newCode);

        // Return early if user cancelled the merge operation
        if (!proposedChangesUri) {
            return;
        }

        // Show the diff
        const title = `Changes for ${path.basename(originalUri.fsPath)}`;
        this._diffEditor = await vscode.commands.executeCommand('vscode.diff', originalUri, proposedChangesUri, title, {
            preview: false
        }) as vscode.TextEditor;

        // Set up auto-save for the modified document
        const modifiedDocument = await vscode.workspace.openTextDocument(proposedChangesUri);
        const autoSaveDisposable = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.uri.fsPath === modifiedDocument.uri.fsPath) {
                modifiedDocument.save();
            }
        });

        // Create a more prominent button in the editor title area
        this._applyChangesButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
        this._applyChangesButton.text = "$(check) Apply Changes";
        this._applyChangesButton.tooltip = "Apply the changes to the original file";
        this._applyChangesButton.command = 'mode.applyDiffChanges';
        this._applyChangesButton.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        this._applyChangesButton.color = new vscode.ThemeColor('statusBarItem.warningForeground');
        this._applyChangesButton.show();

        // Add blinking animation
        const originalBg = this._applyChangesButton.backgroundColor;
        const blinkSequence = async () => {
            for (let i = 0; i < 2; i++) {
                this._applyChangesButton!.backgroundColor = undefined;
                await new Promise(resolve => setTimeout(resolve, 200));
                this._applyChangesButton!.backgroundColor = originalBg;
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        };
        blinkSequence();

        // Register the command to apply changes
        const disposableCommand = vscode.commands.registerCommand('mode.applyDiffChanges', async () => {
            try {
                // Read the content from the modified file
                const modifiedContent = await fs.promises.readFile(proposedChangesUri.fsPath, 'utf8');

                // Write the modified content to the original file using vscode.workspace.fs
                const originalDocument = await vscode.workspace.openTextDocument(originalUri);
                const originalDocumentEditor = await vscode.window.showTextDocument(originalDocument);
                await originalDocumentEditor.edit(editBuilder => {
                    const entireRange = new vscode.Range(
                        originalDocument.positionAt(0),
                        originalDocument.positionAt(originalDocument.getText().length)
                    );
                    editBuilder.replace(entireRange, modifiedContent);
                });

                // Save the document after editing
                await originalDocument.save();

                // Close the specific diff editor
                await vscode.commands.executeCommand('workbench.action.closeEditorsInGroup', {
                    viewColumn: vscode.ViewColumn.One,
                    preserveFocus: false,
                    uri: proposedChangesUri
                });

                // Hide and dispose of the button
                this._applyChangesButton?.hide();
                this._applyChangesButton?.dispose();

                disposableCommand.dispose();

                // Open the updated file
                const document = await vscode.workspace.openTextDocument(originalUri);
                await vscode.window.showTextDocument(document);
            } catch (error) {
                this._outputChannel.appendLine(ErrorMessages.APPLY_CHANGES_ERROR(error));
                this._outputChannel.show();
            }
        });

        // Register a listener to clean up when the diff editor is closed
        const disposableEditor = vscode.window.onDidChangeVisibleTextEditors(editors => {
            if (!editors.some(e => e.document.uri.fsPath === proposedChangesUri.fsPath)) {
                fs.unlink(proposedChangesUri.fsPath, (err) => {
                    if (err) console.error(`Failed to delete temporary file: ${err}`);
                });

                // Hide and dispose of the button
                this._applyChangesButton?.hide();
                this._applyChangesButton?.dispose();

                disposableCommand.dispose();
                disposableEditor.dispose();
                autoSaveDisposable.dispose();

                // Remove the diff editor from the set
                this._diffEditor = undefined;
            }
        });
    }

    private async removeExistingDiffs() {
        // Remove existing "Apply Changes" buttons
        this._applyChangesButton?.hide();
        this._applyChangesButton?.dispose();

        // Close existing diff editor
        if (this._diffEditor) {
            await vscode.window.showTextDocument(this._diffEditor.document, { preview: false, viewColumn: this._diffEditor.viewColumn });
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            this._diffEditor = undefined;
        }
    }

    private prepareChanges(originalUri: vscode.Uri, originalCode: string, newCode: string): vscode.Uri {
        // Create temp file for modified content
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `${path.basename(originalUri.fsPath)}.modified`);

        // Read the original file content and split into lines
        const originalContent = fs.readFileSync(originalUri.fsPath, 'utf8');
        const contentLines = originalContent.split('\n');
        const originalCodeLines = originalCode.split('\n');

        let matchStartIndex = -1;
        const firstLine = originalCodeLines[0].trim();
        
        // Find all occurrences of the first line
        for (let i = 0; i < contentLines.length; i++) {
            // Skip if this position would exceed array bounds
            if (i > contentLines.length - originalCodeLines.length) {
                break;
            }

            // Look for first line match
            if (contentLines[i].trim() === firstLine) {
                let isFullMatch = true;
                
                // Verify subsequent lines
                for (let j = 1; j < originalCodeLines.length; j++) {
                    if (contentLines[i + j].trim() !== originalCodeLines[j].trim()) {
                        isFullMatch = false;
                        break;
                    }
                }

                // If we found a full match, store the position and exit
                if (isFullMatch) {
                    matchStartIndex = i;
                    break;
                }
                // If not a full match, continue searching from next position
            }
        }

        // If we found a match, replace it with newCode
        if (matchStartIndex !== -1) {
            const beforeLines = contentLines.slice(0, matchStartIndex);
            const afterLines = contentLines.slice(matchStartIndex + originalCodeLines.length);
            const modifiedContent = [...beforeLines, newCode, ...afterLines].join('\n');
            fs.writeFileSync(tmpFile, modifiedContent);
        } else {
            // No match found, use original content
            fs.writeFileSync(tmpFile, originalContent);
        }

        return vscode.Uri.file(tmpFile);
    }
}
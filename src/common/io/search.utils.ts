/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getExcludePatterns } from '../config.utils';
import * as path from 'path';

export interface FileQuickPickItem extends vscode.QuickPickItem {
    label: string;
    description: string;
    fileUri?: string;
}

export class SearchUtils {
    /**
     * Gets the exclude patterns from workspace configuration
     */
    static getExcludePatterns(): string {
        const excludePatterns = getExcludePatterns();
        return excludePatterns.length > 0 ? `{${excludePatterns.join(',')}}` : '';
    }

    /**
     * Searches for files in the workspace with exclude patterns
     */
    static async findWorkspaceFiles(): Promise<vscode.Uri[]> {
        try {
            const excludePattern = this.getExcludePatterns();
            return await vscode.workspace.findFiles('**/*', excludePattern);
        } catch (error) {
            console.error('Error finding workspace files:', error);
            throw new Error(`Failed to search workspace files: ${error}`);
        }
    }

    /**
     * Searches for files by name with exclude patterns
     */
    static async findFilesByName(filename: string): Promise<vscode.Uri[]> {
        try {
            const excludePattern = this.getExcludePatterns();
            return await vscode.workspace.findFiles(`**/${filename}`, excludePattern);
        } catch (error) {
            console.error('Error finding files by name:', error);
            throw new Error(`Failed to search files by name: ${error}`);
        }
    }

    /**
     * Creates QuickPick items from file URIs
     */
    static createFileQuickPickItems(files: vscode.Uri[]): FileQuickPickItem[] {
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const fileItems = files.map(file => ({
            label: path.basename(file.fsPath),
            description: workspaceFolders.length > 1
                ? file.fsPath
                : vscode.workspace.asRelativePath(file.fsPath)
        }));

        // Sort files by name
        return fileItems.sort((a, b) => a.label.localeCompare(b.label));
    }

    /**
     * Shows quick pick for file selection
     */
    static async showFileQuickPick(): Promise<FileQuickPickItem | undefined> {
        try {
            const files = await this.findWorkspaceFiles();
            const fileItems = this.createFileQuickPickItems(files);

            return await vscode.window.showQuickPick(fileItems, {
                placeHolder: 'Select a file to add',
                matchOnDescription: true
            });
        } catch (error) {
            console.error('Error showing file quick pick:', error);
            vscode.window.showErrorMessage(`Failed to show file selection: ${error}`);
            return undefined;
        }
    }

    /**
     * Creates file URI from selected item
     */
    static createFileUri(selectedFile: FileQuickPickItem): string | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders?.length) {
            return undefined;
        }

        return vscode.Uri.file(
            path.join(workspaceFolders[0].uri.fsPath, selectedFile.description)
        ).toString();
    }
}

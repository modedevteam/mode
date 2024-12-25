/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { SearchUtils } from './searchUtils';

// Detects a filename from a line of text. Returns the filename if detected, or null if no filename is detected.
export function detectFileNameUri(line: string): { filename: string | null, fileUri: string | null } {
    const trimmedLine = line.trim();

    // Combined pattern for various comment styles
    const commentPatterns = [
        /\/\*\s*(\/.+?)\s*\*\//, // /* /path/file.ext */
        /\/\/\s*(\/.+?)(?:\s|$)/, // // /path/file.ext
        /#\s*(\/.+?)(?:\s|$)/, // # /path/file.ext
        /<!--\s*(\/.+?)\s*-->/, // <!-- /path/file.ext -->
        /{\s*\/\*\s*(\/.+?)\s*\*\/\s*}/, // {/* /path/file.ext */}
        /\(\*\s*(\/.+?)\s*\*\)/, // (* /path/file.ext *)
        /--\[\[\s*(\/.+?)\s*\]\]/, // --[[ /path/file.ext ]]
        /"""\s*(\/.+?)\s*"""/, // """ /path/file.ext """
        /'''\s*(\/.+?)\s*'''/, // ''' /path/file.ext '''
    ];

    // Try each comment pattern
    for (const pattern of commentPatterns) {
        const match = trimmedLine.match(pattern);
        if (match && match[1]) {
            try {
                const parsedPath = path.parse(match[1]);
                if (parsedPath.ext) {
                    return {
                        filename: parsedPath.base,
                        fileUri: match[1]
                    };
                }
            } catch (e) {
                // Invalid path format, continue to next pattern
                continue;
            }
        }
    }

    // Clean the line by removing common prefixes (existing logic)
    const cleanedLine = trimmedLine
        .replace(/^(?:file:\/\/|vscode:\/\/file\/|\/\/\s*File:\s*|\/\/\s*)/i, '')
        .trim();

    try {
        const parsedPath = path.parse(cleanedLine);
        if (parsedPath.ext) {
            return {
                filename: parsedPath.base,
                fileUri: cleanedLine
            };
        }
    } catch (e) {
        // Invalid path format
    }

    return { filename: null, fileUri: null };
}

export class FileResolver {

    static async resolveFile(fileUri: string): Promise<vscode.Uri | undefined> {
        // 1. Early return if no file specified
        if (!fileUri) {
            return this.showFileOptions(fileUri);
        }

        // 2. Search for specified file
        const matchingFiles = await this.findMatchingFiles(fileUri);

        // 3. Handle cases based on number of matches
        if (matchingFiles.length === 0) {
            return this.showFileOptions(fileUri);
        } else if (matchingFiles.length === 1) {
            return matchingFiles[0];
        } else {
            return this.selectFromMultipleFiles(matchingFiles);
        }
    }

    private static async findMatchingFiles(fileUri: string): Promise<vscode.Uri[]> {
        try {
            const uri = this.parseFileUri(fileUri);
            return await SearchUtils.findFilesByName(path.basename(uri.fsPath));
        } catch (error) {
            console.error('Error finding files:', error);
            return [];
        }
    }

    private static parseFileUri(fileUri: string): vscode.Uri {
        if (path.isAbsolute(fileUri)) {
            return vscode.Uri.file(fileUri);
        }
        try {
            return vscode.Uri.parse(fileUri);
        } catch {
            return vscode.Uri.file(fileUri);
        }
    }

    private static async showFileOptions(fileUri: string): Promise<vscode.Uri | undefined> {
        const activeEditor = vscode.window.activeTextEditor;
        const fileName = fileUri ? path.basename(fileUri) : undefined;
        const options = this.getFileOptions(fileName, activeEditor);

        const choice = await vscode.window.showQuickPick(options, {
            placeHolder: fileUri
                ? 'File not found. What would you like to do?'
                : 'No file specified. What would you like to do?'
        });

        return this.handleOptionChoice(fileName, choice, activeEditor);
    }

    private static getFileOptions(fileName: string | undefined, activeEditor: vscode.TextEditor | undefined) {
        return [
            {
                label: "$(file-add) Create new file",
                description: fileName ? `${fileName}` : '',
                value: 'create'
            },
            {
                label: "$(file) Apply to current file",
                description: activeEditor
                    ? vscode.workspace.asRelativePath(activeEditor.document.uri)
                    : "No file open",
                value: 'current',
                disabled: !activeEditor
            },
            {
                label: "$(search) Search workspace",
                description: "Search and choose from existing files",
                value: 'search'
            },
            {
                label: "$(close) Cancel",
                value: 'cancel'
            }
        ];
    }

    private static async handleOptionChoice(
        fileName: string | undefined,
        choice: { value: string } | undefined,
        activeEditor: vscode.TextEditor | undefined
    ): Promise<vscode.Uri | undefined> {
        if (!choice) return undefined;

        switch (choice.value) {
            case 'create':
                return this.createNewFile(fileName);
            case 'current':
                return activeEditor?.document.uri;
            case 'search':
                return this.showFileSearch();
            default:
                return undefined;
        }
    }

    private static async showFileSearch(): Promise<vscode.Uri | undefined> {
        const files = await SearchUtils.findWorkspaceFiles();
        const selected = await vscode.window.showQuickPick(
            files.map(f => ({
                label: path.basename(f.fsPath),
                description: vscode.workspace.asRelativePath(f),
                uri: f
            })),
            { placeHolder: 'Select an existing file' }
        );
        return selected?.uri;
    }

    private static async selectFromMultipleFiles(files: vscode.Uri[]): Promise<vscode.Uri | undefined> {
        const selected = await vscode.window.showQuickPick(
            files.map(f => ({
                label: path.basename(f.fsPath),
                description: vscode.workspace.asRelativePath(f),
                uri: f
            })),
            { placeHolder: 'Select an existing file to use' }
        );
        return selected?.uri;
    }

    private static async createNewFile(newFileName?: string): Promise<vscode.Uri | undefined> {
        // First try to get the directory of the active file
        const activeEditor = vscode.window.activeTextEditor;
        let targetFolder: vscode.Uri;

        if (activeEditor) {
            // Use the directory of the active file
            targetFolder = vscode.Uri.file(path.dirname(activeEditor.document.uri.fsPath));
        } else {
            // Fall back to workspace folder selection
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace folder open');
                return undefined;
            }

            // If multiple folders, let user choose
            if (workspaceFolders.length > 1) {
                const folderChoice = await vscode.window.showQuickPick(
                    workspaceFolders.map(folder => ({
                        label: folder.name,
                        uri: folder.uri
                    })),
                    { placeHolder: 'Select folder for new file' }
                );
                if (!folderChoice) return undefined;
                targetFolder = folderChoice.uri;
            } else {
                targetFolder = workspaceFolders[0].uri;
            }
        }

        let fileName: string | undefined;

        if (!newFileName) {
            // Get filename from user
            fileName = await vscode.window.showInputBox({
                prompt: 'Enter the new file name',
                placeHolder: 'example.ts'
            });
        } else {
            // Extract filename from fileUri
            fileName = newFileName;
        }

        if (!fileName) return undefined;

        const newFileUri = vscode.Uri.joinPath(targetFolder, fileName);
        await vscode.workspace.fs.writeFile(newFileUri, new Uint8Array());
        return newFileUri;
    }
}
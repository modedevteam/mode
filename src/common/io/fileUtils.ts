import * as path from 'path';
import * as vscode from 'vscode';

// Detects a filename from a line of text. Returns the filename if detected, or null if no filename is detected.
export function detectFileNameUri(line: string): { filename: string | null, fileUri: string | null } {
    const trimmedLine = line.trim();
    
    // Clean the line by removing common prefixes
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
        if (!fileUri) {
            return this.handleEmptyUri();
        }

        let uri: vscode.Uri;

        if (path.isAbsolute(fileUri)) {
            // For absolute paths, use vscode.Uri.file
            uri = vscode.Uri.file(fileUri);
        } else {
            try {
                // Try to parse the fileUri as a URI with a scheme
                uri = vscode.Uri.parse(fileUri);
            } catch {
                // If parsing fails, assume it's a relative file path
                uri = vscode.Uri.file(fileUri);
            }
        }

        // Look for similar files
        const files = await vscode.workspace.findFiles(`**/${path.basename(uri.fsPath)}`);

        if (files.length === 0) {
            // No similar files found, offer options
            const activeEditor = vscode.window.activeTextEditor;
            const options = [
                {
                    label: "$(file-add) Create at specified location",
                    value: 'create'
                },
                {
                    label: "$(file) Apply to current file",
                    description: activeEditor ? vscode.workspace.asRelativePath(activeEditor.document.uri) : "No file open",
                    value: 'current',
                    disabled: !activeEditor
                },
                {
                    label: "$(close) Cancel",
                    value: 'cancel'
                }
            ];

            const choice = await vscode.window.showQuickPick(options, {
                placeHolder: 'No similar files found. What would you like to do?'
            });

            if (choice?.value === 'create') {
                await vscode.workspace.fs.writeFile(uri, new Uint8Array());
                return uri;
            } else if (choice?.value === 'current' && activeEditor) {
                return activeEditor.document.uri;
            }
            return undefined;
        }

        // Exact match: If exactly one file is found, return it directly
        if (files.length === 1) {
            return files[0];
        } else {
            // Multiple files found, let user pick
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
    }

    private static async handleEmptyUri(): Promise<vscode.Uri | undefined> {
        const activeEditor = vscode.window.activeTextEditor;

        const choice = await vscode.window.showQuickPick(
            [
                {
                    label: "$(file) Apply to current file",
                    description: activeEditor ? vscode.workspace.asRelativePath(activeEditor.document.uri) : "No file open",
                    value: 'current',
                    disabled: !activeEditor
                },
                {
                    label: "$(new-file) Create new file",
                    description: "Create a new file in the workspace",
                    value: 'new'
                }
            ],
            {
                placeHolder: 'What would you like to do?'
            }
        );

        if (!choice) {
            return undefined;
        }

        if (choice.value === 'current' && activeEditor) {
            return activeEditor.document.uri;
        } else if (choice.value === 'new') {
            return this.createNewFile();
        }

        return undefined;
    }

    private static async createNewFile(): Promise<vscode.Uri | undefined> {
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

        // Get filename from user
        const fileName = await vscode.window.showInputBox({
            prompt: 'Enter the new file name',
            placeHolder: 'example.ts'
        });

        if (!fileName) return undefined;

        const newFileUri = vscode.Uri.joinPath(targetFolder, fileName);
        await vscode.workspace.fs.writeFile(newFileUri, new Uint8Array());
        return newFileUri;
    }
}

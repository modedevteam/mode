import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileResolver } from '../../common/io/fileUtils';
import * as os from 'os';
import { AIModel } from '../../common/llms/aiModel';
import { AIClient, AIMessage } from '../../common/llms/aiClient';
import { ApiKeyManager } from '../../common/llms/aiApiKeyManager';
import { DIFF_MESSAGES } from '../../common/user-messages/messages';
import { ErrorMessages } from '../../common/user-messages/errorMessages';
import { diffMergePrompt } from '../../common/llms/aiPrompts';
import { getDiffProgressMessage } from '../../common/user-messages/messages';

export class DiffManager {
    private _applyChangesButton?: vscode.StatusBarItem;
    private _diffEditor?: vscode.TextEditor;
    constructor(
        private readonly _outputChannel: vscode.OutputChannel,
        private readonly _apiKeyManager: ApiKeyManager) {
    }

    private async setupAIClient(progress: vscode.Progress<{ message?: string; increment?: number }>) {
        const currentModel = AIModel.getLastUsedModel();
        const modelInfo = AIModel.getModelInfo(currentModel);
        if (!modelInfo) {
            throw new Error('No model configuration found');
        }

        progress.report({ message: getDiffProgressMessage('AI_INIT'), increment: 10 });
        const apiKey = await this._apiKeyManager.getApiKey(modelInfo.provider);
        if (!apiKey) {
            throw new Error(`No API key found for provider: ${modelInfo.provider}`);
        }

        const clientConfig = AIModel.getClientConfig(currentModel, apiKey);
        if (!clientConfig) {
            throw new Error('Failed to create AI client configuration');
        }

        return new AIClient(clientConfig);
    }

    private async prepareTemporaryFiles(chunks: string[]) {
        const tempDir = path.join(os.tmpdir(), 'vscode-chat-diffs');
        await fs.promises.mkdir(tempDir, { recursive: true });
        const rechunkedContent = chunks.join('\n').toString();
        const tempFilePath = path.join(tempDir, 'final-file.txt');
        await fs.promises.writeFile(tempFilePath, rechunkedContent);
        return { tempFilePath, tempUri: vscode.Uri.file(tempFilePath) };
    }

    private createInitialMessages(combinedChunks: string, proposedChanges: string): AIMessage[] {
        return [
            { role: 'system', content: diffMergePrompt(combinedChunks, proposedChanges) },
            { role: 'user', content: 'Return the modified chunks based on the file chunks and proposed changes' }
        ];
    }

    private async handleAIResponse(
        content: string,
        chunks: string[],
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        progressMessage: string
    ) {
        progress.report({
            message: `${progressMessage} 90%`,
            increment: 10
        });

        // Pre-compile regex patterns for better performance
        const CHANGES_PATTERN = /<changes>[\s\S]*?<\/changes>/g;
        const LINE_PATTERN = /<i>(\d+(?:\.\d+)?)<\/i>(?:<r>|<m>([\s\S]*?)<\/m>|<a>([\s\S]*?)<\/a>)/g;

        // If source file is empty (chunks is empty), just return the proposed changes directly
        if (chunks.length === 0) {
            const proposedContent = content.replace(CHANGES_PATTERN, '').trim();
            return [proposedContent];
        }

        // Convert chunks into tuple format and create a fast lookup map
        type LineEntry = [number, number, string];
        const linesMap = new Map<string, number>();
        let lines: LineEntry[] = chunks.map((content, index) => {
            const entry: LineEntry = [index, 0, content];
            linesMap.set(`${index}_0`, index);
            return entry;
        });

        const changesMatches = content.match(CHANGES_PATTERN);
        if (changesMatches) {
            // Pre-allocate array for better performance
            const newLines: LineEntry[] = [];
            
            changesMatches.forEach(match => {
                // Process all changes
                const lineMatches = match.matchAll(LINE_PATTERN);
                
                for (const lineMatch of Array.from(lineMatches)) {
                    const lineNumberStr = lineMatch[1];
                    const modifyContent = lineMatch[2];
                    const addContent = lineMatch[3];
                    
                    // Parse line number and handle fractional parts
                    const [baseNum, fraction] = lineNumberStr.split('.');
                    const primaryIndex = parseInt(baseNum, 10);
                    const secondaryIndex = fraction ? parseInt(fraction, 10) : 0;
                    
                    // Skip invalid line numbers
                    if (primaryIndex < 0 || primaryIndex >= chunks.length) {
                        continue;
                    }

                    const key = `${primaryIndex}_${secondaryIndex}`;
                    const existingIndex = linesMap.get(key);

                    if (addContent !== undefined) {
                        // Handle addition
                        const newIndex = lines.length;
                        lines.push([primaryIndex, secondaryIndex, addContent]);
                        linesMap.set(key, newIndex);
                    } else if (modifyContent !== undefined && existingIndex !== undefined) {
                        // Handle modification
                        lines[existingIndex][2] = modifyContent;
                    } else if (existingIndex !== undefined) {
                        // Handle removal
                        lines[existingIndex] = [-1, -1, '']; // Mark for removal
                        linesMap.delete(key);
                    }
                }
            });

            // Filter out removed lines and sort in one pass
            lines = lines
                .filter(([p]) => p !== -1)
                .sort(([p1, s1], [p2, s2]) => (p1 === p2) ? s1 - s2 : p1 - p2);
        }

        progress.report({
            message: `${progressMessage} 100%`,
            increment: 10
        });

        // Convert back to simple array of strings
        return lines.map(([_, __, content]) => content);
    }

    private async prepareAIDiff(originalUri: vscode.Uri, proposedChanges: string): Promise<vscode.Uri | null> {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: DIFF_MESSAGES.PROGRESS_TITLE,
            cancellable: false
        }, async (progress) => {
            try {
                // Setup stage (0-20%)
                progress.report({ 
                    message: getDiffProgressMessage('SETUP', 0),
                    increment: 10 
                });
                const aiClient = await this.setupAIClient(progress);
                progress.report({ 
                    message: getDiffProgressMessage('SETUP', 20),
                    increment: 10 
                });
                
                // File processing stage (20-40%)
                progress.report({ 
                    message: getDiffProgressMessage('FILE_PROCESSING', 20),
                    increment: 10 
                });
                const fileContent = await vscode.workspace.fs.readFile(originalUri);
                const lines = new TextDecoder().decode(fileContent).split('\n');
                const fileName = originalUri.path.split('/').pop() || '';
                const chunks = [
                    `<fn>${fileName}</fn>`, 
                    ...lines.map((content, index) => 
                        `<i>${index}</i><v>${content}</v>`
                    )
                ];
                progress.report({ 
                    message: getDiffProgressMessage('FILE_PROCESSING', 40),
                    increment: 10 
                });

                // Prepare temp files (40-50%)
                const { tempFilePath, tempUri } = await this.prepareTemporaryFiles(lines);
                progress.report({ 
                    message: getDiffProgressMessage('FINALIZING', 50),
                    increment: 10 
                });

                await vscode.commands.executeCommand('vscode.diff',
                    originalUri,
                    tempUri,
                    `Changes for ${path.basename(originalUri.fsPath)}`,
                    { preview: true }
                );

                // AI Processing stage (50-90%)
                const messages = this.createInitialMessages(chunks.join('\n'), proposedChanges);
                let processedTokens = 0;
                const estimatedTotalTokens = proposedChanges.length / 4; // Rough estimate

                await aiClient.chat(this._outputChannel, messages, {
                    onToken: () => {
                        processedTokens++;
                        if (processedTokens % 20 === 0) { // Update every 20 tokens
                            const aiProgress = Math.min(90, 50 + (processedTokens / estimatedTotalTokens) * 40);
                            progress.report({ 
                                message: getDiffProgressMessage('AI_PROCESSING', aiProgress),
                                increment: 1
                            });
                        }
                    },
                    onComplete: async (content: string) => {
                        // Finalizing stage (90-100%)
                        progress.report({ 
                            message: getDiffProgressMessage('FINALIZING', 90),
                            increment: 5 
                        });
                        const updatedChunks = await this.handleAIResponse(content, lines as string[], progress, getDiffProgressMessage('FINALIZING', 95));
                        await fs.promises.truncate(tempFilePath, 0);
                        await fs.promises.writeFile(tempFilePath, updatedChunks.join('\n'));
                        progress.report({ 
                            message: getDiffProgressMessage('FINALIZING', 100),
                            increment: 5 
                        });
                    }
                });

                return tempUri;
            } catch (error) {
                this._outputChannel.appendLine(ErrorMessages.APPLY_CHANGES_ERROR(error));
                this._outputChannel.show();
                return null;
            }
        });
    }

    async showDiff(rawCode: string, fileUri: string) {
        // Remove any existing "Apply Changes" button and open diff
        this.removeExistingDiffs();

        const originalUri = await FileResolver.resolveFile(fileUri);
        if (!originalUri) {
            return; // Abort if no file was resolved
        }

        const modifiedUri = await this.prepareAIDiff(originalUri, rawCode);
        // Return early if user cancelled the merge operation
        if (!modifiedUri) {
            return;
        }

        // Show the diff
        const title = `Changes for ${path.basename(originalUri.fsPath)}`;
        this._diffEditor = await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title, {
            preview: false
        }) as vscode.TextEditor;

        // Set up auto-save for the modified document
        const modifiedDocument = await vscode.workspace.openTextDocument(modifiedUri);
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
                const modifiedContent = await fs.promises.readFile(modifiedUri.fsPath, 'utf8');

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
                    uri: modifiedUri
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
            if (!editors.some(e => e.document.uri.fsPath === modifiedUri.fsPath)) {
                fs.unlink(modifiedUri.fsPath, (err) => {
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
}
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
import { FileChunker } from '../diff/fileChunker';
import { getDiffProgressMessage } from '../../common/user-messages/messages';
import { SessionManager } from '../../capabilities/chat/chatSessionManager';

export class DiffManager {
    private _applyChangesButton?: vscode.StatusBarItem;
    private _diffEditor?: vscode.TextEditor;
    constructor(
        private readonly _outputChannel: vscode.OutputChannel,
        private readonly _apiKeyManager: ApiKeyManager,
        private readonly _sessionManager: SessionManager) {
    }

    private async setupAIClient(progress: vscode.Progress<{ message?: string; increment?: number }>) {
        const currentModel = AIModel.getLastUsedModel();
        const modelInfo = AIModel.getModelInfo(currentModel);
        if (!modelInfo) {
            throw new Error('No model configuration found');
        }

        progress.report({ message: getDiffProgressMessage('WAKING_AI'), increment: 10 });
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

    private formatChunks(chunks: string[]): string {
        let combinedChunks = '';
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            combinedChunks += `<c>\n<ci>\n${i}</ci>\n<cv>\n${chunk}</cv>\n</c>`;
        }
        return combinedChunks;
    }

    private createInitialMessages(combinedChunks: string, proposedChanges: string): AIMessage[] {
        return [
            { role: 'system', content: diffMergePrompt(combinedChunks, proposedChanges) },
            { role: 'user', content: 'Return the modified chunks based on the file chunks and proposed changes' }
        ];
    }

    private async handleAIResponse(
        content: string,
        modifiedChunks: string[],
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        progressMessage: string
    ) {
        progress.report({
            message: `${progressMessage} 90%`,
            increment: 10
        });

        const modifiedChunksMatches = content.match(/<mc>[\s\S]*?<\/mc>/g);
        if (modifiedChunksMatches) {
            modifiedChunksMatches.forEach(match => {
                const indexMatch = match.match(/<ci>\s*(\d+)\s*<\/ci>/);
                const contentMatch = match.match(/<mcv>([\s\S]*?)<\/mcv>/);

                if (indexMatch && contentMatch) {
                    const chunkIndex = parseInt(indexMatch[1], 10);
                    const cleanedContent = contentMatch[1].trim();

                    if (chunkIndex >= 0 && chunkIndex < modifiedChunks.length) {
                        modifiedChunks[chunkIndex] = cleanedContent;
                    }
                }
            });
        }

        progress.report({
            message: `${progressMessage} 100%`,
            increment: 10
        });

        return modifiedChunks;
    }

    private async prepareAIDiff(originalUri: vscode.Uri, proposedChanges: string): Promise<vscode.Uri | null> {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: DIFF_MESSAGES.PROGRESS_TITLE,
            cancellable: false
        }, async (progress) => {
            try {
                const aiClient = await this.setupAIClient(progress);
                const chunks = await new FileChunker(originalUri).chunk();
                const { tempFilePath, tempUri } = await this.prepareTemporaryFiles(chunks);

                await vscode.commands.executeCommand('vscode.diff',
                    originalUri,
                    tempUri,
                    `Changes for ${path.basename(originalUri.fsPath)}`,
                    { preview: true }
                );

                const combinedChunks = this.formatChunks(chunks);
                const messages = this.createInitialMessages(combinedChunks, proposedChanges);

                let tokenCount = 0;
                const totalExpectedLines = chunks.length;
                const modifiedChunks = chunks;
                const progressMessage = getDiffProgressMessage('AI_PROCESSING');
                let lastReportedProgress = 10;

                await aiClient.chat(this._outputChannel, messages, {
                    onToken: (token: string) => {
                        const newlines = (token.match(/\n/g) || []).length;
                        tokenCount += newlines;
                        const tokenProgressPercent = Math.min(80, (tokenCount / totalExpectedLines) * 100);
                        const actualProgressIncrement = tokenProgressPercent - lastReportedProgress;
                        lastReportedProgress = tokenProgressPercent;

                        progress.report({
                            message: `${progressMessage} ${tokenProgressPercent.toFixed(0)}%`,
                            increment: actualProgressIncrement
                        });
                    },
                    onComplete: async (content: string) => {

                        // save in the chat session as a diagnostic message
                        this._sessionManager.getCurrentSession()?.messages.push({
                            role: "assistant",
                            content: content,
                            name: "Mode.Diagnostics.Diff"
                        });

                        const updatedChunks = await this.handleAIResponse(content, modifiedChunks, progress, progressMessage);
                        await fs.promises.truncate(tempFilePath, 0);
                        await fs.promises.writeFile(tempFilePath, updatedChunks.join('\n'));
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
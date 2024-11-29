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
import { SessionManager } from '../chat/chatSessionManager';

export class DiffManager {
    private _applyChangesButton?: vscode.StatusBarItem;
    private _diffEditor?: vscode.TextEditor;
    constructor(
        private readonly _outputChannel: vscode.OutputChannel,
        private readonly _apiKeyManager: ApiKeyManager,
        private readonly _sessionManager: SessionManager
    ) {
    }

    private async setupAIClient(progress: vscode.Progress<{ message?: string; increment?: number }>) {
        const currentModel = AIModel.getLastUsedModel();
        const modelInfo = AIModel.getModelInfo(currentModel);
        if (!modelInfo) {
            throw new Error('No model configuration found');
        }

        progress.report({ message: getDiffProgressMessage('AI_INIT'), increment: 2.5 });
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
        proposedChanges: string,
        chunks: string[],
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        progressMessage: string
    ) {
        progress.report({
            message: `${progressMessage} 97.5%`,
            increment: 2.5
        });

        console.log("proposedChanges", proposedChanges);

        const LINE_PATTERN = /{{i}}(\d+(?:\.\d+)?){{\/i}}(?:{{r}}|{{m}}([\s\S]*?){{\/m}}|{{a}}([\s\S]*?){{\/a}})/g;

        if (chunks.length === 0) {
            return [proposedChanges.trim()];
        }

        type LineEntry = [number, number, string];
        const linesMap = new Map<string, number>();
        let lines: LineEntry[] = chunks.map((content, index) => {
            const entry: LineEntry = [index, 0, content];
            linesMap.set(`${index}_0`, index);
            return entry;
        });

        const lineMatches = proposedChanges.matchAll(LINE_PATTERN);
        for (const lineMatch of Array.from(lineMatches)) {
            const lineNumberStr = lineMatch[1];
            const modifyContent = lineMatch[2];
            const addContent = lineMatch[3];

            // Adjust index to be zero-based
            const [baseNum, fraction] = lineNumberStr.split('.');
            const primaryIndex = parseInt(baseNum, 10) - 1;  // Decrement by 1
            const secondaryIndex = fraction ? parseInt(fraction, 10) : 0;

            // Skip if the primary index is out of bounds
            if (primaryIndex < 0) {
                continue;
            }

            const key = `${primaryIndex}_${secondaryIndex}`;
            const existingIndex = linesMap.get(key);

            if (addContent !== undefined) {
                if (existingIndex !== undefined) {
                    // Override the existing value
                    lines[existingIndex][2] = addContent;
                } else {
                    // Add new entry
                    const newIndex = lines.length;
                    lines.push([primaryIndex, secondaryIndex, addContent]);
                    linesMap.set(key, newIndex);
                }
            } else if (modifyContent !== undefined && existingIndex !== undefined) {
                // Modify existing content
                lines[existingIndex][2] = modifyContent;
            } else if (existingIndex !== undefined) {
                // Mark for removal
                lines[existingIndex] = [-1, -1, ''];
                linesMap.delete(key);
            }
        }

        console.log("linesMap");
        // Print the linesMap in the specified format
        lines.forEach(([primaryIndex, secondaryIndex, content]) => {
            const lineIndex = secondaryIndex > 0 ? `${primaryIndex + 1}.${secondaryIndex}` : `${primaryIndex + 1}`;
            console.log(`{{i}}${lineIndex}{{/i}}{{v}}${content}{{/v}}`);
        });

        lines = lines.filter(([p]) => p !== -1)
            .sort(([p1, s1], [p2, s2]) => (p1 === p2) ? s1 - s2 : p1 - p2);

        progress.report({
            message: `${progressMessage} 100%`,
            increment: 2.5
        });
        return lines.map(([_, __, content]) => content);
    }

    private async prepareAIDiff(originalUri: vscode.Uri, proposedChanges: string, pregeneratedChanges: boolean = false): Promise<vscode.Uri | null> {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: DIFF_MESSAGES.PROGRESS_TITLE,
            cancellable: false
        }, async (progress) => {
            try {
                // Setup stage (0-5%)
                progress.report({
                    message: getDiffProgressMessage('SETUP', 0),
                    increment: 2.5
                });
                const aiClient = await this.setupAIClient(progress);
                progress.report({
                    message: getDiffProgressMessage('SETUP', 5),
                    increment: 2.5
                });

                // File processing stage (5-10%)
                progress.report({
                    message: getDiffProgressMessage('FILE_PROCESSING', 5),
                    increment: 2.5
                });
                const fileContent = await vscode.workspace.fs.readFile(originalUri);
                const lines = new TextDecoder().decode(fileContent).split('\n');
                const fileName = originalUri.path.split('/').pop() || '';
                const chunks = [
                    `<fn>${fileName}</fn>`,
                    ...lines.map((content, index) =>
                        `<i>${index + 1}</i><v>${content}</v>`
                    )
                ];
                progress.report({
                    message: getDiffProgressMessage('FILE_PROCESSING', 10),
                    increment: 2.5
                });

                // Prepare temp files (10-15%)
                const { tempFilePath, tempUri } = await this.prepareTemporaryFiles(lines);
                progress.report({
                    message: getDiffProgressMessage('AI_INIT', 15),
                    increment: 5
                });

                // AI Processing stage (15-95%)
                if (pregeneratedChanges) {
                    // skip the AI processing stage
                    const updatedChunks = await this.handleAIResponse(proposedChanges, lines as string[], progress, getDiffProgressMessage('FINALIZING', 97.5));
                    await fs.promises.truncate(tempFilePath, 0);
                    await fs.promises.writeFile(tempFilePath, updatedChunks.join('\n'));
                    progress.report({
                        message: getDiffProgressMessage('FINALIZING', 100),
                        increment: 2.5
                    });
                } else {
                    const messages = this.createInitialMessages(chunks.join('\n'), proposedChanges);
                    let processedTokens = 0;
                    const estimatedTotalTokens = proposedChanges.length / 4; // Rough estimate

                    await aiClient.chat(this._outputChannel, messages, {
                        onToken: () => {
                            processedTokens++;
                            if (processedTokens % 20 === 0) { // Update every 20 tokens
                                const aiProgress = Math.min(95, 15 + (processedTokens / estimatedTotalTokens) * 80);
                                progress.report({
                                    message: getDiffProgressMessage('AI_PROCESSING', aiProgress),
                                    increment: 1
                                });
                            }
                        },
                        onComplete: async (content: string) => {
                            console.log("Changes received", content);
                            // Finalizing stage (95-100%)
                            progress.report({
                                message: getDiffProgressMessage('FINALIZING', 95),
                                increment: 2.5
                            });
                            const updatedChunks = await this.handleAIResponse(content, lines as string[], progress, getDiffProgressMessage('FINALIZING', 97.5));
                            await fs.promises.truncate(tempFilePath, 0);
                            await fs.promises.writeFile(tempFilePath, updatedChunks.join('\n'));
                            progress.report({
                                message: getDiffProgressMessage('FINALIZING', 100),
                                increment: 2.5
                            });
                        }
                    });
                }

                return tempUri;
            } catch (error) {
                this._outputChannel.appendLine(ErrorMessages.APPLY_CHANGES_ERROR(error));
                this._outputChannel.show();
                return null;
            }
        });
    }

    async showDiff(rawCode: string, fileUri: string, codeId: string) {
        // Remove any existing "Apply Changes" button and open diff
        this.removeExistingDiffs();

        const originalUri = await FileResolver.resolveFile(fileUri);
        if (!originalUri) {
            return; // Abort if no file was resolved
        }

        let modifiedUri: vscode.Uri | null;

        const proposedChanges = codeId ? this._sessionManager.getCurrentSession().codeMap[codeId] : rawCode;
        const usePregeneratedChanges = !!(codeId && proposedChanges && proposedChanges.trim() !== '');
        modifiedUri = await this.prepareAIDiff(originalUri, proposedChanges || '', usePregeneratedChanges);

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
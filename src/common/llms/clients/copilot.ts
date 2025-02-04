/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AIMessage } from "./llm.client";
import { StreamCallbacks } from "./llm.client";
import * as vscode from 'vscode';

export interface FileChangesParameters {
	explanation: string;
	changes: {
		filePath: string;
		language: string;
		fileAction: string;
		updateAction: string;
		searchContent: string;
		replaceContent: string;
		explanation?: string;
		end_change: string;
	}[];
}

/**
 * Invocation is no/op because we're handling that in @message.handler.ts
 */
export class FileChangesTool implements vscode.LanguageModelTool<FileChangesParameters> {
    name = 'apply_file_changes';
    description = 'Apply changes to files in the codebase';
	

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<FileChangesParameters>,
        token: vscode.CancellationToken
    ) {
        return new vscode.LanguageModelToolResult([]);
    }

    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<any>,
        _token: vscode.CancellationToken
    ) {
        return {
            invocationMessage: '',
            confirmationMessages: undefined
        };
    }
}

export class CopilotLanguageModelAPIClient {

    constructor() {
    }

    public async chat(model: string, messages: AIMessage[], callbacks: StreamCallbacks): Promise<string> {
        try {
            // Convert AIMessages to LanguageModelChatMessage format
            const formattedMessages = messages.map(msg => 
                msg.role === 'system' || msg.role === 'assistant'
                    ? vscode.LanguageModelChatMessage.Assistant(msg.content)
                    : vscode.LanguageModelChatMessage.User(msg.content)
            );

			// Select the model
            const [selectedModel] = await vscode.lm.selectChatModels({
				vendor: 'copilot',
				family: model.replace('copilot/', ''),
            });

            if (!selectedModel) {
                const infoMessage = 
                    'Welcome! To use Copilot models with Mode, please install GitHub Copilot from the VS Code marketplace, sign in to your GitHub account to activate Copilot, and return to Mode to try again. Need help? Visit our Discord server or our Github.';
                
                // Show warning popup
                void vscode.window.showInformationMessage(infoMessage);
                
                throw new Error(`Model ${model} not available`);
            }

            // Define the file changes tool
            const fileChangesTool = new FileChangesTool();

            // Send the request with tool support
            const response = await selectedModel.sendRequest(
                formattedMessages,
                {
                    tools: [fileChangesTool],
                    toolMode: vscode.LanguageModelChatToolMode.Auto
                },
                new vscode.CancellationTokenSource().token
            );

            let fullResponse = '';
            const toolCallParts: vscode.LanguageModelToolCallPart[] = [];

            // Handle both text and tool calls from the response
            for await (const part of response.stream) {
                if (part instanceof vscode.LanguageModelTextPart) {
                    fullResponse += part.value;
					callbacks.onToken?.({
                        type: 'text',
                        content: part.value
                    });
                } else if (part instanceof vscode.LanguageModelToolCallPart) {
                    // Aggregate tool call parts before invoking
                    toolCallParts.push(part);
                    for await (const nextPart of response.stream) {
                        if (nextPart instanceof vscode.LanguageModelToolCallPart) {
                            toolCallParts.push(nextPart);
                        } else {
                            // If we hit a non-tool call part, break and handle it in the outer loop
                            break;
                        }
                    }
                }
            }

            // // Aggregate all tool call parts into a single object
            // if (toolCallParts.length > 0) {
            //     const aggregatedToolCall = toolCallParts.reduce((acc, part) => ({
            //         ...acc,
            //         ...part
            //     }), {});

            //     // Transform the tool call to match OpenAI schema
            //     const transformedToolCall = this.transformToOpenAIToolCall(aggregatedToolCall);
            //     callbacks.onToken({
            //         type: 'text',
            //         content: transformedToolCall
            //     });
            //     callbacks.onComplete(transformedToolCall);
            // }
            callbacks.onComplete(fullResponse);
            return fullResponse;
        } catch (err) {
            let publishWarning = false;
            if (err instanceof vscode.LanguageModelError) {
                if (err.code.startsWith('400')) {
                    publishWarning = true;
                }
                console.error(`Language Model Error: ${err.message} (${err.code})`);
            } else {
                const errString = String(err);
                if (errString.includes('400 Bad Request')) {
                    publishWarning = true;
                }
                console.error(err instanceof Error ? err : errString);
            }
            if (publishWarning) {
                const warningMessage = 
                    'This request could not be completed. This may be because the model is restricted to a higher tier. Please verify your access or try a different model.';
                void vscode.window.showWarningMessage(warningMessage);
            }
            throw err;
        }
    }

    private transformToOpenAIToolCall(toolCall: any): any {
        if (toolCall.name !== 'apply_file_changes') {
            return toolCall;
        }

        const input = toolCall.input;
        let changes;
        
        if (Array.isArray(input)) {
            changes = input.map(change => ({
                ...change,
                end_change: 'end',
                explanation: undefined
            }));
        } else {
            changes = [{
                filePath: input.filePath,
                language: input.language,
                fileAction: input.fileAction,
                updateAction: input.updateAction,
                searchContent: input.searchContent,
                replaceContent: input.replaceContent,
                end_change: 'END_OF_CHANGE'
            }];
        }

        // Return JSON string of the transformed object
        return JSON.stringify({
			name: 'apply_file_changes',
			changes,
			explanation: input.explanation
        });
    }
}


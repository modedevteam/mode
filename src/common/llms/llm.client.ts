/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CohereClientV2 as Cohere } from 'cohere-ai';
import { Mistral } from '@mistralai/mistralai';
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { LLMChatParams } from './llm.chat.params';

export interface AIMessage {
    role: 'user' | 'assistant' | 'system';
    content: string | Array<any>;
    name?: string;
    type?: 'image';
}

export interface AIClientConfig {
    provider: string;
    apiKey?: string;
    model: string;
    endpoint?: string;
}

export interface StreamToken {
    type: 'text' | 'tool' | 'tool-complete';
    content: string;
    toolCall?: any;
}

export interface StreamCallbacks {
    onToken: (token: StreamToken) => void;
    onComplete: (fullText: string) => void;
    onToolCall?: (toolCall: any) => void;
}

export class AIClient {
    private anthropicClient?: anthropic.Anthropic;
    private openaiClient?: OpenAI;
    private googleClient?: GoogleGenerativeAI;
    private cohereClient?: Cohere;
    private mistralClient?: Mistral;
    private provider: string;
    private model!: string;
    private isCancelled = false;
    private googleFileManager?: GoogleAIFileManager;

    constructor(config: AIClientConfig) {
        this.provider = config.provider;

        switch (config.provider) {
            case 'anthropic':
                this.anthropicClient = new anthropic.Anthropic({ apiKey: config.apiKey });
                this.model = config.model;
                break;
            case 'openai':
                this.openaiClient = new OpenAI({ apiKey: config.apiKey });
                this.model = config.model;
                break;
            case 'google':
                this.googleClient = new GoogleGenerativeAI(config.apiKey!);
                this.googleFileManager = new GoogleAIFileManager(config.apiKey!);
                this.model = config.model;
                break;
            case 'cohere':
                this.cohereClient = new Cohere({ token: config.apiKey });
                this.model = config.model;
                break;
            case 'mistral':
                this.mistralClient = new Mistral({ apiKey: config.apiKey });
                this.model = config.model;
                break;
            case 'local':
                // dummy api key to allow local mode to work
                this.openaiClient = new OpenAI({ baseURL: config.endpoint, apiKey: "local"});
                this.model = config.model;
                break;
            case 'openrouter':
                this.openaiClient = new OpenAI({
                    baseURL: config.endpoint ? config.endpoint : "https://openrouter.ai/api/v1",
                    apiKey: config.apiKey,
                    defaultHeaders: {
                        "HTTP-Referer": "https://getmode.dev",
                        "X-Title": "Mode",
                    }
                });
                this.model = config.model;
                break;
        }
    }

    private filterDiagnosticMessages(messages: AIMessage[]): AIMessage[] {
        return messages.filter(msg => {
            if (typeof msg.content === 'string') {
                return !msg.content.startsWith('Mode.');
            }
            if (Array.isArray(msg.content)) {
                // For array content, check if any text elements start with 'Mode.'
                return !msg.content.some(item =>
                    typeof item === 'string' && item.startsWith('Mode.') ||
                    (item.type === 'text' && item.text?.startsWith('Mode.'))
                );
            }
            return true;
        });
    }

    async chat(messages: AIMessage[], callbacks: StreamCallbacks): Promise<string> {
        try {
            const filteredMessages = this.filterDiagnosticMessages(messages);

            switch (this.provider) {
                case 'anthropic':
                    return this.anthropicChat(filteredMessages, callbacks);
                case 'openai':
                    return this.openaiChat(filteredMessages, callbacks);
                case 'google':
                    return this.googleChat(filteredMessages, callbacks);
                case 'cohere':
                    return this.cohereChat(filteredMessages, callbacks);
                case 'mistral':
                    return this.mistralChat(filteredMessages, callbacks);
                case 'local':
                    return this.openaiChat(filteredMessages, callbacks);
                case 'openrouter':
                    return this.openaiChat(filteredMessages, callbacks);
                default:
                    throw new Error(`Unsupported provider: ${this.provider}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw error;
        }
    }

    public stopGeneration() {
        this.isCancelled = true;
    }

    private async anthropicChat(messages: AIMessage[], callbacks: StreamCallbacks): Promise<string> {
        this.isCancelled = false;
        if (!this.anthropicClient) throw new Error('Anthropic client not initialized');

        const systemMessage = messages.find(msg => msg.role === 'system')?.content;
        const nonSystemMessages = messages
            .filter(msg => msg.role !== 'system')
            .map(msg => ({
                role: msg.role as 'user' | 'assistant',
                content: typeof msg.content === 'string' && msg.content.startsWith('data:image')
                    ? AIClient.formatImageContent('anthropic', msg.content)
                    : Array.isArray(msg.content)
                        ? msg.content
                        : [{ type: 'text', text: msg.content as string }]
            }));

        let fullText = '';
        const response = await this.anthropicClient.messages.create({
            model: this.model,
            system: systemMessage,
            messages: nonSystemMessages,
            max_tokens: 8192,
            stream: true,
            temperature: LLMChatParams.temperature
        });

        try {
            for await (const chunk of response) {
                if (this.isCancelled) {
                    return fullText;
                }
                if (chunk.type === 'content_block_delta') {
                    const text = chunk.delta?.type === 'text_delta' ? chunk.delta.text : '';
                    if (text) {
                        fullText += text;
                        callbacks.onToken({
                            type: 'text',
                            content: text
                        });
                    }
                }
            }
        } catch (error) {
            if (this.isCancelled) {
                return fullText;
            }
            throw error;
        }
        callbacks.onComplete(fullText);
        return fullText;
    }

    private async openaiChat(messages: AIMessage[], callbacks: StreamCallbacks): Promise<string> {
        this.isCancelled = false;
        if (!this.openaiClient) throw new Error('OpenAI client not initialized');

        let fullText = '';
        let currentToolCall: any = null;
        let accumulatedArguments = '';

        const response = await this.openaiClient.chat.completions.create({
            model: this.model,
            messages: messages.map(msg => ({
                role: this.model.startsWith('o1') && msg.role === 'system' ? 'user' : msg.role,
                content: typeof msg.content === 'string' && msg.content.startsWith('data:image')
                    ? AIClient.formatImageContent('openai', msg.content)
                    : msg.content
            })),
            [this.model.startsWith('o1') ? 'max_completion_tokens' : 'max_tokens']: this.model.startsWith('o1') ? 32768 : 16384,
            stream: true,
            temperature: LLMChatParams.temperature,
            tool_choice: { type: "function", function: { name: "apply_file_changes" } },
            tools: [{
                type: "function",
                function: {
                    name: "apply_file_changes",
                    description: "Apply changes to files in the codebase",
                    parameters: {
                        type: "object",
                        properties: {
                            explanation: {
                                type: "string",
                                description: "Overall explanation of the changes being made"
                            },
                            changes: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        filePath: {
                                            type: "string",
                                            description: "Path to the file being modified"
                                        },
                                        fileAction: {
                                            type: "string",
                                            enum: ["modify", "create", "delete", "rename"],
                                            description: "Type of action to perform on the file"
                                        },
                                        updateAction: {
                                            type: "string",
                                            enum: ["replace", "delete"],
                                            description: "Type of update to perform within the file"
                                        },
                                        language: {
                                            type: "string",
                                            description: "Programming language of the file"
                                        },
                                        searchContent: {
                                            type: "string",
                                            description: "Original code to be replaced (exact copy)"
                                        },
                                        replaceContent: {
                                            type: "string",
                                            description: "New code that will replace the search content (not required for delete actions)"
                                        },
                                        explanation: {
                                            type: "string",
                                            description: "Explanation of why this specific change is being made"
                                        }
                                    },
                                    required: ["filePath", "fileAction", "updateAction", "language", "searchContent"],
                                    allOf: [{
                                        if: {
                                            properties: { fileAction: { const: "create" } }
                                        },
                                        then: {
                                            properties: {
                                                updateAction: {
                                                    enum: ["insert"]
                                                }
                                            }
                                        }
                                    }, {
                                        if: {
                                            properties: { updateAction: { const: "delete" } }
                                        },
                                        then: {
                                            // No additional required fields for delete action
                                        },
                                        else: {
                                            required: ["replaceContent"]
                                        }
                                    }, {
                                        if: {
                                            not: {
                                                properties: {
                                                    explanation: { type: "string" }
                                                }
                                            }
                                        },
                                        then: {
                                            // If no explanation is provided, require parent changes array to have length 1
                                            properties: {
                                                "/changes": {
                                                    maxItems: 1
                                                }
                                            }
                                        }
                                    }]
                                },
                                description: "List of file changes to apply"
                            }
                        },
                        required: ["changes", "explanation"]
                    }
                }
            }]
        }) as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

        try {
            for await (const chunk of response) {
                if (this.isCancelled) {
                    return fullText;
                }
                
                const toolCall = chunk.choices[0]?.delta?.tool_calls?.[0];
                const textContent = chunk.choices[0]?.delta?.content;

                if (toolCall) {
                    // Handle tool calls
                    if (toolCall.id || toolCall.function?.name) {
                        // End any previous tool call
                        if (currentToolCall && accumulatedArguments) {
                            callbacks.onToken({
                                type: 'tool-complete',
                                content: accumulatedArguments,
                                toolCall: currentToolCall
                            });
                            callbacks.onToolCall?.(currentToolCall);
                        }
                        
                        // Start new tool call
                        currentToolCall = {
                            index: toolCall.index,
                            id: toolCall.id,
                            type: 'function',
                            function: {
                                name: toolCall.function?.name,
                                arguments: ''
                            }
                        };
                        accumulatedArguments = '';
                    }
                    
                    if (toolCall.function?.arguments) {
                        accumulatedArguments += toolCall.function.arguments;
                        callbacks.onToken({
                            type: 'tool',
                            content: toolCall.function.arguments,
                            toolCall: currentToolCall
                        });
                    }
                }

                // Handle text content
                if (textContent) {
                    fullText += textContent;
                    callbacks.onToken({
                        type: 'text',
                        content: textContent
                    });
                }

                // Handle completion of tool calls
                if (chunk.choices[0]?.finish_reason === 'tool_calls') {
                    if (currentToolCall && accumulatedArguments) {
                        currentToolCall.function.arguments = accumulatedArguments;
                        callbacks.onToken({
                            type: 'tool-complete',
                            content: accumulatedArguments,
                            toolCall: currentToolCall
                        });
                        callbacks.onToolCall?.(currentToolCall);
                        currentToolCall = null;
                        accumulatedArguments = '';
                    }
                }
            }
        } catch (error) {
            if (this.isCancelled) {
                return fullText;
            }
            throw error;
        }
        
        // Handle any remaining tool call
        if (currentToolCall && accumulatedArguments) {
            currentToolCall.function.arguments = accumulatedArguments;
            callbacks.onToolCall?.(currentToolCall);
        }

        callbacks.onComplete(fullText);
        return fullText;
    }

    private async googleChat(messages: AIMessage[], callbacks: StreamCallbacks): Promise<string> {
        this.isCancelled = false;
        if (!this.googleClient || !this.googleFileManager) throw new Error('Google client not initialized');

        const filteredMessages = messages.filter(msg => msg.type !== 'image');

        const model = this.googleClient.getGenerativeModel({ model: this.model });

        const processedMessages = filteredMessages.map(msg => {
            const parts = typeof msg.content === 'string' && msg.content.startsWith('data:image')
                ? AIClient.formatImageContent('google', msg.content)
                : Array.isArray(msg.content)
                    ? msg.content
                    : [{ text: msg.content as string }];
            return {
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts
            };
        });

        const chat = model.startChat({
            history: processedMessages.slice(0, -1),
            generationConfig: {
                temperature: LLMChatParams.temperature,
                maxOutputTokens: 8192
            }
        });

        const lastMessage = processedMessages[processedMessages.length - 1];

        let fullText = '';
        try {
            const response = await chat.sendMessageStream(lastMessage.parts);

            for await (const chunk of response.stream) {
                if (this.isCancelled) {
                    return fullText;
                }
                const text = chunk.text();
                if (text) {
                    fullText += text;
                    callbacks.onToken({
                        type: 'text',
                        content: text
                    });
                }
            }
        } catch (error) {
            if (this.isCancelled) {
                return fullText;
            }
            throw error;
        }

        callbacks.onComplete(fullText);
        return fullText;
    }

    private async cohereChat(messages: AIMessage[], callbacks: StreamCallbacks): Promise<string> {
        this.isCancelled = false;
        if (!this.cohereClient) throw new Error('Cohere client not initialized');

        const filteredMessages = messages.filter(msg => msg.type !== 'image');

        let fullText = '';
        try {
            const response = await this.cohereClient.chatStream({
                model: this.model,
                messages: filteredMessages.map(msg => ({
                    role: msg.role,
                    content: msg.content
                })),
                temperature: LLMChatParams.temperature
            });

            for await (const chunk of response) {
                if (this.isCancelled) {
                    return fullText;
                }
                if (chunk.type === 'content-delta') {
                    const text = chunk.delta?.message?.content?.text || '';
                    if (text) {
                        fullText += text;
                        callbacks.onToken({
                            type: 'text',
                            content: text
                        });
                    }
                }
            }
        } catch (error) {
            if (this.isCancelled) {
                return fullText;
            }
            throw error;
        }
        callbacks.onComplete(fullText);
        return fullText;
    }

    private async mistralChat(messages: AIMessage[], callbacks: StreamCallbacks): Promise<string> {
        this.isCancelled = false;
        if (!this.mistralClient) throw new Error('Mistral client not initialized');

        const filteredMessages = messages.filter(msg => msg.type !== 'image');

        let fullText = '';
        try {
            const chatStreamResponse = await this.mistralClient.chat.stream({
                model: this.model,
                messages: filteredMessages.map(msg => ({
                    role: msg.role,
                    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                })),
                stream: true,
                temperature: LLMChatParams.temperature
            });

            for await (const chunk of chatStreamResponse) {
                if (this.isCancelled) {
                    return fullText;
                }
                const text = chunk.data.choices[0].delta.content || '';
                if (text && typeof text === 'string') {
                    fullText += text;
                    callbacks.onToken({
                        type: 'text',
                        content: text
                    });
                }
            }
        } catch (error) {
            if (this.isCancelled) {
                return fullText;
            }
            throw error;
        }
        callbacks.onComplete(fullText);
        return fullText;
    }

    private static formatImageContent(provider: string, imageData: string): any {
        switch (provider) {
            case 'anthropic':
                return [{
                    type: "image",
                    source: {
                        type: "base64",
                        media_type: imageData.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
                        data: imageData.replace(/^data:image\/(png|jpeg);base64,/, '')
                    }
                },
                {
                    type: "text",
                    text: "Describe this image."
                }];
            case 'openai':
                return [{
                    type: "image_url",
                    image_url: { url: imageData }
                }];
            case 'google':
                return [{
                    text: "Here's an image: "
                }, {
                    inlineData: {
                        data: imageData,
                        mimeType: imageData.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
                    }
                }];
            case 'mistral':
            case 'cohere':
                return `[Image input not supported for ${provider}]`;
            default:
                return `[Image]`;
        }
    }

    public getProvider(): string {
        return this.provider;
    }
} 
import type { AIClientConfig } from './aiClient';
import * as vscode from 'vscode';

export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'cohere' | 'mistral';

export interface ModelInfo {
    provider: ModelProvider;
    supportsVision?: boolean;
}

export class AIModel {
    private static readonly MODEL_MAPPINGS: Record<string, ModelInfo> = {
        'gpt-4o': {
            provider: 'openai',
            supportsVision: true,
        },
        'gpt-4o-mini': {
            provider: 'openai',
            supportsVision: true,
        },
        'o1-mini': {
            provider: 'openai'
        },
        'o1-preview': {
            provider: 'openai'
        },
        'claude-3-5-sonnet-latest': {
            provider: 'anthropic',
            supportsVision: true,
        },
        'claude-3-5-haiku-20241022': {
            provider: 'anthropic',
            supportsVision: true,
        },
        'gemini-1.5-flash': {
            provider: 'google',
        },
        'gemini-1.5-pro': {
            provider: 'google',
        },
        'command-r-plus-08-2024': {
            provider: 'cohere'
        },
        'command-light': {
            provider: 'cohere'
        },
        'mistral-large-latest': {
            provider: 'mistral'
        },
        'codestral-latest': {
            provider: 'mistral'
        },
    };

    private static extensionContext: vscode.ExtensionContext;

    public static initialize(context: vscode.ExtensionContext) {
        this.extensionContext = context;
    }

    public static getModelInfo(modelKey: string): ModelInfo | undefined {
        return this.MODEL_MAPPINGS[modelKey];
    }

    public static getAllModels(): Record<string, ModelInfo> {
        return { ...this.MODEL_MAPPINGS };
    }

    public static getDefaultModel(): string {
        return this.extensionContext.globalState.get('lastUsedModel', 'gpt-4o');
    }

    public static setLastUsedModel(modelId: string): void {
        this.extensionContext.globalState.update('lastUsedModel', modelId);
    }

    public static getClientConfig(modelKey: string, apiKey: string): AIClientConfig | undefined {
        const modelInfo = this.getModelInfo(modelKey);
        if (!modelInfo) return undefined;

        return {
            provider: modelInfo.provider,
            apiKey,
            model: modelKey
        };
    }
} 
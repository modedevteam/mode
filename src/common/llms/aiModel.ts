import type { AIClientConfig } from './aiClient';
import * as vscode from 'vscode';

interface ProviderConfig {
    name: string;
    models: string[];
    visible: boolean;
}

interface ModelConfigMap {
    [key: string]: ModelInfo;
}

export interface ModelInfo {
    provider: string;
}

export class AIModel {

    private static extensionContext: vscode.ExtensionContext;

    public static initialize(context: vscode.ExtensionContext) {
        this.extensionContext = context;
    }

    public static getModelInfo(modelKey: string): ModelInfo | undefined {
        return this.getModelInfoFromConfig(modelKey);
    }

    public static getAllModels(): Record<string, ModelInfo> {
        return this.getModelsFromConfig();
    }

    public static getLastUsedModel(): string {
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

    private static getModelInfoFromConfig(modelKey: string): ModelInfo | undefined {
        const providers = vscode.workspace.getConfiguration('mode').get<ProviderConfig[]>('providers') || [];
        
        for (const provider of providers) {
            if (provider.visible && provider.models.includes(modelKey)) {
                return {
                    provider: provider.name
                };
            }
        }
        
        return undefined;
    }

    private static getModelsFromConfig(): Record<string, ModelInfo> {
        const providers = vscode.workspace.getConfiguration('mode').get<ProviderConfig[]>('providers') || [];
        const modelMap: ModelConfigMap = {};

        for (const provider of providers) {
            if (provider.visible) {
                for (const model of provider.models) {
                    modelMap[model] = {
                        provider: provider.name
                    };
                }
            }
        }

        return modelMap;
    }
} 
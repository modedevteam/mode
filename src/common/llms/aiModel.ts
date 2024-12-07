export interface ProviderConfig {
    name: string;
    models: {
        name: string;
        endpoint?: string;
        vision?: boolean;
        largeContext?: boolean;
        autocomplete?: boolean;
    }[];
    visible: boolean;
}

export interface ModelConfigMap {
    [key: string]: ModelInfo;
}

export interface ModelInfo {
    provider: string;
    endpoint?: string;
}

export const PROVIDERS_CONFIG_KEY = 'providers';
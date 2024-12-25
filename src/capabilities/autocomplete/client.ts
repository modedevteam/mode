/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    workspace,
    window,
    languages,
    InlineCompletionItemProvider,
    InlineCompletionItem,
    InlineCompletionList,
    TextDocument,
    Position,
    CancellationToken,
    InlineCompletionContext,
    InlineCompletionTriggerKind,
    Range,
    ExtensionContext
} from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  InsertTextMode
} from 'vscode-languageclient/node';
import { CompletionItem } from 'vscode-languageserver-protocol';
import { ApiKeyManager } from '../../common/llms/aiApiKeyManager';
import { isAutoCompleteEnabled } from '../../common/configUtils';
import { getPromptOverride } from '../../common/configUtils';
import { AIModelUtils } from '../../common/llms/aiModelUtils';
import { State } from 'vscode-languageclient';
import { Logger } from './logging';
import { codeCompletionPrompt } from '../../common/llms/aiPrompts';

export class LanguageServerClient {
  private client: LanguageClient;
  private outputChannel = window.createOutputChannel('Language Server Output');

  constructor(serverPath: string, private context: ExtensionContext) {
    // Server options
    const serverOptions: ServerOptions = {
      run: { 
        module: context.asAbsolutePath('out/capabilities/autocomplete/server.js'), 
        transport: TransportKind.ipc 
      },
      debug: {
        module: context.asAbsolutePath('out/capabilities/autocomplete/server.js'),
        transport: TransportKind.ipc,
        options: {
          execArgv: ['--nolazy', '--inspect=6009']
        }
      }
    };

    // Initialize options synchronously
    const initOptions: any = {};

    // Updated client options
    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ scheme: 'file' }],
      outputChannel: this.outputChannel,
      synchronize: {
        fileEvents: workspace.createFileSystemWatcher('**/*')
      },
      middleware: {
        provideCompletionItem: async (document, position, context, token, next) => {
          return next(document, position, context, token);
        }
      },
      // Set initialization options synchronously
      initializationOptions: initOptions
    };

    // Create the language client
    this.client = new LanguageClient(
      'languageServer',
      'Language Server',
      serverOptions,
      clientOptions
    );

    // Initialize options before starting the client
    this.initializeOptions().then(options => {
      Object.assign(initOptions, options);
      Logger.info('[Client] Initialization options set:', options);
    }).catch(error => {
      Logger.error('[Client] Failed to initialize options:', error);
    });

    // Register the inline completion provider
    const inlineProvider: InlineCompletionItemProvider = {
      provideInlineCompletionItems: async (
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken
      ): Promise<InlineCompletionList> => {
        // Only trigger for automatic suggestions
        if (context.triggerKind !== InlineCompletionTriggerKind.Automatic) {
          return { items: [] };
        }

        // Get the current line text up to the cursor position
        const lineText = document.lineAt(position.line).text;
        const currentLinePrefix = lineText.substring(0, position.character);

        const completions = await this.client.sendRequest('textDocument/completion', {
          textDocument: { uri: document.uri.toString() },
          position: position,
          context: {
            triggerKind: 1,
            currentLinePrefix // Send the current line prefix for context
          }
        });

        // Convert LSP completions to inline completions
        const items = (completions as CompletionItem[]).map(completion => {
          const insertText = completion.insertText || completion.label;
          
          // If the text starts with a newline, adjust the range to start from the beginning of the next line
          const startsWithNewline = insertText.startsWith('\n');
          const startPosition = startsWithNewline 
            ? new Position(position.line + 1, 0)
            : position;
          
          return new InlineCompletionItem(
            insertText,
            new Range(startPosition, startPosition),
            {
              command: 'editor.action.inlineCompletion.commit',
              title: 'Accept Completion'
            }
          );
        });

        return { items };
      }
    };

    // Only register the inline completion provider if autocomplete is enabled
    const autoCompleteEnabled = isAutoCompleteEnabled();

    if (autoCompleteEnabled) {
      // Register the provider for all languages
      languages.registerInlineCompletionItemProvider({ pattern: '**' }, inlineProvider);
    } else {
      Logger.info('[Client] Autocomplete is disabled via configuration');
    }
  }

  private async initializeOptions() {
    const apiKeyManager = new ApiKeyManager(this.context);
    const currentModel = AIModelUtils.getLastUsedModel();
    const autocompleteModel = AIModelUtils.findCompatibleAutocompleteModel(currentModel);
    const modelInfo = AIModelUtils.getModelInfo(autocompleteModel)!;
    const apiKey = await apiKeyManager.getApiKey(modelInfo.provider);
    const endpoint = modelInfo.endpoint || undefined;
    const prompt = this.getPrompt();
    
    return { 
      apiKey,
      model: autocompleteModel,
      provider: modelInfo.provider,
      endpoint,
      prompt
    };
  }

  private getPrompt(): string {
    const promptOverride = getPromptOverride();
    return promptOverride || codeCompletionPrompt;
  }

  public async start(): Promise<void> {
    try {
      const autoCompleteEnabled = isAutoCompleteEnabled();

      if (!autoCompleteEnabled) {
        Logger.info('[Client] Skipping language server start - autocomplete is disabled');
        return;
      }

      // Wait for initialization options to be set
      await this.initializeOptions();
      
      // Add timeout to prevent hanging
      const startPromise = this.client.start();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Client start timeout after 10s')), 10000);
      });

      await Promise.race([startPromise, timeoutPromise]);
    } catch (error) {
      Logger.error('Failed to start language server:', error);
      await this.stop(false);
      throw error;
    }
  }

  public async stop(dispose: boolean = true): Promise<void> {
    try {
      if (this.client) {
        // Only attempt to stop if client exists and is running
        const state = this.client.state;
        if (state === State.Running) {
          await this.client.stop();
        }
      }
    } catch (error) {
      Logger.error('Error stopping language server:', error);
    } finally {
      // Only dispose the single output channel if requested
      if (dispose) {
        this.outputChannel.dispose();
      }
    }
  }

  public getClient(): LanguageClient {
    return this.client;
  }
} 
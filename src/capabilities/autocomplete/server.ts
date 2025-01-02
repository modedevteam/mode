/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  CompletionItem,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  CompletionItemKind,
  InsertTextFormat,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { AIClientFactory } from '../../common/llms/llm.client.factory';
import { AIClient } from '../../common/llms/llm.client';
import { Logger, DEBUG_MODE } from './logging';

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

// Replace the direct console.info with Logger
Logger.initialize(connection);
Logger.info('[Server] Language Server Starting...');

// Create a text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Add after connection declaration
let aiClient: AIClient | null = null;

// Add near the top where other variables are declared
let initOptions: any = null;

connection.onInitialize(async (params: InitializeParams) => {  
  Logger.debug('----------------------------------------');
  Logger.debug('[Server] Initialization Started');
  
  initOptions = params.initializationOptions;  // Store in higher scope
  
  if (initOptions && typeof initOptions === 'object') {
    Logger.debug(`[Server] Provider: ${initOptions.provider}`);
    Logger.debug(`[Server] Model: ${initOptions.model}`);
    Logger.debug(`[Server] API Key: ${initOptions.apiKey ? 'PROVIDED' : 'NOT PROVIDED'}`);
    Logger.debug(`[Server] Endpoint: ${initOptions.endpoint ? 'PROVIDED' : 'NOT PROVIDED'}`);
    Logger.debug(`[Server] Prompt: ${initOptions.prompt}`);
    try {
      const clientResult = await AIClientFactory.createClient(
        initOptions.provider,
        initOptions.model,
        initOptions.apiKey,
        initOptions.endpoint
      );
      
      if (!clientResult.success || !clientResult.client) {
        Logger.error(`[Server] Client initialization failed: ${clientResult.message}`);
      } else {
        aiClient = clientResult.client; // Store the client instance
        Logger.info('[Server] AI Client successfully initialized');
      }
    } catch (error: unknown) {
      Logger.error(`[Server] Error during client initialization: ${(error as Error).message}`);
    }
  } else {
    Logger.info('[Server] Warning: No initialization options received');
  }

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ['.']
      }
    }
  };
  
  Logger.debug('[Server] Initialization Complete');
  Logger.debug('----------------------------------------');
  return result;
});

// Enhanced completion logging
connection.onCompletion(
  async (_textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
    Logger.debug('----------------------------------------');
    Logger.debug('[Server] Completion Request Received');
    Logger.debug(`[Server] Document URI: ${_textDocumentPosition.textDocument.uri}`);
    Logger.debug(`[Server] Position - Line: ${_textDocumentPosition.position.line}, Character: ${_textDocumentPosition.position.character}`);

    if (!aiClient) {
      Logger.error('[Server] AI Client is not initialized');
      return [];
    }

    try {
      const document = documents.get(_textDocumentPosition.textDocument.uri);
      const position = _textDocumentPosition.position;
      
      // Get context window of lines before and after cursor
      const contextWindowSize = 10; // Adjust this number as needed
      const startLine = Math.max(0, position.line - contextWindowSize);
      const endLine = Math.min((document?.lineCount || 0) - 1, position.line + contextWindowSize);
      
      // Get the relevant text range
      const relevantText = document?.getText({
        start: { line: startLine, character: 0 },
        end: { line: endLine, character: Number.MAX_VALUE }
      });

      // Format the text to match the expected prompt format
      const lines = relevantText?.split('\n') || [];
      const cursorLineIndex = position.line - startLine;
      const cursorLine = lines[cursorLineIndex];
      
      const formattedText = [
        // Code before cursor
        lines.slice(0, cursorLineIndex).join('\n'),
        // Current line with cursor
        `Current line: ${cursorLine.slice(0, position.character)}{0}${cursorLine.slice(position.character)}`,
        // Code after cursor
        lines.slice(cursorLineIndex + 1).join('\n')
      ].join('\n');

      const messages = [
        {
          role: 'system' as const,
          content: initOptions.prompt
        },
        { 
          role: 'user' as const, 
          content: `Language: ${document?.languageId || 'unknown'}\n${formattedText || ''}` 
        }
      ];

      // Use the AI client to get completions
      const completions: CompletionItem[] = [];
      await aiClient.chat(messages, {
        onToken: (token: string) => {
          // Accumulate tokens into a single string if needed
        },
        onComplete: (fullText: string) => {
          // Trim any surrounding quotes and convert \n to actual newlines
          const trimmedText = fullText
            .replace(/^["']|["']$/g, '')
            .replace(/\\n/g, '\n');
          
          completions.push({
            label: trimmedText,
            kind: CompletionItemKind.Text,
            insertText: trimmedText,
            insertTextFormat: InsertTextFormat.PlainText
          });
          Logger.info(`[Server] Full completion text: ${trimmedText}`);
        }
      });

      Logger.info(`[Server] Returning ${completions.length} completion items`);
      return completions;
    } catch (error: unknown) {
      Logger.error(`[Server] Error during completion: ${(error as Error).message}`);
      return [];
    } finally {
      Logger.debug('----------------------------------------');
    }
  }
);

// Add after onCompletion handler
connection.onCompletionResolve(
  (item: CompletionItem): CompletionItem => {
    return item;
  }
);

// Make the text document manager listen on the connection
documents.listen(connection);

// Listen on the connection
connection.listen(); 
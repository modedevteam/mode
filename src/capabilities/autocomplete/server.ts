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
  CompletionItemTag
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { AIClientFactory } from '../../common/llms/aiClientFactory';
import { AIClient } from '../../common/llms/aiClient';
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

connection.onInitialize(async (params: InitializeParams) => {  
  Logger.debug('----------------------------------------');
  Logger.debug('[Server] Initialization Started');
  
  const initOptions = params.initializationOptions;
  
  if (initOptions && typeof initOptions === 'object') {
    Logger.debug(`[Server] Provider: ${initOptions.provider}`);
    Logger.debug(`[Server] Model: ${initOptions.model}`);
    Logger.debug(`[Server] API Key: ${initOptions.apiKey ? 'PROVIDED' : 'NOT PROVIDED'}`);
    Logger.debug(`[Server] Endpoint: ${initOptions.endpoint ? 'PROVIDED' : 'NOT PROVIDED'}`);
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

      // Prepare messages for AI client with a prompt
      const messages = [
        { 
          role: 'system' as const, 
          content: 'You are a code completion assistant. Analyze the code context and provide complete line suggestions, including proper newlines when needed. If the completion should start on a new line, prefix your suggestion with a newline character. Return the entire line of code that would be appropriate at the cursor position, not just the remaining part. Your suggestions should be complete, valid code statements that fit the context. Maintain proper indentation when suggesting new lines. If suggesting code that includes braces, brackets, or parentheses, ensure proper indentation and alignment. If unsure or if no meaningful completion is possible, return an empty string. Provide completions without any formatting, markdown, or code blocks.'        },
        { role: 'user' as const, content: relevantText || '' }
      ];

      // Use the AI client to get completions
      const completions: CompletionItem[] = [];
      await aiClient.chat(messages, {
        onToken: (token: string) => {
          // Accumulate tokens into a single string if needed
        },
        onComplete: (fullText: string) => {
          completions.push({
            label: fullText,
            kind: CompletionItemKind.Text,
            insertText: fullText,
            insertTextFormat: InsertTextFormat.PlainText
          });
          Logger.info(`[Server] Full completion text: ${fullText}`);
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
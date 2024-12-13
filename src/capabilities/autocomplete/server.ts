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
          content: `You are a code completion assistant for IDE-style code completions. Your task is to provide intelligent, contextual completions from the cursor position forward.
      
      Format:
      Language: {language or file extension}
      [code before cursor]
      Current line: {line with cursor position marked as {0}}
      [code after cursor]
      
      Instructions:
      1. For code completions:
         - Only suggest completions based on existing context and imported references
         - Analyze the visible code scope to identify available variables, functions, and types
         - If completing a method/property, verify the object type exists in scope
         - If the context and intent are clear, suggest complete, multi-line code
             - Example: "public set{0}" → "Client(client: LanguageClient): void {\\n    this.client = client;\\n    }"
         - For uncertain contexts, provide minimal completions rather than full statements
             - Example: "this.cli{0}" → "ent" only if "client" is a known property
         - For new property/method suggestions, only suggest if the type is clear from context
         - Maintain consistent indentation relative to the current scope
         - Ensure all brackets/braces follow the parent scope's indentation:
           * Method braces align with method declaration indentation
           * Nested braces align with their parent statement
           * Closing braces must match opening brace indentation exactly
           * Check parent scope indentation before suggesting any closing brace
      
      2. For new statement suggestions (after typing a statement separator like ';' or pressing enter):
         - Start with \\n and match current scope indentation
         - Example: for scope indented 4 spaces: "};{0}" → "\\n    public void nextMethod() {\\n        }"
         - Verify the new statement makes sense in the current context
      
      3. Indentation Rules:
         - Preserve the file's existing indentation style (spaces vs tabs)
         - Use the same indentation width as surrounding code
         - Each nested scope increases indentation by one level
         - Closing braces must align exactly with their opening statement
         - Check full context to determine correct indentation level
      
      4. Never repeat any text that appears before the cursor position
      5. Return empty string if no meaningful completion is possible
      6. If unsure about available references, provide minimal completion instead of guessing
      
      Your response must contain only the raw completion text - no formatting, markdown, or explanations.`
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
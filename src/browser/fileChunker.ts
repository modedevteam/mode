import * as vscode from 'vscode';

export class FileChunker {
    constructor(private readonly fileUri: vscode.Uri) {}

    async chunk(): Promise<string[]> {
        const document = await vscode.workspace.openTextDocument(this.fileUri);
		const lines = document.getText().split('\n');
        const methods = await this.getMethodSymbols();
		const methodLines = methods.map(method => method.range.start.line);
		const chunkedLines = this.chunkLines(lines, methodLines);
		return chunkedLines.map(chunk => chunk.join('\n'));
    }

    private async getMethodSymbols(): Promise<vscode.DocumentSymbol[]> {
        const document = await vscode.workspace.openTextDocument(this.fileUri);
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        ) || [];
        
        return this.getAllMethodSymbols(symbols);
    }

    private getAllMethodSymbols(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
        let methods: vscode.DocumentSymbol[] = [];
        
        for (const symbol of symbols) {
            // Add if current symbol is a method, constructor, or static property
            if (symbol.kind === vscode.SymbolKind.Method || 
                symbol.kind === vscode.SymbolKind.Constructor ||
                symbol.kind === vscode.SymbolKind.Property) {
                methods.push(symbol);
            }
            
            // Recursively search through children
            if (symbol.children && symbol.children.length > 0) {
                methods = methods.concat(this.getAllMethodSymbols(symbol.children));
            }
        }
        
        return methods;
    }

    private chunkLines(lines: string[], symbolLines: number[]): string[][] {
        const chunks: string[][] = [];
        let currentChunk: string[] = [];
        let methodComments: string[] = [];
        let lastLineWasEmpty = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // Start of method, constructor, or static property
            if (symbolLines.includes(i)) {
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk);
                }
                
                // Start new chunk with preceding comments
                currentChunk = [...methodComments];
                methodComments = [];
                
                // Collect the entire symbol block (including its body)
                let bracketCount = 0;
                const symbolChunk = [];
                
                do {
                    const currentLine = lines[i];
                    const trimmedCurrentLine = currentLine.trim();
                    
                    bracketCount += (trimmedCurrentLine.match(/{/g) || []).length;
                    bracketCount -= (trimmedCurrentLine.match(/}/g) || []).length;
                    
                    symbolChunk.push(currentLine);
                    
                    // Continue until we find the end of the block (balanced brackets and either ; or })
                    if (bracketCount === 0 && (trimmedCurrentLine.endsWith(';') || trimmedCurrentLine === '}')) {
                        break;
                    }
                    
                    i++;
                } while (i < lines.length);
                
                currentChunk.push(...symbolChunk);
                chunks.push(currentChunk);
                currentChunk = [];
                continue;
            }

            // Track potential method comments
            if (this.isComment(trimmedLine)) {
                if (!lastLineWasEmpty) {
                    methodComments.push(line);
                } else {
                    currentChunk.push(line);
                }
            } else {
                // Add any unused method comments to current chunk
                if (methodComments.length > 0) {
                    currentChunk.push(...methodComments);
                    methodComments = [];
                }
                currentChunk.push(line);
            }

            lastLineWasEmpty = trimmedLine === '';
        }
        
        // Add any remaining content
        if (methodComments.length > 0) {
            currentChunk.push(...methodComments);
        }
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    private isComment(line: string): boolean {
        return (
            line.startsWith('/*') ||    // C-style
            line.startsWith('"""') ||    // Python, Ruby, Shell
            line.startsWith("'''") ||    // Python, Ruby, Shell
            line.startsWith('=begin') ||  // Ruby
            line.startsWith('<!--') ||    // HTML
            line.startsWith('//') ||     // C-style
            line.startsWith('#') ||      // Python, Ruby, Shell
            line.startsWith('--') ||     // SQL, Lua
            line.startsWith(';') ||      // Lisp, Assembly
            line.startsWith('%')         // Matlab, LaTeX
        );
    }
}
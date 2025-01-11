/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import { FileChangeResponseProcessor } from './file.change.response.processor';

export class FileChangesResponseProcessor {
    private currentChangeProcessor: FileChangeResponseProcessor | null = null;
    private tokenBuffer: string = '';
    
    constructor(
        private readonly _view: vscode.WebviewView,
        private readonly md: MarkdownIt
    ) {
    }

    processToken(token: string) {
        this.tokenBuffer += token;

        // Check if we have a complete file path marker
        if (this.tokenBuffer.includes('{"filePath":')) {

            // End previous change if exists
            if (this.currentChangeProcessor) {
                this.currentChangeProcessor.endChange();
                this.currentChangeProcessor = null;
            }

            // Start new change processor
            this.currentChangeProcessor = new FileChangeResponseProcessor(this._view, this.md);
            this.currentChangeProcessor.startChange();
            
            // Get the substring starting from {"filePath":
            const filePathIndex = this.tokenBuffer.indexOf('{"filePath":');
            const relevantBuffer = this.tokenBuffer.substring(filePathIndex);
            this.currentChangeProcessor.processToken(relevantBuffer);

			// reset the buffer so we don't include the file path in the next check
			this.tokenBuffer = '';
        } else if (this.currentChangeProcessor) { // if we're already processing a file change, stream the token
            this.currentChangeProcessor.processToken(token);
        }
    }

    endFileChanges() {
        if (this.currentChangeProcessor) {
            this.currentChangeProcessor.endChange();
            this.currentChangeProcessor = null;
        }
    }
}

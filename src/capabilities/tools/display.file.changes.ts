/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextResponseProcessor } from '../chat/response/text.response.processor';
import { ChangeSet } from './apply.file.changes';
import { FILE_CHANGE_END, FILE_CHANGE_START, REPLACE_END, REPLACE_START, SEARCH_END, SEARCH_START, FILE_PATH_END, FILE_PATH_START, LANGUAGE_END, LANGUAGE_START } from '../../common/llms/llm.prompt';

/*
 * Displays the changes to the user. Renders the changes in the webview.
 */
export async function displayFileChanges(changes: ChangeSet, handler: TextResponseProcessor): Promise<void> {
    // Display explanation
    await handler.processToken(changes.explanation);

    for (const change of changes.changes) {
        // Start file change block
        handler.processLine(FILE_CHANGE_START);
        handler.processLine(`${FILE_PATH_START}${change.filePath}${FILE_PATH_END}`);
        handler.processLine(`${LANGUAGE_START}${change.language}${LANGUAGE_END}`);

        // Show search content
        if (change.searchContent) {
            handler.processLine(SEARCH_START);
            handler.processLine(change.searchContent);
            handler.processLine(SEARCH_END);
        }

        // Show replace content if applicable
        if (change.replaceContent) {
            handler.processLine(REPLACE_START);
            handler.processLine(change.replaceContent);
            handler.processLine(REPLACE_END);
        }

        handler.processLine(FILE_CHANGE_END);

        // End with change-specific explanation if it exists
        if (change.explanation) {
            handler.processLine(change.explanation);
        }
    }

    handler.finalize();
}
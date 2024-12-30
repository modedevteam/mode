/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import { REFERENCED_FILE_START, REFERENCED_FILE_END } from '../llms/aiPrompts';

/**
 * Formats the content of a file into a structured array of strings with LLM-compatible markers.
 * Handles both open documents in the editor and files from the filesystem.
 * 
 * @param fileUrl - The URL/path of the file to format
 * @returns Promise<string[]> Array of formatted strings with Reference File markers
 * @throws Error if file cannot be read or formatted
 */
export async function formatFileContent(fileUrl: string): Promise<string[]> {
	try {
		const uri = vscode.Uri.parse(fileUrl);
		const filePath = uri.fsPath;
		
		// Get file content
		const openDocument = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
		const fileContent = openDocument ? openDocument.getText() : fs.readFileSync(filePath, 'utf-8');
		
		// Split content into lines and create formatted chunks
		const lines = fileContent.split('\n');
		
		return [
			`${REFERENCED_FILE_START}`,
			`{{fp}}${uri.path}{{/fp}}`,
			...lines.map((content) =>
				`{{fc}}${content}{{/fc}}`
			),
			`${REFERENCED_FILE_END}`
		];
	} catch (error) {
		console.error(`Error formatting file content: ${error}`);
		throw error;
	}
}

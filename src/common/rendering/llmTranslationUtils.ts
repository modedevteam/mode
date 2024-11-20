import * as vscode from 'vscode';
import * as fs from 'fs';

export function processLLMOutput(text: string): string {
	// Remove code_analysis blocks before rendering
	const processedText = text
		.replace(/{{code_analysis}}[\s\S]*?{{\/code_analysis}}/g, '')
		.replace(/{{change_analysis}}[\s\S]*?{{\/change_analysis}}/g, '');
	
	const codeChangesRegex = /{{code_changes}}([\s\S]*?){{\/code_changes}}/g;
	return processedText.replace(codeChangesRegex, (codeBlock) => {
		const lines = codeBlock.split('\n');
		let formattedCode = '';
		let language = '';
		let filePath = '';
		let codeIdentifier = '';

		lines.forEach((line: string) => {
			const matchLang = line.match(/{{l}}(.*?){{\/l}}/);
			const matchFilePath = line.match(/{{fp}}(.*?){{\/fp}}/);
			const matchCodeIdentifier = line.match(/{{ci}}(.*?){{\/ci}}/);
			const matchCodeLine = line.match(/{{i}}\d+(\.\d+)?{{\/i}}{{[amc]}}(.*?){{\/[amc]}}/);

			if (matchLang) {
				language = matchLang[1];
			} else if (matchFilePath) {
				filePath = matchFilePath[1];
			} else if (matchCodeIdentifier) {
				codeIdentifier = matchCodeIdentifier[1];
			} else if (matchCodeLine) {
				formattedCode += matchCodeLine[2] + '\n';
			}
		});

		return `\`\`\`${language}\n${filePath}\n${codeIdentifier}\n${formattedCode}\`\`\``;
	});
}

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
		const fileName = uri.path.split('/').pop() || '';
		const lines = fileContent.split('\n');
		
		return [
			`{{Referenced File}}`,
			`{{fn}}${fileName}{{/fn}}`,
			`{{fp}}${uri.path}{{/fp}}`,
			...lines.map((content, index) =>
				`{{i}}${index + 1}{{/i}}{{v}}${content}{{/v}}`
			),
			`{{/Referenced File}}`
		];
	} catch (error) {
		console.error(`Error formatting file content: ${error}`);
		throw error;
	}
}

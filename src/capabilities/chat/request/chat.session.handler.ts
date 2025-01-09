/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid'; // Add this import for generating unique IDs
import { AIMessage } from '../../../common/llms/llm.client';

export interface ChatSession {
	id: string;
	name: string;
	systemTime: number;
	messages: AIMessage[];
	overview: string;
	codeMap: { [guid: string]: string };
}

export class ChatSessionManager {
	private chatSessions: ChatSession[] = [];
	private currentSessionId: string | null = null;
	private readonly STORAGE_FILE_NAME = 'mode_chat_sessions.json';

	constructor(private readonly _context: vscode.ExtensionContext) {
		this.loadSessions();
	}

	public createNewSession() {
		const newSession = {
			id: uuidv4(),
			name: `Session ${this.chatSessions.length + 1}`,
			systemTime: Date.now(),
			messages: [],
			overview: "New Chat",
			codeMap: {}
		};
		
		// Create a fresh copy of the session
		const freshSession = JSON.parse(JSON.stringify(newSession));
		this.chatSessions.push(freshSession);
		this.currentSessionId = freshSession.id;
		this.saveSessions();
	}

	public getCurrentSessionId(): string | null {
		return this.currentSessionId;
	}

	public getCurrentSession() {
		return this.chatSessions.find(session => session.id === this.currentSessionId)!;
	}

	public updateCurrentSessionOverview(overview: string) {
		this.getCurrentSession().overview = overview;
		this.saveSessions();
	}

	public saveSessions() {
		this.saveAllSessionsToFile();
	}

	private saveAllSessionsToFile() {
		const storagePath = this._context.globalStorageUri.fsPath;
		const filePath = path.join(storagePath, this.STORAGE_FILE_NAME);
		fs.mkdirSync(storagePath, { recursive: true });
		fs.writeFileSync(filePath, JSON.stringify(this.chatSessions, null, 2));
	}

	private loadSessions() {
		// Only load from file
		this.chatSessions = this.loadAllSessionsFromFile();

		// Set the current session to the last one or create a new one if none exist
		if (this.chatSessions.length > 0) {
			this.currentSessionId = this.chatSessions[this.chatSessions.length - 1].id;
		} else {
			this.createNewSession();
		}
	}

	private loadAllSessionsFromFile(): any[] {
		const storagePath = this._context.globalStorageUri.fsPath;
		const filePath = path.join(storagePath, this.STORAGE_FILE_NAME);

		if (fs.existsSync(filePath)) {
			const fileContent = fs.readFileSync(filePath, 'utf8');
			return JSON.parse(fileContent);
		}
		return [];
	}

	public getChatSessions() {
		return this.chatSessions;
	}

	public loadChatSession(sessionId: string) {
		const session = this.chatSessions.find(s => s.id === sessionId);
		if (session) {
			// Create a fresh copy of the session's messages
			const freshSession = {
				...session,
				messages: JSON.parse(JSON.stringify(session.messages))
			};
			
			// Update the session in the array
			const index = this.chatSessions.findIndex(s => s.id === sessionId);
			if (index !== -1) {
				this.chatSessions[index] = freshSession;
			}
			
			this.currentSessionId = sessionId;
			return freshSession;
		}
		return session;
	}

	public setCodeMapEntry(sessionId: string, guid: string, codeText: string) {
		const session = this.chatSessions.find(s => s.id === sessionId);
		if (session) {
			session.codeMap[guid] = codeText;
			this.saveSessions();
		}
	}

	public getCodeMapEntry(sessionId: string, guid: string): string | null {
		const session = this.chatSessions.find(s => s.id === sessionId);
		return session ? session.codeMap[guid] || null : null;
	}

	public setCodeBlock(sessionId: string, codeId: string, codeBlock: string) {
		this.setCodeMapEntry(sessionId, codeId, codeBlock);
	}
}

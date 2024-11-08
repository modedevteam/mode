import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid'; // Add this import for generating unique IDs
import { chatPrompt } from '../../common/llms/aiPrompts';
import { AIMessage } from '../../common/llms/aiClient';

export class SessionManager {
	private chatSessions: {
		id: string;
		name: string;
		systemTime: number;
		messages: AIMessage[];
		overview: string;
	}[] = [];
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
			messages: [{
				role: "system" as const,
				content: chatPrompt
			}],
			overview: "New Chat"
		};
		this.chatSessions.push(newSession);
		this.currentSessionId = newSession.id;
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
			this.currentSessionId = sessionId;
		}
		return session;
	}
}

import * as fs from 'fs';
import * as path from 'path';
import { ExtensionContext } from 'vscode';
import { isLoggingEnabled, getMaxLogFileSize} from '../configUtils';

let globalStoragePath: string;

export function initializeLogger(context: ExtensionContext): void {
    globalStoragePath = context.globalStoragePath;
}

function getLogFilePath(): string {
    return path.join(globalStoragePath, 'mode.log');
}

export class Logger {
    private static instance: Logger | null = null;
    
    private constructor() {
        this.initializeLogFile();
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    private initializeLogFile(): void {
        // Create log directory if it doesn't exist
        const logDir = path.dirname(getLogFilePath());
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }

    public log(message: string): void {
        if (!isLoggingEnabled()) {
            return;
        }

        const timestamp = new Date().toISOString();
        const logEntry = `${timestamp}: ${message}\n`;

        try {
            // Append the new log entry
            fs.appendFileSync(getLogFilePath(), logEntry);

            // Check and trim file if needed
            this.trimLogFileIfNeeded();
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    private trimLogFileIfNeeded(): void {
        try {
            const stats = fs.statSync(getLogFilePath());
            const maxSizeBytes = getMaxLogFileSize() * 1024 * 1024; // Convert MB to bytes

            if (stats.size > maxSizeBytes) {
                // Read all lines
                const content = fs.readFileSync(getLogFilePath(), 'utf8');
                const lines = content.split('\n');

                // Calculate how many lines to remove (remove ~20% of the file)
                const linesToRemove = Math.floor(lines.length * 0.2);
                
                // Keep the newer lines
                const newContent = lines.slice(linesToRemove).join('\n');
                
                // Write back the trimmed content
                fs.writeFileSync(getLogFilePath(), newContent);
            }
        } catch (error) {
            console.error('Failed to trim log file:', error);
        }
    }
} 
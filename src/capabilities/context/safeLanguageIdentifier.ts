import * as vscode from 'vscode';
import * as hljs from 'highlight.js';

const languageMappings = {
    // Web Development
    'typescriptreact': 'typescript',  // .tsx to typescript
    'javascriptreact': 'javascript',  // .jsx to javascript
    'handlebars': 'html',             // Handlebars templates to HTML

    // Configuration and Data Formats
    'jsonc': 'json',                  // JSON with comments
    'toml': 'ini',                    // Map TOML to INI due to similar structure
    'hcl': 'json',                    // HCL (e.g., for Terraform) mapped to JSON
    'terraform': 'json',              // Terraform config mapped to JSON
    'cue': 'json',                    // CUE language mapped to JSON
    'plist': 'xml',                   // Apple property lists mapped to XML

    // Scripting and Command Files
    'dockerfile': 'shellscript',      // Dockerfile syntax to shellscript
    'batch': 'shellscript',           // Batch files (Windows) to shellscript
    'makefile': 'shellscript',        // Makefiles mapped to shellscript

    // Query Languages
    'graphql': 'javascript',          // GraphQL often treated as JavaScript
    'cypher': 'javascript',           // Cypher (Neo4j) mapped to JavaScript
    'sparql': 'sql',                  // SPARQL mapped to SQL due to similar structure

    // Version Control and Plain Text
    'git-commit': 'plaintext',        // Git commit messages
    'git-rebase': 'plaintext',        // Git rebase editor

    // Functional Programming and Less Common Languages
    'elixir': 'erlang',               // Elixir to Erlang as they share similarities
    'clojure': 'lisp',                // Clojure mapped to Lisp syntax
    'ocaml': 'fsharp',                // OCaml mapped to F#
    'reason': 'ocaml',                // ReasonML mapped to OCaml

    // Additional Configuration Formats
    'http': 'plaintext',              // HTTP files mapped to plaintext
    'dotenv': 'ini',                  // .env files mapped to INI format

    // Documentation and Markup
    'restructuredtext': 'plaintext',  // reStructuredText as plaintext
    'bibtex': 'latex',                // BibTeX references mapped to LaTeX

    // Miscellaneous
    'applescript': 'plaintext',       // AppleScript mapped to plaintext
    'rmarkdown': 'markdown',          // R Markdown mapped to markdown
    'jinja': 'html',                  // Jinja templates mapped to HTML
};

export function safeLanguageIdentifier(languageId: string): string {
    // Check if the languageId has a mapping, return the mapped value or the original
    return languageMappings[languageId as keyof typeof languageMappings] || languageId;
} 
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const anthropicFileChangesTool = {
    name: "apply_file_changes",
    description: "Apply changes to files in the codebase",
    input_schema: {
        type: "object" as const,
        properties: {
            explanation: {
                type: "string",
                description: "Overall explanation of the changes being made"
            },
            changes: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        filePath: {
                            type: "string",
                            description: "Path to the file being modified"
                        },
                        language: {
                            type: "string",
                            description: "Programming language of the file"
                        },
                        fileAction: {
                            type: "string",
                            enum: ["modify", "create", "delete", "rename"],
                            description: "Type of action to perform on the file"
                        },
                        updateAction: {
                            type: "string",
                            enum: ["update", "replace", "delete"],
                            description: "Type of update to perform within the file"
                        },
                        searchContent: {
                            type: "string",
                            description: "The exact code segment (or file name) to be replaced - MUST match the source file lines precisely and include the entire method/function with decorators, comments, and whitespace when modifying methods. Set to 'null' when fileAction is 'create'."
                        },
                        replaceContent: {
                            type: "string",
                            description: "New code (or file name) to replace it. Must include the entire method/function with decorators, comments, and whitespace when modifying methods. Must match the source file's existing style and indentation. Set to 'null' when fileAction or updateAction is 'delete'."
                        },
                        explanation: {
                            type: "string",
                            description: "A clear, succinct explanation of this specific change. Skip this property if the changes array only includes a single change."
                        },
                        end_change: {
                            type: "string",
                            description: "End of the change block"
                        }
                    },
                    required: ["searchContent", "replaceContent", "filePath", "language", "fileAction", "updateAction", "end_change"]
                }
            }
        },
        required: ["changes", "explanation"]
    }
};

export const openaiFileChangesTool = {
	type: "function" as const,
	function: {
		name: "apply_file_changes",
		description: "Apply changes to files in the codebase",
		parameters: {
			type: "object",
			properties: {
				explanation: {
					type: "string",
					description: "Overall explanation of the changes being made"
				},
				changes: {
					type: "array",
					items: {
						type: "object",
						properties: {
							filePath: {
								type: "string",
								description: "Path to the file being modified"
							},
							language: {
								type: "string",
								description: "Programming language of the file"
							},
							fileAction: {
								type: "string",
								enum: ["modify", "create", "delete", "rename"],
								description: "Type of action to perform on the file"
							},
							updateAction: {
								type: "string",
								enum: ["update", "replace", "delete"],
								description: "Type of update to perform within the file"
							},
							searchContent: {
								type: "string",
								description: "The exact code segment (or file name) to be replaced - MUST match the source file lines precisely and include the entire method/function with decorators, comments, and whitespace when modifying methods. Set to 'null' when fileAction is 'create'."
							},
							replaceContent: {
								type: "string",
								description: "New code (or file name) to replace it. Must include the entire method/function with decorators, comments, and whitespace when modifying methods. Must match the source file's existing style and indentation. Set to 'null' when fileAction or updateAction is 'delete'."
							},
							explanation: {
								type: "string",
								description: "A clear, succinct explanation of this specific change. Skip this property if the changes array only includes a single change."
							},
							end_change: {
								type: "string",
								description: "End of the change block"
							}
						},
						required: ["searchContent", "replaceContent", "filePath", "language", "fileAction", "updateAction", "end_change"]
					}
				}
			},
			required: ["changes", "explanation"]
		}
	}
};
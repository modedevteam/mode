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
                            enum: ["replace", "delete"],
                            description: "Type of update to perform within the file"
                        },
                        searchContent: {
                            type: "string",
                            description: "Original code to be replaced (exact copy)"
                        },
                        replaceContent: {
                            type: "string",
                            description: "New code that will replace the search content (not required for delete actions)"
                        },
                        explanation: {
                            type: "string",
                            description: "Explanation of why this specific change is being made"
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
								enum: ["replace", "delete"],
								description: "Type of update to perform within the file"
							},
							searchContent: {
								type: "string",
								description: "Original code to be replaced (exact copy)"
							},
							replaceContent: {
								type: "string",
								description: "New code that will replace the search content (not required for delete actions)"
							},
							explanation: {
								type: "string",
								description: "Explanation of why this specific change is being made"
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
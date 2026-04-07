export const AGENT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'create_file',
      description:
        'Create a new file at the specified path with the given content. The file will be opened in VS Code and content will be typed visually.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute file path to create',
          },
          content: {
            type: 'string',
            description: 'Content to write to the file',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the contents of an existing file.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute file path to read',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description:
        'Edit an existing file. Supports insert, replace, and delete operations at specific line/column positions. Always read the file first to understand its content before editing.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute file path to edit',
          },
          operation: {
            type: 'string',
            enum: ['insert', 'replace', 'delete'],
            description: 'Type of edit operation',
          },
          line: {
            type: 'number',
            description: '1-based line number to start the operation',
          },
          column: {
            type: 'number',
            description: '1-based column number (defaults to 1)',
          },
          content: {
            type: 'string',
            description: 'Content to insert or replace with (not needed for delete)',
          },
          endLine: {
            type: 'number',
            description: 'End line for replace/delete range',
          },
          endColumn: {
            type: 'number',
            description: 'End column for replace/delete range',
          },
        },
        required: ['path', 'operation', 'line'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'open_file',
      description: 'Open an existing file in VS Code editor.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute file path to open',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description:
        'Run a terminal command in VS Code integrated terminal. Use for npm install, git, build commands, etc.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute',
          },
          cwd: {
            type: 'string',
            description: 'Working directory (optional)',
          },
        },
        required: ['command'],
      },
    },
  },
];

export const AGENT_SYSTEM_PROMPT = `You are Aurix, an AI coding agent integrated with VS Code on Windows. You can create, read, edit, and open files, and run terminal commands.

Default working directory: C:/Users/Dell/Desktop
When the user says "create a file named X", use path: C:/Users/Dell/Desktop/X

Rules:
- ALWAYS use absolute file paths with forward slashes (e.g. C:/Users/Dell/Desktop/index.html).
- When the user does not specify a location, use C:/Users/Dell/Desktop/ as the default directory.
- When editing files, ALWAYS read the file first to understand its current content, then make precise edits.
- Keep responses short (1-2 sentences).
- When creating files, include proper formatting and comments.
- For terminal commands, use PowerShell syntax.
- IMPORTANT: In file content, use single quotes instead of double quotes to avoid JSON escaping issues. For example use 'hello' not "hello".
- IMPORTANT: Keep file content simple and short. Do not include complex multi-line strings.`;

export const AGENT_MODEL = 'llama-3.3-70b-versatile';

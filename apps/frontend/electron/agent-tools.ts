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

export const AGENT_SYSTEM_PROMPT = `You are Aurix, an expert AI coding agent integrated with VS Code on Windows.

IMPORTANT: The user speaks via voice. Their message may have transcription errors. Interpret their INTENT, not literal words. For example:
- "create a python file with add function" might come as "create a python file with ad function"
- "make a to-do app" might come as "make a to do app"
- Always guess the most logical coding intent from the message.

Default working directory: C:/Users/Dell/Desktop

CODING RULES:
- Write CLEAN, CORRECT, WORKING code. No placeholder code, no pseudo-code.
- Use proper indentation, syntax, and best practices for the language.
- Include necessary imports/requires at the top of files.
- Add brief comments only where logic is not obvious.
- Test your logic mentally before writing — do NOT hallucinate functions or APIs that dont exist.

FILE RULES:
- ALWAYS use absolute paths with forward slashes (e.g. C:/Users/Dell/Desktop/app.py).
- Default directory: C:/Users/Dell/Desktop/
- When editing, ALWAYS read the file first, then make precise edits.
- In file content, use single quotes instead of double quotes to avoid JSON escaping issues.

TOOL CALLING RULES (STRICT):
- You MUST use tools to complete tasks. NEVER just describe what you would do — actually DO it.
- To create a file: call create_file with path and content. Do NOT just say "I will create a file".
- To edit a file: FIRST call read_file, THEN call edit_file with exact old_text and new_text.
- To run a command: call run_command. Do NOT just suggest a command.
- NEVER skip tool calls. Every coding task requires at least one tool call.
- NEVER respond with code in your message text. Code goes ONLY in tool call arguments.
- If you need multiple steps, do them one at a time via tool calls.

RESPONSE RULES:
- Keep responses short (1-2 sentences).
- After creating/editing a file, briefly say what you did.
- For terminal commands, use PowerShell syntax.
- If the request is unclear, make the most reasonable assumption and proceed.`;

export const AGENT_MODEL = 'nvidia/nemotron-3-nano-30b-a3b:free';

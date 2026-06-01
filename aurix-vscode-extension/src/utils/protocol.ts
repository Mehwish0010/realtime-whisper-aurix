export interface AgentMessage {
  id: string;
  action: "create_file" | "open_file" | "read_file" | "edit_file" | "run_command";
  params: Record<string, any>;
}

export interface AgentResponse {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
}

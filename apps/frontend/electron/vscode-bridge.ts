import WebSocket from 'ws';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

class VSCodeBridge {
  private ws: WebSocket | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private connected: boolean = false;
  private messageIdCounter: number = 0;

  async connect(url: string = 'ws://localhost:9877'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        this.connected = true;
        console.log('Connected to VS Code extension');
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const response = JSON.parse(data.toString());
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(response.id);
            if (response.success) {
              pending.resolve(response.result);
            } else {
              pending.reject(new Error(response.error || 'Unknown error'));
            }
          }
        } catch (err) {
          console.error('Failed to parse VS Code bridge response:', err);
        }
      });

      this.ws.on('close', () => {
        this.connected = false;
        console.log('Disconnected from VS Code extension');
        // Reject all pending requests
        for (const [_id, pending] of this.pendingRequests) {
          clearTimeout(pending.timeout);
          pending.reject(new Error('Connection closed'));
        }
        this.pendingRequests.clear();
      });

      this.ws.on('error', (err) => {
        this.connected = false;
        reject(err);
      });
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async sendCommand(action: string, params: Record<string, any>): Promise<any> {
    if (!this.ws || !this.connected) {
      throw new Error(
        'Not connected to VS Code extension. Please open VS Code and ensure the Aurix extension is running.',
      );
    }

    const id = `msg_${++this.messageIdCounter}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Command ${action} timed out after 30s`));
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.ws!.send(JSON.stringify({ id, action, params }));
    });
  }
}

// Singleton
let bridge: VSCodeBridge | null = null;

export function getVSCodeBridge(): VSCodeBridge {
  if (!bridge) {
    bridge = new VSCodeBridge();
  }
  return bridge;
}

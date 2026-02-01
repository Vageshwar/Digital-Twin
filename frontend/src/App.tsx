import React, { useState, useEffect } from 'react';
import AudioVisualizer from './components/AudioVisualizer';
import LogStream from './components/LogStream';
import Chat from './components/Chat';

// Mock logs generator
const generateLog = (msg: string) => ({
  id: Math.random().toString(36).substr(2, 9),
  message: msg,
  timestamp: new Date().toLocaleTimeString(),
});

function App() {
  // WebSocket Reference
  const ws = React.useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect to WebSocket on mount
    ws.current = new WebSocket('ws://localhost:8000/ws/chat');

    ws.current.onopen = () => {
      addLog('Neural Link Established.');
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'log') {
        addLog(data.message);
      } else if (data.type === 'token') {
        // Better streaming logic:
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            return [...prev.slice(0, -1), { ...lastMsg, content: lastMsg.content + data.content }];
          } else {
            return [...prev, { role: 'assistant', content: data.content }];
          }
        });
      } else if (data.type === 'done') {
        setIsActive(false);
        setIsStreaming(false);
        addLog('Transmission Complete.');
      } else if (data.type === 'error') {
        addLog(`ERROR: ${data.message}`);
        setIsActive(false);
        setIsStreaming(false);
      }
    };

    ws.current.onclose = () => {
      addLog('Neural Link Severed.');
    };

    return () => {
      ws.current?.close();
    };
  }, []);

  const [isActive, setIsActive] = useState(false);
  const [logs, setLogs] = useState<Array<{ id: string, message: string, timestamp: string }>>([
    generateLog('System Initialized'),
    generateLog('Connected to Featherless.ai'),
  ]);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    { role: 'assistant', content: 'Greeting, founder. Systems online.' }
  ]);
  const [isStreaming, setIsStreaming] = useState(false);

  const handleSendMessage = (text: string) => {
    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setIsActive(true);
    setIsStreaming(true);

    // Simulate system thinking
    addLog(`Transmitting: "${text.substring(0, 15)}..."`);

    // Send to Backend
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(text);
    } else {
      addLog('ERROR: Neural Link Offline.');
      setIsActive(false);
      setIsStreaming(false);
    }
  };

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-19), generateLog(msg)]);
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 flex gap-4 overflow-hidden h-screen">
      {/* Left Column: Logs */}
      <div className="w-1/4 hidden md:block h-full">
        <LogStream logs={logs} />
      </div>

      {/* Main Column: Visualizer + Chat */}
      <div className="flex-1 flex flex-col gap-4 h-full max-w-4xl mx-auto w-full">
        <div className="flex-none">
          <h1 className="text-2xl font-bold text-primary mb-2 tracking-widest text-center">VAGESHWAR'S TWIN v1.0</h1>
          <AudioVisualizer isActive={isActive} />
        </div>
        <div className="flex-1 overflow-hidden">
          <Chat
            onSendMessage={handleSendMessage}
            messages={messages}
            isStreaming={isStreaming}
          />
        </div>
      </div>
    </div>
  );
}

export default App;

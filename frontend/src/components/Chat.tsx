import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';

interface ChatProps {
    onSendMessage: (message: string) => void;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    isStreaming: boolean;
}

const Chat: React.FC<ChatProps> = ({ onSendMessage, messages, isStreaming }) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;
        onSendMessage(input);
        setInput('');
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 mb-4 glass-panel rounded-md">
                {messages.map((msg, idx) => (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[80%] p-3 rounded text-sm font-mono border ${msg.role === 'user'
                                ? 'border-secondary text-secondary bg-secondary/5'
                                : 'border-primary text-primary bg-primary/5'
                                }`}
                        >
                            <div className="text-[10px] opacity-50 mb-1">
                                {msg.role === 'user' ? '[USER]' : "[VAGESHWAR'S TWIN]"}
                            </div>
                            {msg.content}
                        </div>
                    </motion.div>
                ))}
                {isStreaming && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-primary/50 text-xs font-mono animate-pulse"
                    >
                        Processing...
                    </motion.div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="flex items-center gap-2 p-2 glass-panel mt-2 rounded-md border border-primary/30 relative overflow-hidden group">
                <div className="absolute inset-0 bg-primary/5 pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity" />
                <span className="text-primary/70 font-mono pl-2">{'>'}</span>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Execute command..."
                    className="flex-1 bg-transparent border-none text-white font-mono focus:outline-none focus:ring-0 placeholder-primary/30"
                />
                <button
                    type="submit"
                    className="p-2 text-primary hover:text-white transition-colors hover:bg-primary/20 rounded"
                >
                    <Send size={20} />
                </button>
            </form>
        </div>
    );
};

export default Chat;

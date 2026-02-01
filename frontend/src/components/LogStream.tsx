import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Log {
    id: string;
    message: string;
    timestamp: string;
}

interface LogStreamProps {
    logs: Log[];
}

const LogStream: React.FC<LogStreamProps> = ({ logs }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div className="h-full flex flex-col glass-panel p-4 rounded-md font-mono text-xs">
            <div className="border-b border-primary/20 pb-2 mb-2 text-primary font-bold">
                [SYSTEM LOGS]
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1">
                <AnimatePresence>
                    {logs.map((log) => (
                        <motion.div
                            key={log.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-primary/80"
                        >
                            <span className="opacity-50">[{log.timestamp}]</span> {log.message}
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default LogStream;

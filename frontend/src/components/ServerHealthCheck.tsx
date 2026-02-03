import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ServerHealthCheckProps {
    apiUrl: string;
    onServerReady: () => void;
    maxRetries?: number;
    retryInterval?: number;
}

const ServerHealthCheck: React.FC<ServerHealthCheckProps> = ({
    apiUrl,
    onServerReady,
    maxRetries = 18, // 18 retries * 10 seconds = 3 minutes
    retryInterval = 10000, // 10 seconds
}) => {
    const [status, setStatus] = useState<'checking' | 'waking' | 'ready' | 'error'>('checking');
    const [retryCount, setRetryCount] = useState(0);
    const [dots, setDots] = useState('');

    // Animated dots effect
    useEffect(() => {
        const interval = setInterval(() => {
            setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
        }, 500);
        return () => clearInterval(interval);
    }, []);

    // Health check polling
    useEffect(() => {
        let timeoutId: number;
        let isMounted = true;

        const checkHealth = async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

                const response = await fetch(`${apiUrl}`, {
                    signal: controller.signal,
                    method: 'GET',
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    if (isMounted) {
                        setStatus('ready');
                        setTimeout(() => {
                            onServerReady();
                        }, 500);
                    }
                    return;
                }
            } catch (error) {
                console.log(`Health check attempt ${retryCount + 1} failed:`, error);
            }

            // Retry logic
            if (isMounted) {
                if (retryCount < maxRetries) {
                    setStatus('waking');
                    setRetryCount(prev => prev + 1);
                    timeoutId = setTimeout(checkHealth, retryInterval);
                } else {
                    setStatus('error');
                }
            }
        };

        checkHealth();

        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
        };
    }, [retryCount, apiUrl, maxRetries, retryInterval, onServerReady]);

    const getStatusMessage = () => {
        switch (status) {
            case 'checking':
                return 'Initializing connection';
            case 'waking':
                return 'Waking up server (free tier)';
            case 'ready':
                return 'Server ready!';
            case 'error':
                return 'Connection failed';
        }
    };

    const getStatusDescription = () => {
        switch (status) {
            case 'checking':
            case 'waking':
                return 'The server is on a free tier and goes to sleep after 15 minutes of inactivity. Restarting may take up to 3 minutes. Thank you for your patience.';
            case 'ready':
                return 'Connection established successfully!';
            case 'error':
                return 'Unable to connect to the server. Please try again later or contact support.';
        }
    };

    const progress = Math.min((retryCount / maxRetries) * 100, 100);
    const timeRemaining = Math.max(0, Math.ceil((maxRetries - retryCount) * (retryInterval / 1000)));

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="min-h-screen bg-background text-foreground flex items-center justify-center p-4"
            >
                <div className="max-w-md w-full">
                    {/* Glowing orb animation */}
                    <div className="relative mb-8 flex justify-center">
                        <motion.div
                            className="w-32 h-32 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 blur-xl"
                            animate={{
                                scale: status === 'waking' ? [1, 1.2, 1] : 1,
                                opacity: status === 'ready' ? 0 : [0.5, 0.8, 0.5],
                            }}
                            transition={{
                                duration: 2,
                                repeat: status === 'ready' ? 0 : Infinity,
                                ease: 'easeInOut',
                            }}
                        />
                        <motion.div
                            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border-4 border-primary/50"
                            animate={{
                                rotate: status === 'error' ? 0 : 360,
                                borderColor: status === 'error' ? '#ef4444' : status === 'ready' ? '#10b981' : 'rgba(139, 92, 246, 0.5)',
                            }}
                            transition={{
                                rotate: { duration: 3, repeat: Infinity, ease: 'linear' },
                                borderColor: { duration: 0.5 },
                            }}
                        >
                            {status === 'ready' && (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="w-full h-full rounded-full bg-green-500/20 flex items-center justify-center"
                                >
                                    <svg className="w-12 h-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </motion.div>
                            )}
                            {status === 'error' && (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="w-full h-full rounded-full bg-red-500/20 flex items-center justify-center"
                                >
                                    <svg className="w-12 h-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </motion.div>
                            )}
                        </motion.div>
                    </div>

                    {/* Status text */}
                    <div className="text-center space-y-4">
                        <motion.h2
                            className="text-2xl font-bold tracking-wider"
                            animate={{ opacity: [0.7, 1, 0.7] }}
                            transition={{ duration: 2, repeat: Infinity }}
                        >
                            {getStatusMessage()}{status !== 'ready' && status !== 'error' && dots}
                        </motion.h2>

                        <p className="text-sm text-muted-foreground leading-relaxed">
                            {getStatusDescription()}
                        </p>

                        {/* Progress bar */}
                        {status === 'waking' && (
                            <div className="space-y-2">
                                <div className="w-full bg-secondary/30 rounded-full h-2 overflow-hidden">
                                    <motion.div
                                        className="h-full bg-gradient-to-r from-primary to-accent"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                        transition={{ duration: 0.5 }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>Attempt {retryCount} of {maxRetries}</span>
                                    <span>~{timeRemaining}s remaining</span>
                                </div>
                            </div>
                        )}

                        {/* Error retry button */}
                        {status === 'error' && (
                            <motion.button
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                onClick={() => {
                                    setRetryCount(0);
                                    setStatus('checking');
                                }}
                                className="mt-6 px-6 py-3 bg-primary hover:bg-primary/80 text-black rounded-lg font-semibold transition-colors"
                            >
                                Retry Connection
                            </motion.button>
                        )}
                    </div>

                    {/* Footer note */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1 }}
                        className="mt-8 text-center text-xs text-muted-foreground"
                    >
                        <p>VAGESHWAR'S TWIN v1.0</p>
                        <p className="mt-1">Powered by Featherless.ai & Render</p>
                    </motion.div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

export default ServerHealthCheck;

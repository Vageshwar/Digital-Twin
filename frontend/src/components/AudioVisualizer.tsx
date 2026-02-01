import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface AudioVisualizerProps {
    isActive: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isActive }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationId: number;
        let time = 0;

        const draw = () => {
            time += 0.1;
            const width = canvas.width;
            const height = canvas.height;

            ctx.clearRect(0, 0, width, height);
            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.strokeStyle = isActive ? '#00ff41' : '#0ea5e9'; // Green if active, Blue if idle

            for (let x = 0; x < width; x++) {
                const y = height / 2 + Math.sin(x * 0.05 + time) * (isActive ? 20 : 5) * Math.sin(x * 0.01 + time * 0.5);
                ctx.lineTo(x, y);
            }
            ctx.stroke();

            animationId = requestAnimationFrame(draw);
        };

        draw();

        return () => cancelAnimationFrame(animationId);
    }, [isActive]);

    return (
        <motion.div
            className={`relative w-full h-32 glass-panel overflow-hidden rounded-md border ${isActive ? 'border-primary' : 'border-secondary/30'}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
        >
            <div className="absolute top-2 left-2 text-xs text-primary/70 font-mono">
                {isActive ? '[SYSTEM]: TRANSMITTING...' : '[SYSTEM]: IDLE'}
            </div>
            <canvas ref={canvasRef} width={600} height={128} className="w-full h-full" />
        </motion.div>
    );
};

export default AudioVisualizer;

import React, { useRef, useEffect } from 'react';

const SpectrumAnalyzer = ({ analyserNode, color = '#00ff00' }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!analyserNode || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const bufferLength = analyserNode.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        // Resize handling
        const resizeCanvas = () => {
            const parent = canvas.parentElement;
            if (parent) {
                canvas.width = parent.clientWidth;
                canvas.height = parent.clientHeight;
            }
        };
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        let animationId;

        const draw = () => {
            animationId = requestAnimationFrame(draw);

            analyserNode.getByteFrequencyData(dataArray);

            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // Trail effect
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Settings for "8-bit" block look
            const barCount = 16; // Fewer bars for retro feel
            const barWidth = canvas.width / barCount;
            const blockHeight = 8; // Height of each "pixel" block
            const gap = 2; // Gap between blocks

            // We want to visualize roughly 0Hz to ~10kHz, heavily weighted to bass/mids for dance music
            // Analyser is usually 0-22kHz. 
            // We'll step through the dataArray with a stride.
            const step = Math.floor(bufferLength / barCount / 2); // Use lower half of spectrum mainly

            for (let i = 0; i < barCount; i++) {
                const dataIndex = Math.floor(i * step); // Simple linear sampling for now
                const value = dataArray[dataIndex];

                // Calculate how many blocks to draw
                // value is 0-255. 
                const percent = value / 255;
                const maxBlocks = Math.floor(canvas.height / (blockHeight + gap));
                const activeBlocks = Math.floor(percent * maxBlocks);

                // Draw blocks
                for (let b = 0; b < activeBlocks; b++) {
                    const y = canvas.height - (b + 1) * (blockHeight + gap);

                    // Dynamic Color: Changes based on height (intensity)
                    // Low = Green, Mid = Yellow, High = Red (Classic) 
                    // or just use prop color but fade it?
                    // Let's stick to the requested "Retro 8-bit" theme.
                    // Maybe gradient from color to white?

                    ctx.fillStyle = color;

                    // Draw rect
                    ctx.fillRect(i * barWidth + gap, y, barWidth - gap * 2, blockHeight);
                }
            }
        };

        draw();

        return () => {
            cancelAnimationFrame(animationId);
            window.removeEventListener('resize', resizeCanvas);
        };
    }, [analyserNode, color]);

    return (
        <canvas
            ref={canvasRef}
            className="spectrum-canvas"
            style={{
                width: '100%',
                height: '100%',
                display: 'block',
                imageRendering: 'pixelated' // Crucial for retro feel
            }}
        />
    );
};

export default SpectrumAnalyzer;

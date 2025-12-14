import React, { useRef, useState, useEffect } from 'react';

const XYPad = ({ onEffectChange }) => {
    const [isActive, setIsActive] = useState(false);
    const [position, setPosition] = useState({ x: 0.5, y: 0.5 }); // Default: Center (Neutral)
    const padRef = useRef(null);

    const handleInteract = (clientX, clientY) => {
        if (!padRef.current) return;
        const rect = padRef.current.getBoundingClientRect();

        let x = (clientX - rect.left) / rect.width;
        let y = 1 - (clientY - rect.top) / rect.height; // Invert Y so up is 1 (Max Effect)

        // Clamp
        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));

        setPosition({ x, y });
        onEffectChange(x, y);
    };

    const handleMouseDown = (e) => {
        setIsActive(true);
        handleInteract(e.clientX, e.clientY);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e) => {
        handleInteract(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
        setIsActive(false);
        // Snap back to Center (Neutral) for Momentary FX
        setPosition({ x: 0.5, y: 0.5 });
        onEffectChange(0.5, 0.5);

        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };

    // Helper for Y Label
    const getYLabel = (yVal) => {
        if (yVal > 0.55) return `REV: ${Math.round((yVal - 0.5) * 200)}%`;
        if (yVal < 0.45) return `DST: ${Math.round((0.5 - yVal) * 200)}%`;
        return 'DRY';
    }

    return (
        <div className="xy-pad-container" style={{
            width: '100%',
            height: 'auto',
            aspectRatio: '1 / 1',
            margin: '0',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
        }}>  <label className="mixer-label tiny" style={{ marginBottom: '4px' }}>FX PAD</label>
            <div
                ref={padRef}
                className="xy-pad-surface"
                onMouseDown={handleMouseDown}
                style={{
                    width: '100%',
                    height: '100%',
                    background: '#111',
                    border: '2px solid #333',
                    borderRadius: '4px',
                    position: 'relative',
                    cursor: 'crosshair',
                    overflow: 'hidden',
                    boxShadow: isActive ? '0 0 10px rgba(0, 255, 255, 0.3)' : 'inset 0 0 10px #000'
                }}
            >
                {/* Grid Lines */}
                <div style={{ position: 'absolute', top: '50%', left: 0, width: '100%', height: '1px', background: '#333' }}></div>
                <div style={{ position: 'absolute', top: 0, left: '50%', width: '1px', height: '100%', background: '#333' }}></div>

                {/* Cursor / Visualizer */}
                <div style={{
                    position: 'absolute',
                    left: `${position.x * 100}%`,
                    bottom: `${position.y * 100}%`,
                    width: '10px',
                    height: '10px',
                    background: isActive ? '#0ff' : '#005555',
                    borderRadius: '50%',
                    transform: 'translate(-50%, 50%)',
                    boxShadow: isActive ? '0 0 15px #0ff, 0 0 30px #0ff' : 'none',
                    transition: isActive ? 'none' : 'all 0.2s ease-out',
                    pointerEvents: 'none'
                }}></div>

                {/* Visual Feedback Text */}
                <div style={{
                    position: 'absolute',
                    top: '5px',
                    left: '5px',
                    color: '#0ff',
                    fontSize: '0.6rem',
                    opacity: isActive ? 1 : 0.3,
                    fontFamily: 'monospace'
                }}>
                    FLT: {position.x < 0.45 ? 'LP' : (position.x > 0.55 ? 'HP' : 'OFF')}
                </div>
                <div style={{
                    position: 'absolute',
                    bottom: '5px',
                    right: '5px',
                    color: '#0ff',
                    fontSize: '0.6rem',
                    opacity: isActive ? 1 : 0.3,
                    fontFamily: 'monospace'
                }}>
                    {getYLabel(position.y)}
                </div>
            </div>
        </div>
    );
};

export default XYPad;

import React, { useState } from 'react';

const HelpPopup = ({ text }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="help-container">
            <button
                className="help-btn pixel-font"
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                title="What is this?"
            >
                ?
            </button>
            {isOpen && (
                <div className="help-bubble pixel-font">
                    <div className="help-content">{text}</div>
                    <button className="help-close" onClick={() => setIsOpen(false)}>x</button>
                </div>
            )}
        </div>
    );
};

export default HelpPopup;

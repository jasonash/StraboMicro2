/**
 * SketchTextInput Component
 *
 * HTML overlay input for adding/editing sketch text annotations.
 * Positioned absolutely over the canvas at the specified coordinates.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Box, TextField, IconButton } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

interface SketchTextInputProps {
  /** Whether the input is visible */
  visible: boolean;
  /** Screen X position for the input */
  x: number;
  /** Screen Y position for the input */
  y: number;
  /** Initial text value (for editing existing text) */
  initialText?: string;
  /** Font size in pixels (for preview styling) */
  fontSize: number;
  /** Text color */
  color: string;
  /** Callback when text is confirmed */
  onConfirm: (text: string) => void;
  /** Callback when input is cancelled */
  onCancel: () => void;
}

/**
 * Renders an input overlay for text entry at the specified position.
 * Supports both new text creation and editing existing text.
 */
export const SketchTextInput: React.FC<SketchTextInputProps> = ({
  visible,
  x,
  y,
  initialText = '',
  fontSize,
  color,
  onConfirm,
  onCancel,
}) => {
  const [text, setText] = useState(initialText);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when visible
  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [visible]);

  // Reset text when initial text changes (for editing different items)
  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  if (!visible) return null;

  const handleConfirm = () => {
    const trimmed = text.trim();
    if (trimmed) {
      onConfirm(trimmed);
    } else {
      onCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <Box
      sx={{
        position: 'absolute',
        left: x,
        top: y,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        borderRadius: 1,
        padding: 0.5,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
      }}
    >
      <TextField
        inputRef={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter text..."
        size="small"
        autoComplete="off"
        sx={{
          minWidth: 150,
          '& .MuiInputBase-input': {
            color: color,
            fontSize: Math.min(fontSize, 20), // Cap preview size for UI
            padding: '4px 8px',
            fontFamily: 'Arial, sans-serif',
          },
          '& .MuiOutlinedInput-root': {
            '& fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.3)',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.5)',
            },
            '&.Mui-focused fieldset': {
              borderColor: color,
            },
          },
        }}
      />
      <IconButton
        size="small"
        onClick={handleConfirm}
        sx={{ color: '#4caf50', padding: 0.5 }}
      >
        <CheckIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={onCancel}
        sx={{ color: '#f44336', padding: 0.5 }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </Box>
  );
};

export default SketchTextInput;

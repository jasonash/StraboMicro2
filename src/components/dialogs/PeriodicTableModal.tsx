import React, { useState } from 'react';
import './PeriodicTableModal.css';
import { periodicTableElements, type PeriodicElement } from '../../data/periodicTableData';

interface PeriodicTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectElements: (elements: string[]) => void;
  initialSelection?: string[];
}

export function PeriodicTableModal({ isOpen, onClose, onSelectElements, initialSelection = [] }: PeriodicTableModalProps) {
  const [selectedElements, setSelectedElements] = useState<string[]>(initialSelection);

  if (!isOpen) return null;

  const toggleElement = (symbol: string) => {
    setSelectedElements(prev =>
      prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    );
  };

  const handleClear = () => {
    setSelectedElements([]);
  };

  const handleConfirm = () => {
    onSelectElements(selectedElements);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  // Calculate SVG dimensions
  const cellSize = 50;
  const cellPadding = 2;
  const totalCellSize = cellSize + cellPadding;
  const numColumns = 18;
  const numRows = 9;
  const svgWidth = numColumns * totalCellSize + 20; // +20 for padding
  const svgHeight = numRows * totalCellSize + 20;

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="periodic-table-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Select Element(s)</h2>
          <button className="close-button" onClick={handleCancel}>×</button>
        </div>

        <div className="modal-body">
          <p className="instructions">
            Click elements to select/deselect. Selected elements will be highlighted with a red border.
          </p>

          <div className="selected-elements-display">
            <strong>Selected:</strong> {selectedElements.length > 0 ? selectedElements.join(', ') : 'None'}
          </div>

          <div className="periodic-table-container">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              xmlns="http://www.w3.org/2000/svg"
              className="periodic-table-svg"
            >
              {periodicTableElements.map((element) => {
                const x = element.column * totalCellSize + 10;
                const y = element.row * totalCellSize + 10;
                const isSelected = selectedElements.includes(element.symbol);

                return (
                  <g
                    key={element.symbol}
                    className={`element-cell ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleElement(element.symbol)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Background rectangle */}
                    <rect
                      x={x}
                      y={y}
                      width={cellSize}
                      height={cellSize}
                      fill={element.bgColor}
                      stroke={isSelected ? '#e44c65' : '#555'}
                      strokeWidth={isSelected ? 3 : 1.5}
                      rx={4}
                    />

                    {/* Element symbol */}
                    <text
                      x={x + cellSize / 2}
                      y={y + cellSize / 2 + 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="16"
                      fontWeight="bold"
                      fill="#000"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {element.symbol}
                    </text>

                    {/* Atomic number */}
                    <text
                      x={x + cellSize / 2}
                      y={y + cellSize - 8}
                      textAnchor="middle"
                      fontSize="9"
                      fill="#333"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {element.number}
                    </text>

                    {/* Hover effect - add a title for tooltip */}
                    <title>{element.name} ({element.number})</title>
                  </g>
                );
              })}

              {/* Add a note for lanthanides */}
              <text
                x={2 * totalCellSize + 10 + cellSize / 2}
                y={5.5 * totalCellSize + 10 + cellSize / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="10"
                fill="#666"
              >
                57-71
              </text>

              {/* Add a note for actinides */}
              <text
                x={2 * totalCellSize + 10 + cellSize / 2}
                y={6.5 * totalCellSize + 10 + cellSize / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="10"
                fill="#666"
              >
                89-103
              </text>
            </svg>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={handleClear}>
            Clear Selection
          </button>
          <div className="button-group-right">
            <button className="btn-secondary" onClick={handleCancel}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleConfirm}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

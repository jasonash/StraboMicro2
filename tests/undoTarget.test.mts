/**
 * What Edit > Undo acts on (src/utils/undoTarget.ts): the text of a focused
 * text field, nothing while a dialog is open, the project otherwise.
 *
 *   npm run test:undo-target
 */

import { undoTarget, isTextEditing } from '../src/utils/undoTarget.ts';

let failures = 0;
let passes = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        got      ${JSON.stringify(actual)}\n        expected ${JSON.stringify(expected)}`);
  }
}

const text = { tagName: 'INPUT', type: 'text' };
const canvas = { tagName: 'CANVAS' };
const body = { tagName: 'BODY' };

// No dialog
eq('nothing focused, no dialog: project', undoTarget(null, false), 'project');
eq('body focused, no dialog: project', undoTarget(body, false), 'project');
eq('viewer canvas, no dialog: project', undoTarget(canvas, false), 'project');
eq('button, no dialog: project', undoTarget({ tagName: 'BUTTON' }, false), 'project');
eq('text field, no dialog: text', undoTarget(text, false), 'text');

// A dialog is open: never the project
eq('nothing focused, dialog: none', undoTarget(null, true), 'none');
eq('dialog paper focused: none', undoTarget({ tagName: 'DIV' }, true), 'none');
eq('canvas in a dialog (scale bar line): none', undoTarget(canvas, true), 'none');
eq('button in a dialog: none', undoTarget({ tagName: 'BUTTON' }, true), 'none');
eq('text field in a dialog: text', undoTarget(text, true), 'text');
eq('number field in a dialog: text', undoTarget({ tagName: 'INPUT', type: 'number' }, true), 'text');
eq('checkbox in a dialog: none', undoTarget({ tagName: 'INPUT', type: 'checkbox' }, true), 'none');

// Which elements count as text editing
eq('input without a type', isTextEditing({ tagName: 'INPUT', type: null }), true);
eq('input type in capitals', isTextEditing({ tagName: 'INPUT', type: 'TEXT' }), true);
eq('lowercase tag name', isTextEditing({ tagName: 'input', type: 'text' }), true);
for (const type of ['search', 'url', 'tel', 'email', 'password', 'number']) {
  eq(`input type ${type}`, isTextEditing({ tagName: 'INPUT', type }), true);
}
for (const type of ['checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit']) {
  eq(`input type ${type} is not text`, isTextEditing({ tagName: 'INPUT', type }), false);
}
eq('textarea', isTextEditing({ tagName: 'TEXTAREA' }), true);
eq('read-only text field', isTextEditing({ tagName: 'INPUT', type: 'text', readOnly: true }), false);
eq('disabled text field', isTextEditing({ tagName: 'INPUT', type: 'text', disabled: true }), false);
eq('read-only textarea', isTextEditing({ tagName: 'TEXTAREA', readOnly: true }), false);
eq('content-editable element', isTextEditing({ tagName: 'DIV', isContentEditable: true }), true);
eq('plain div', isTextEditing({ tagName: 'DIV', isContentEditable: false }), false);
eq('select', isTextEditing({ tagName: 'SELECT' }), false);
eq('nothing', isTextEditing(null), false);

// A read-only field without a dialog does not swallow the project undo
eq('read-only text field, no dialog: project', undoTarget({ tagName: 'INPUT', type: 'text', readOnly: true }, false), 'project');
eq('read-only text field, dialog: none', undoTarget({ tagName: 'INPUT', type: 'text', readOnly: true }, true), 'none');

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);

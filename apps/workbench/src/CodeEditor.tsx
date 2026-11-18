import { useEffect, useRef } from 'react';
import { Annotation, Compartment, EditorState, Transaction } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { closeBrackets, closeBracketsKeymap, autocompletion } from '@codemirror/autocomplete';
import { goToNextChunk, goToPreviousChunk, unifiedMergeView } from '@codemirror/merge';
import { codeDiffOptions } from './code-merge';

const externalUpdate = Annotation.define<boolean>();
const editingMode = (readOnly: boolean) => [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];

export default function CodeEditor({ value, onChange, onSave, label, original, readOnly = false }: {
  value: string;
  onChange?: (value: string) => void;
  onSave?: () => void;
  label: string;
  original?: string;
  readOnly?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const mode = useRef(new Compartment());
  const callbacks = useRef({ onChange, onSave });
  callbacks.current = { onChange, onSave };
  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(), highlightActiveLineGutter(), history(), bracketMatching(), closeBrackets(), indentOnInput(), autocompletion(),
          javascript({ typescript: true, jsx: true }), oneDark, highlightActiveLine(),
          mode.current.of(editingMode(readOnly)),
          keymap.of([
            { key: 'Mod-s', run: () => { callbacks.current.onSave?.(); return true; } },
            { key: 'Alt-ArrowDown', run: goToNextChunk },
            { key: 'Alt-ArrowUp', run: goToPreviousChunk },
            ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap,
          ]),
          original === undefined ? [] : [
            EditorState.phrases.of({ '$ unchanged lines': '展开 $ 行未修改代码' }),
            unifiedMergeView({
              original, mergeControls: false, collapseUnchanged: { margin: 3 },
              diffConfig: codeDiffOptions, syntaxHighlightDeletions: false,
            }),
          ],
          EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false', tabindex: '0' }),
          EditorView.theme({
            '&': { height: '100%', backgroundColor: '#0d0d0e', fontSize: '12px' },
            '.cm-scroller': { overflow: 'auto', fontFamily: '"SFMono-Regular", Consolas, monospace', lineHeight: '1.75' },
            '.cm-gutters': { backgroundColor: '#0d0d0e', border: 'none', color: '#78766f' },
            '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#eae6f333' },
            '.cm-content': { paddingTop: '14px' }, '&.cm-focused': { outline: 'none' },
          }),
          EditorView.updateListener.of(update => {
            if (update.transactions.some(transaction => transaction.docChanged && !transaction.annotation(externalUpdate))) {
              callbacks.current.onChange?.(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    editor.current = view;
    return () => { editor.current = null; view.destroy(); };
  }, [label, original]);
  useEffect(() => {
    editor.current?.dispatch({ effects: mode.current.reconfigure(editingMode(readOnly)) });
  }, [label, original, readOnly]);
  useEffect(() => {
    const view = editor.current;
    if (view && value !== view.state.doc.toString()) view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      annotations: [externalUpdate.of(true), Transaction.addToHistory.of(false)],
    });
  }, [value]);
  return <div ref={host} className="code-editor" />;
}

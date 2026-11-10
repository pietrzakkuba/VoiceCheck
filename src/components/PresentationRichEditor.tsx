import { useEffect, useMemo, useState } from 'react';
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { EditorContent, useEditor } from '@tiptap/react';
import { Bold, Heading2, Heading3, Italic, List, ListOrdered, Pilcrow, Redo2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/primitives';
import { MAX_PRESENTATION_CHARS } from '@/lib/presentation';
import { documentText } from '@/lib/presentationDocument';
import { presentationExtensions } from '@/lib/presentationExtensions';
import { useT, type Lang } from '@/i18n';
import type { PresentationDocument } from '@/types';

export function presentationCharacterLimit(onLimit: (exceeded: boolean) => void) {
  return Extension.create({
    name: 'presentationCharacterLimit',
    addProseMirrorPlugins() {
      return [new Plugin({
        filterTransaction(transaction, state) {
          if (!transaction.docChanged) return true;
          const length = documentText(transaction.doc.toJSON()).length;
          const previousLength = documentText(state.doc.toJSON()).length;
          if (length > MAX_PRESENTATION_CHARS && length > previousLength) {
            onLimit(true);
            return false;
          }
          onLimit(false);
          return true;
        },
      })];
    },
  });
}

export function PresentationRichEditor({ document, onChange, disabled = false, lang }: {
  document: PresentationDocument;
  onChange: (document: PresentationDocument) => void;
  disabled?: boolean;
  /** Language of the presentation text (sets the `lang` attribute of the editable area). */
  lang?: Lang;
}) {
  const t = useT();
  const m = t.presentations.richEditor;
  const [limitExceeded, setLimitExceeded] = useState(false);
  const extensions = useMemo(() => [
    ...presentationExtensions(),
    presentationCharacterLimit(setLimitExceeded),
  ], []);
  const editor = useEditor({
    extensions,
    content: document.content,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editable: !disabled,
    editorProps: {
      attributes: {
        id: 'presentation-text',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': 'presentation-text-label',
        'aria-describedby': 'presentation-text-count',
        ...(lang ? { lang } : {}),
        class: 'presentation-content min-h-80 px-3 py-2 text-sm outline-none',
      },
    },
    onUpdate: ({ editor: current }) => {
      onChange({ version: 1, content: current.getJSON() });
    },
  });

  useEffect(() => {
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(document.content)) {
      editor.commands.setContent(document.content, { emitUpdate: false });
    }
  }, [editor, document]);

  const controls = editor ? [
    { label: m.bold, Icon: Bold, active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
    { label: m.italic, Icon: Italic, active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
    { label: m.paragraph, Icon: Pilcrow, active: editor.isActive('paragraph'), run: () => editor.chain().focus().setParagraph().run() },
    { label: m.heading, Icon: Heading2, active: editor.isActive('heading', { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: m.subheading, Icon: Heading3, active: editor.isActive('heading', { level: 3 }), run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { label: m.bulletList, Icon: List, active: editor.isActive('bulletList'), run: () => editor.chain().focus().toggleBulletList().run() },
    { label: m.orderedList, Icon: ListOrdered, active: editor.isActive('orderedList'), run: () => editor.chain().focus().toggleOrderedList().run() },
  ] : [];

  return (
    <div className="space-y-2">
      <div className="rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring/50">
        <div role="group" aria-label={m.toolbar} className="flex flex-wrap gap-1 border-b p-1">
          {controls.map(({ label, Icon, active, run }) => (
            <Button key={label} type="button" size="icon" variant={active ? 'secondary' : 'ghost'}
              aria-label={label} title={label} aria-pressed={active} disabled={disabled}
              onMouseDown={(event) => event.preventDefault()} onClick={run}>
              <Icon aria-hidden />
            </Button>
          ))}
          <Button type="button" size="icon" variant="ghost" aria-label={m.undo} title={m.undo}
            disabled={disabled || !editor?.can().undo()} onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor?.chain().focus().undo().run()}><Undo2 aria-hidden /></Button>
          <Button type="button" size="icon" variant="ghost" aria-label={m.redo} title={m.redo}
            disabled={disabled || !editor?.can().redo()} onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor?.chain().focus().redo().run()}><Redo2 aria-hidden /></Button>
        </div>
        <EditorContent editor={editor} />
      </div>
      {limitExceeded && (
        <Alert variant="bad">{m.limitExceeded(MAX_PRESENTATION_CHARS)}</Alert>
      )}
    </div>
  );
}

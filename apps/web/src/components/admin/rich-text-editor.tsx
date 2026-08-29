'use client';

import * as React from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * TipTap editor for product descriptions (blueprint F1.2).
 *
 * Emits HTML, which the API stores and the product page renders. Sanitising
 * happens server-side before storage - never trust what arrives here, even
 * from an admin.
 */
export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
    ],
    content: value,
    // Tiptap warns without this in SSR frameworks; the editor is client-only.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'min-h-40 max-w-none px-3 py-2 text-sm leading-relaxed focus:outline-none [&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-4 [&_ol]:mb-2 [&_ol]:list-decimal [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic',
      },
    },
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
  });

  // Keep the editor in sync when the value is replaced from outside (loading an
  // existing product), without clobbering what the admin is typing.
  React.useEffect(() => {
    if (!editor || editor.getHTML() === value) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) {
    return <div className="h-44 animate-pulse rounded-md border border-border bg-muted/40" />;
  }

  return (
    <div className="overflow-hidden rounded-md border border-border focus-within:ring-2 focus-within:ring-ring/40">
      <div className="flex flex-wrap gap-0.5 border-b border-border bg-muted/40 p-1">
        <ToolButton
          label="Bold"
          icon={Bold}
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolButton
          label="Italic"
          icon={Italic}
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolButton
          label="Strikethrough"
          icon={Strikethrough}
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />

        <span className="mx-1 w-px bg-border" />

        <ToolButton
          label="Heading"
          icon={Heading2}
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolButton
          label="Bullet list"
          icon={List}
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolButton
          label="Numbered list"
          icon={ListOrdered}
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolButton
          label="Quote"
          icon={Quote}
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />

        <span className="mx-1 w-px bg-border" />

        <ToolButton
          label="Undo"
          icon={Undo2}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        />
        <ToolButton
          label="Redo"
          icon={Redo2}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        />
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}

function ToolButton({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn('size-7', active && 'bg-accent text-accent-foreground')}
    >
      <Icon className="size-3.5" />
    </Button>
  );
}

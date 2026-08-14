import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { Editor, EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { cn } from 'lib/utility';
import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';
import { FormField, FormItem, FormLabel, FormMessage } from '..';

// Email-safe editor: constrained to bold / italic / underline, links and bullet +
// ordered lists. Everything an email client chokes on (images, tables, headings,
// code, blockquote, horizontal rules, raw HTML) is switched OFF. tiptap v3's
// StarterKit bundles Link + Underline, so we disable those bundled copies and
// register our own explicitly-configured versions (no duplicate-extension warning)
// — the Link is forced to safe protocols + rel=noopener. The authoritative
// sanitize stays server-side (bluemonday at write AND render); this constraint is
// only UX / defense-in-depth.
const EMAIL_SAFE_EXTENSIONS = [
  StarterKit.configure({
    heading: false,
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    strike: false,
    code: false,
    // Disable the StarterKit-bundled marks so our configured ones below are the
    // only registration (passing these keys is harmless on any version).
    link: false,
    underline: false,
  }),
  Underline,
  Link.configure({
    openOnClick: false,
    autolink: true,
    protocols: ['http', 'https', 'mailto'],
    HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
  }),
];

// Belt-and-suspenders allow-listing of pasted markup before tiptap's schema (which
// already drops anything it can't model) sees it: strip whole script/style/head
// nodes so their text content never leaks in as plain text.
function stripToEmailSafeHtml(html: string): string {
  if (typeof window === 'undefined' || !html) return html;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc
      .querySelectorAll('script, style, link, meta, title, iframe, object, embed, svg')
      .forEach((el) => el.remove());
    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

// tiptap renders `<p></p>` for an empty document; treat that as an empty string so
// required-field / "language complete" checks (which test trimmed length) behave.
function readHtml(editor: Editor): string {
  return editor.isEmpty ? '' : editor.getHTML();
}

type ToolbarButtonProps = {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  title: string;
};

function ToolbarButton({ active, disabled, onClick, label, title }: ToolbarButtonProps) {
  return (
    <button
      type='button'
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'h-7 min-w-7 px-1.5 leading-none border border-textInactiveColor transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor',
        active ? 'bg-textColor text-bgColor' : 'bg-bgColor hover:bg-textColor hover:text-bgColor',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <Text size='small' className='leading-none group-hover:text-bgColor'>
        {label}
      </Text>
    </button>
  );
}

function EmailRichTextEditor({
  value,
  onChange,
  onBlur,
  disabled,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  hasError?: boolean;
}) {
  const editor = useEditor({
    editable: !disabled,
    extensions: EMAIL_SAFE_EXTENSIONS,
    content: value || '',
    editorProps: {
      attributes: {
        // 16px, а не 12px админа: это НЕ поле формы, а холст, на котором пишут текст письма —
        // абзацами, а читать его будет покупатель в почте, где он и наберётся примерно так.
        // Двенадцать здесь сравняли бы тело письма с его же подписью-лейблом.
        class:
          'min-h-[120px] w-full px-3 py-2 text-base focus:outline-none leading-snug [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_a]:underline',
      },
      transformPastedHTML: stripToEmailSafeHtml,
    },
    onUpdate: ({ editor: e }) => onChange(readHtml(e)),
    onBlur: () => onBlur?.(),
  });

  // Sync external value changes (form.reset, language switch inside
  // UnifiedTranslationFields, copy-to-all) into the editor without echoing an
  // update back out (emitUpdate:false) — the guard prevents cursor-jump loops.
  useEffect(() => {
    if (!editor) return;
    const next = value || '';
    if (next !== readHtml(editor)) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) return null;

  return (
    <div
      className={cn(
        'border',
        hasError ? 'border-error' : 'border-textInactiveColor',
        disabled && 'opacity-60',
      )}
    >
      {!disabled && (
        <div className='flex flex-wrap items-center gap-1 border-b border-textInactiveColor p-1'>
          <ToolbarButton
            title='bold'
            label='B'
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            title='italic'
            label='I'
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            title='underline'
            label='U'
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
          <span className='mx-0.5 h-5 w-px bg-textInactiveColor' aria-hidden />
          <ToolbarButton
            title='bullet list'
            label='• list'
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            title='ordered list'
            label='1. list'
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <span className='mx-0.5 h-5 w-px bg-textInactiveColor' aria-hidden />
          <ToolbarButton
            title='add / edit link'
            label='link'
            active={editor.isActive('link')}
            onClick={() => {
              const prev = editor.getAttributes('link').href as string | undefined;
              const url = window.prompt('link URL (http, https or mailto)', prev || 'https://');
              if (url === null) return; // cancelled
              if (url === '') {
                editor.chain().focus().extendMarkRange('link').unsetLink().run();
                return;
              }
              editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
            }}
          />
          {editor.isActive('link') && (
            <ToolbarButton
              title='remove link'
              label='unlink'
              onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
            />
          )}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

// RHF field wrapping the email-safe tiptap editor. Emits a sanitized-ish HTML
// string (or '' when empty) on the given form path — the RICH_TEXT block carries
// its HTML in the per-language EmailBlockTranslation.body. Matches the ui/form
// field conventions (FormField / FormItem / FormLabel / FormMessage).
export function RichTextField({
  name,
  label,
  disabled,
}: {
  name: string;
  label?: string;
  disabled?: boolean;
}) {
  const { control } = useFormContext();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          {label && <FormLabel>{label}</FormLabel>}
          <EmailRichTextEditor
            value={typeof field.value === 'string' ? field.value : ''}
            onChange={field.onChange}
            onBlur={field.onBlur}
            disabled={disabled}
            hasError={!!fieldState.error}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export default RichTextField;

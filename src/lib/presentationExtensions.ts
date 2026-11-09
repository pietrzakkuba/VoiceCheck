import StarterKit from '@tiptap/starter-kit';

export function presentationExtensions() {
  return [StarterKit.configure({
    heading: { levels: [2, 3] },
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    link: false,
    underline: false,
    trailingNode: false,
  })];
}

import React, { useEffect, forwardRef, useImperativeHandle } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import './TipTapEditor.css'

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const highlightKey = new PluginKey('aiHighlight')

// Non-destructive highlight overlay — paints decorations over matching text
// without touching the document, so clicking an AI-rating signal can point
// straight at the words responsible without risking the actual content.
const AIHighlight = Extension.create({
  name: 'aiHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: highlightKey,
        state: {
          init() {
            return { terms: [], decorations: DecorationSet.empty }
          },
          apply(tr, prev) {
            const meta = tr.getMeta(highlightKey)
            const terms = meta ? meta.terms : prev.terms
            if (!meta && !tr.docChanged) return prev
            if (!terms || terms.length === 0) return { terms: [], decorations: DecorationSet.empty }

            const decos = []
            const wholeWord = meta?.wholeWord !== false
            const regexes = terms
              .filter(Boolean)
              .map(t => new RegExp(wholeWord ? `\\b${escapeRegExp(t)}\\b` : escapeRegExp(t), 'gi'))

            tr.doc.descendants((node, pos) => {
              if (!node.isText) return
              const text = node.text
              regexes.forEach(re => {
                re.lastIndex = 0
                let m
                while ((m = re.exec(text))) {
                  const from = pos + m.index
                  const to = from + m[0].length
                  decos.push(Decoration.inline(from, to, { class: 'ai-highlight-mark' }))
                  if (m[0].length === 0) re.lastIndex++
                }
              })
            })
            return { terms, decorations: DecorationSet.create(tr.doc, decos) }
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)?.decorations
          },
        },
      }),
    ]
  },
})

function ToolbarButton({ onClick, active, title, children, wide, disabled }) {
  return (
    <button
      className={`toolbar-btn ${active ? 'active' : ''} ${wide ? 'wide' : ''}`}
      onClick={onClick}
      title={title}
      type="button"
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="toolbar-divider" />
}

function MenuBar({ editor }) {
  if (!editor) return null

  const setLink = () => {
    const prev = editor.getAttributes('link').href
    const url = window.prompt('URL', prev || 'https://')
    if (url === null) return
    // extendMarkRange is required here — with a collapsed cursor (just
    // clicked inside the link, nothing selected), unsetLink/setLink on their
    // own only affect a zero-length range and silently do nothing to the
    // existing linked text. Extending to the full mark range first is what
    // makes "clear the URL to remove the link" actually work.
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
  }

  const insertImage = () => {
    const url = window.prompt('Image URL', 'https://')
    if (url) editor.chain().focus().setImage({ src: url }).run()
  }

  return (
    <div className="editor-toolbar">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')} title="Bold"
      ><strong>B</strong></ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')} title="Italic"
      ><em>I</em></ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')} title="Strikethrough"
      ><s>S</s></ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive('code')} title="Inline Code"
      >
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })} title="Heading 1" wide
      >H1</ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })} title="Heading 2" wide
      >H2</ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })} title="Heading 3" wide
      >H3</ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')} title="Bullet List"
      >
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 4a1 1 0 100 2 1 1 0 000-2zm0 6a1 1 0 100 2 1 1 0 000-2zm0 6a1 1 0 100 2 1 1 0 000-2zM7 4a1 1 0 000 2h10a1 1 0 100-2H7zm0 6a1 1 0 000 2h10a1 1 0 100-2H7zm0 6a1 1 0 000 2h10a1 1 0 100-2H7z" clipRule="evenodd"/></svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')} title="Ordered List"
      >
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4a1 1 0 000 2h10a1 1 0 100-2H5zm-1 6a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zm0 5a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2.5 5a.5.5 0 11-1 0 .5.5 0 011 0zm0 5a.5.5 0 11-1 0 .5.5 0 011 0zm0 5a.5.5 0 11-1 0 .5.5 0 011 0z" clipRule="evenodd"/></svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')} title="Blockquote"
      >
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 5a1 1 0 011-1h4a1 1 0 010 2H5v3a1 1 0 01-1 1H3a1 1 0 01-1-1V5zm8 0a1 1 0 011-1h4a1 1 0 010 2h-3v3a1 1 0 01-1 1h-1a1 1 0 01-1-1V5z" clipRule="evenodd"/></svg>
      </ToolbarButton>

      <Divider />

      <ToolbarButton onClick={setLink} active={editor.isActive('link')} title="Insert / Edit Link">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd"/></svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={removeLink}
        disabled={!editor.isActive('link')}
        title={editor.isActive('link') ? 'Remove Link' : 'Place cursor inside a link to remove it'}
      >
        <svg viewBox="0 0 20 20" fill="currentColor"><path d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.583-1.583a4 4 0 00-.336-5.366l-1.5-1.5a1 1 0 10-1.414 1.414l1.5 1.5a2 2 0 01.225 2.546l-2.69-2.69a2 2 0 01.225-2.546l.79-.79a1 1 0 10-1.414-1.414l-.79.79a4 4 0 00-.444 5.105L8.464 9.88a4 4 0 00-5.105.444l-1.5 1.5a4 4 0 005.656 5.657l.793-.793-1.414-1.415-.793.794a2 2 0 01-2.828-2.829l1.5-1.5a2 2 0 012.546-.225l1.293 1.293-9.413-9.413z"/></svg>
      </ToolbarButton>

      <ToolbarButton onClick={insertImage} title="Insert Image">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd"/></svg>
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        title="Undo"
      >
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 5a1 1 0 00-1.707-.707l-4 4a1 1 0 000 1.414l4 4A1 1 0 008 13V9.414l7.293 7.293a1 1 0 001.414-1.414L9.414 8l6.293-6.293a1 1 0 00-1.414-1.414L8 6.586V5z" clipRule="evenodd"/></svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        title="Redo"
      >
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12 5a1 1 0 011.707-.707l4 4a1 1 0 010 1.414l-4 4A1 1 0 0112 13V9.414l-7.293 7.293a1 1 0 01-1.414-1.414L10.586 8 4.293 1.707A1 1 0 015.707.293L12 6.586V5z" clipRule="evenodd"/></svg>
      </ToolbarButton>
    </div>
  )
}

function linkifyFirst(html, phrase, url) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(${escaped})`, 'i')
  let result = '', remaining = html, done = false, inLink = 0
  while (remaining.length > 0) {
    const tag = remaining.match(/^(<[^>]+>)/)
    if (tag) {
      const t = tag[1]
      if (/^<a[\s>]/i.test(t)) inLink++
      if (/^<\/a>/i.test(t)) inLink = Math.max(0, inLink - 1)
      result += t
      remaining = remaining.slice(t.length)
    } else {
      const end = remaining.indexOf('<')
      const text = end === -1 ? remaining : remaining.slice(0, end)
      if (!done && inLink === 0 && re.test(text)) {
        result += text.replace(re, m => { done = true; return `<a href="${url}" target="_blank" rel="noopener noreferrer">${m}</a>` })
      } else {
        result += text
      }
      remaining = end === -1 ? '' : remaining.slice(end)
    }
  }
  return { html: result, success: done }
}

const TipTapEditor = forwardRef(function TipTapEditor({ content = '', onChange, placeholder = 'Start writing your post...' }, ref) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder }),
      AIHighlight,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
  })

  useImperativeHandle(ref, () => ({
    autoLinkPhrase(phrase, url) {
      if (!editor) return false
      const { html, success } = linkifyFirst(editor.getHTML(), phrase, url)
      if (success) editor.commands.setContent(html, false)
      return success
    },
    insertAtCursor(text, url) {
      if (!editor) return
      editor.chain().focus()
        .insertContent(`<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a> `)
        .run()
    },
    insertParagraphLink(label, linkText, url) {
      if (!editor) return
      editor.chain().focus()
        .insertContent(`<p><strong>${label}:</strong> <a href="${url}" target="_blank" rel="noopener noreferrer">${linkText}</a></p>`)
        .run()
    },
    setContent(html) {
      if (!editor) return
      editor.commands.setContent(html || '')
    },
    getHTML() { return editor?.getHTML() || '' },
    focus() { editor?.chain().focus('start').run() },
    // Paints a non-destructive highlight over every match of the given terms
    // (used by the AI Content Rating signal breakdown) and scrolls the first
    // hit into view. wholeWord:false lets symbol-only terms like em dashes
    // match without word-boundary constraints.
    setHighlights(terms, { wholeWord = true } = {}) {
      if (!editor) return
      editor.view.dispatch(editor.view.state.tr.setMeta(highlightKey, { terms: terms || [], wholeWord }))
      requestAnimationFrame(() => {
        const mark = editor.view.dom.querySelector('.ai-highlight-mark')
        mark?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    },
    clearHighlights() {
      if (!editor) return
      editor.view.dispatch(editor.view.state.tr.setMeta(highlightKey, { terms: [] }))
    },
  }), [editor])

  useEffect(() => {
    if (editor && content !== undefined && content !== editor.getHTML()) {
      editor.commands.setContent(content || '')
    }
  }, [content, editor])

  return (
    <div className="tiptap-wrapper">
      <MenuBar editor={editor} />
      <div className="editor-body">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
})

export default TipTapEditor

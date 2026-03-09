import { renderMermaidSVG, renderMermaidASCII, THEMES } from 'beautiful-mermaid'
import { deflate, inflate } from 'pako'

const editor = document.getElementById('editor')
const preview = document.getElementById('preview')
const errorEl = document.getElementById('error')
const themeSelect = document.getElementById('theme-select')
const shareBtn = document.getElementById('share-btn')
const renderModeBtn = document.getElementById('render-mode-btn')
const notesPanel = document.getElementById('notes-panel')
const notesContent = document.getElementById('notes-content')
const notesToggleBtn = document.getElementById('notes-toggle-btn')

let renderMode = 'svg' // 'svg' or 'ascii'

const DEFAULT_THEME = 'github-light'

const LIGHT_THEMES = new Set([
  'zinc-light', 'tokyo-night-light', 'catppuccin-latte',
  'nord-light', 'github-light', 'solarized-light',
])

function applyPageTheme(themeName) {
  const isLight = LIGHT_THEMES.has(themeName)
  const root = document.documentElement.style
  if (isLight) {
    root.setProperty('--bg', '#ffffff')
    root.setProperty('--fg', '#27272a')
    root.setProperty('--surface', '#f4f4f5')
    root.setProperty('--border', '#d4d4d8')
    root.setProperty('--accent', '#0969da')
  } else {
    root.setProperty('--bg', '#1a1b26')
    root.setProperty('--fg', '#a9b1d6')
    root.setProperty('--surface', '#24283b')
    root.setProperty('--border', '#3d59a1')
    root.setProperty('--accent', '#7aa2f7')
  }
}

const DEFAULT_DIAGRAM = `graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Process]
    B -->|No| D[End]
    C --> D`

// --- URL encoding/decoding ---

function encode(text) {
  const compressed = deflate(new TextEncoder().encode(text))
  return btoa(String.fromCharCode(...compressed))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function decodeBase64Url(encoded) {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  return Uint8Array.from(binary, c => c.charCodeAt(0))
}

function decode(encoded) {
  const bytes = decodeBase64Url(encoded)

  // Try pako inflate (zlib format — our default encoding)
  try {
    return new TextDecoder().decode(inflate(bytes))
  } catch { /* not zlib */ }

  // Try plain base64 (no compression)
  const text = new TextDecoder().decode(bytes)
  if (/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|xychart)/m.test(text)) {
    return text
  }

  // Try decoding as URI-encoded plain text
  try {
    const decoded = decodeURIComponent(text)
    if (/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|xychart)/m.test(decoded)) {
      return decoded
    }
  } catch { /* not URI-encoded */ }

  throw new Error('Unable to decode diagram from URL. The link may use an unsupported encoding format.')
}

function loadFromHash() {
  const hash = window.location.hash.slice(1)
  if (!hash) return { code: null, theme: null, error: null }
  try {
    const params = new URLSearchParams(hash)
    const theme = params.get('t') || null
    const encoded = params.get('c')
    if (!encoded) return { code: null, theme, error: null }
    return { code: decode(encoded), theme, error: null }
  } catch (err) {
    return { code: null, theme: null, error: err.message }
  }
}

function updateHash(code, themeName) {
  const params = new URLSearchParams()
  params.set('c', encode(code))
  if (themeName !== DEFAULT_THEME) params.set('t', themeName)
  window.location.hash = params.toString()
}

// --- Theme setup ---

let currentThemeName = DEFAULT_THEME

const themeNames = Object.keys(THEMES).sort()
themeNames.forEach(name => {
  const opt = document.createElement('option')
  opt.value = name
  opt.textContent = name
  themeSelect.appendChild(opt)
})
themeSelect.value = currentThemeName

// --- Notes extraction ---

function extractNotes(code) {
  const notesRegex = /^%% @notes\s*\n([\s\S]*?)\n%% @end-notes\s*\n?/m
  const match = code.match(notesRegex)
  if (!match) return { diagramCode: code, notes: null }
  const rawNotes = match[1]
    .split('\n')
    .map(line => line.replace(/^%% ?/, ''))
    .join('\n')
    .trim()
  const diagramCode = code.replace(notesRegex, '').trim()
  return { diagramCode, notes: rawNotes }
}

// --- Simple markdown to HTML ---
// Security: escapeHtml() runs on all raw text BEFORE any tag insertion.
// Only whitelisted tags (h2, p, ul, li, table, tr, th, td, strong, code, pre) are produced.

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderInline(text) {
  let html = escapeHtml(text)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  return html
}

function renderMarkdown(text) {
  const lines = text.split('\n')
  const parts = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.startsWith('```')) {
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(escapeHtml(lines[i]))
        i++
      }
      i++ // skip closing ```
      parts.push(`<pre>${codeLines.join('\n')}</pre>`)
      continue
    }

    // Headers
    if (line.startsWith('## ')) {
      parts.push(`<h2>${renderInline(line.slice(3))}</h2>`)
      i++
      continue
    }

    // Table
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableRows = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
        tableRows.push(lines[i])
        i++
      }
      const isSeparator = row => /^\|[\s\-:|]+\|$/.test(row.trim())
      const dataRows = tableRows.filter(r => !isSeparator(r))
      if (dataRows.length > 0) {
        let tableHtml = '<table>'
        dataRows.forEach((row, idx) => {
          const cells = row.split('|').filter(c => c !== '').map(c => c.trim())
          const tag = idx === 0 ? 'th' : 'td'
          tableHtml += '<tr>' + cells.map(c => `<${tag}>${renderInline(c)}</${tag}>`).join('') + '</tr>'
        })
        tableHtml += '</table>'
        parts.push(tableHtml)
      }
      continue
    }

    // Bullet list
    if (line.match(/^\s*- /)) {
      const items = []
      while (i < lines.length && lines[i].match(/^\s*- /)) {
        items.push(renderInline(lines[i].replace(/^\s*- /, '')))
        i++
      }
      parts.push('<ul>' + items.map(item => `<li>${item}</li>`).join('') + '</ul>')
      continue
    }

    // Empty line
    if (line.trim() === '') {
      i++
      continue
    }

    // Paragraph
    parts.push(`<p>${renderInline(line)}</p>`)
    i++
  }

  return parts.join('\n')
}

function displayNotes(notes) {
  if (!notes) {
    notesPanel.hidden = true
    return
  }
  notesPanel.hidden = false
  notesPanel.classList.remove('collapsed')
  // Safe: renderMarkdown escapes all HTML first via escapeHtml(),
  // then only adds whitelisted tags (h2, p, ul, li, table, strong, code, pre).
  notesContent.innerHTML = renderMarkdown(notes)
}

// --- Rendering ---
// Note: renderMermaidSVG returns structured SVG from parsed Mermaid AST,
// not raw user input. The library handles sanitization internally.

function render() {
  const code = editor.value.trim()
  if (!code) {
    preview.replaceChildren()
    errorEl.hidden = true
    displayNotes(null)
    return
  }

  const { diagramCode, notes } = extractNotes(code)
  displayNotes(notes)

  try {
    if (renderMode === 'ascii') {
      const ascii = renderMermaidASCII(diagramCode, { colorMode: 'none' })
      const pre = document.createElement('pre')
      pre.className = 'ascii-output'
      pre.textContent = ascii
      preview.replaceChildren(pre)
      errorEl.hidden = true
      centerDiagram()
    } else {
      const theme = THEMES[currentThemeName]
      const svg = renderMermaidSVG(diagramCode, { ...theme, transparent: true })
      const container = document.createElement('div')
      container.innerHTML = svg
      preview.replaceChildren(...container.childNodes)
      errorEl.hidden = true
      centerDiagram()
    }
  } catch (err) {
    preview.replaceChildren()
    const msg = renderMode === 'ascii'
      ? 'ASCII rendering failed — diagram may be too complex. Try SVG mode.'
      : (err.message || String(err))
    errorEl.textContent = msg
    errorEl.hidden = false
  }
}

// --- Event handlers ---

let debounceTimer
editor.addEventListener('input', () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    render()
    updateHash(editor.value, currentThemeName)
  }, 300)
})

renderModeBtn.addEventListener('click', () => {
  renderMode = renderMode === 'svg' ? 'ascii' : 'svg'
  renderModeBtn.textContent = renderMode.toUpperCase()
  // Defer render so button text updates before potentially heavy ASCII render
  setTimeout(render, 0)
})

themeSelect.addEventListener('change', () => {
  currentThemeName = themeSelect.value
  applyPageTheme(currentThemeName)
  render()
  updateHash(editor.value, currentThemeName)
})

shareBtn.addEventListener('click', () => {
  updateHash(editor.value, currentThemeName)
  navigator.clipboard.writeText(window.location.href).then(() => {
    shareBtn.textContent = 'Copied!'
    shareBtn.classList.add('copied')
    setTimeout(() => {
      shareBtn.textContent = 'Copy Share Link'
      shareBtn.classList.remove('copied')
    }, 2000)
  })
})

// Handle browser back/forward
window.addEventListener('hashchange', () => {
  const state = loadFromHash()
  if (state.error) {
    editor.value = ''
    preview.replaceChildren()
    errorEl.textContent = state.error
    errorEl.hidden = false
  } else if (state.code) {
    editor.value = state.code
    errorEl.hidden = true
    if (state.theme && THEMES[state.theme]) {
      currentThemeName = state.theme
      themeSelect.value = currentThemeName
    }
    applyPageTheme(currentThemeName)
    render()
  }
})

// --- Resize / Collapse ---

const editorPane = document.getElementById('editor-pane')
const resizeHandle = document.getElementById('resize-handle')
const collapseBtn = document.getElementById('collapse-btn')
let isCollapsed = false

const mobileToggle = document.getElementById('mobile-toggle')

function setCollapsed(collapsed) {
  isCollapsed = collapsed
  editorPane.classList.toggle('collapsed', isCollapsed)
  collapseBtn.textContent = isCollapsed ? '\u203A' : '\u2039'
  mobileToggle.classList.toggle('active', !isCollapsed)
  mobileToggle.textContent = isCollapsed ? 'Code' : 'Diagram'
}

collapseBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  setCollapsed(!isCollapsed)
})

mobileToggle.addEventListener('click', () => {
  setCollapsed(!isCollapsed)
})

resizeHandle.addEventListener('mousedown', (e) => {
  if (isCollapsed) return
  e.preventDefault()
  const startX = e.clientX
  const startWidth = editorPane.offsetWidth
  const mainWidth = editorPane.parentElement.offsetWidth

  editorPane.style.transition = 'none'

  const onMouseMove = (e) => {
    const delta = e.clientX - startX
    const newWidth = Math.max(100, Math.min(mainWidth - 100, startWidth + delta))
    editorPane.style.width = (newWidth / mainWidth * 100) + '%'
  }

  const onMouseUp = () => {
    editorPane.style.transition = ''
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
})

// --- Notes toggle ---

notesToggleBtn.addEventListener('click', () => {
  notesPanel.classList.toggle('collapsed')
})

// --- Infinite canvas: drag to pan ---

const previewPane = document.getElementById('preview-pane')
let panX = 0, panY = 0, zoom = 1
let isDragging = false
let dragStartX, dragStartY, panStartX, panStartY

const MIN_ZOOM = 0.1
const MAX_ZOOM = 5
const ZOOM_SENSITIVITY = 0.002

function applyTransform() {
  preview.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`
}

function centerDiagram() {
  const content = preview.firstElementChild
  if (!content) return
  zoom = 1
  applyTransform()
  const paneRect = previewPane.getBoundingClientRect()
  const contentRect = content.getBoundingClientRect()
  panX = (paneRect.width - contentRect.width) / 2
  panY = (paneRect.height - contentRect.height) / 2
  applyTransform()
}

previewPane.addEventListener('mousedown', (e) => {
  if (e.target.closest('a, button, select, textarea')) return
  isDragging = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  panStartX = panX
  panStartY = panY
  previewPane.style.cursor = 'grabbing'
  e.preventDefault()
})

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return
  panX = panStartX + (e.clientX - dragStartX)
  panY = panStartY + (e.clientY - dragStartY)
  applyTransform()
})

document.addEventListener('mouseup', () => {
  if (!isDragging) return
  isDragging = false
  previewPane.style.cursor = ''
})

// --- Scroll wheel zoom (anchored to cursor) ---

previewPane.addEventListener('wheel', (e) => {
  e.preventDefault()
  const rect = previewPane.getBoundingClientRect()
  const cursorX = e.clientX - rect.left
  const cursorY = e.clientY - rect.top

  const prevZoom = zoom
  zoom *= 1 - e.deltaY * ZOOM_SENSITIVITY
  zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

  const ratio = zoom / prevZoom
  panX = cursorX - ratio * (cursorX - panX)
  panY = cursorY - ratio * (cursorY - panY)
  applyTransform()
}, { passive: false })

// --- Init ---

const state = loadFromHash()
if (state.error) {
  editor.value = ''
  errorEl.textContent = state.error
  errorEl.hidden = false
} else if (state.code) {
  editor.value = state.code
  if (state.theme && THEMES[state.theme]) {
    currentThemeName = state.theme
    themeSelect.value = currentThemeName
  }
} else {
  editor.value = DEFAULT_DIAGRAM
}

applyPageTheme(currentThemeName)
render()

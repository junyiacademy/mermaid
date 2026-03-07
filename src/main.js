import { renderMermaidSVG, THEMES } from 'beautiful-mermaid'
import { deflate, inflate } from 'pako'

const editor = document.getElementById('editor')
const preview = document.getElementById('preview')
const errorEl = document.getElementById('error')
const themeSelect = document.getElementById('theme-select')
const shareBtn = document.getElementById('share-btn')

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

function decode(encoded) {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
  return new TextDecoder().decode(inflate(bytes))
}

function loadFromHash() {
  const hash = window.location.hash.slice(1)
  if (!hash) return null
  try {
    const params = new URLSearchParams(hash)
    return {
      code: params.get('c') ? decode(params.get('c')) : null,
      theme: params.get('t') || null,
    }
  } catch {
    return null
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

// --- Rendering ---
// Note: renderMermaidSVG returns structured SVG from parsed Mermaid AST,
// not raw user input. The library handles sanitization internally.

function render() {
  const code = editor.value.trim()
  if (!code) {
    preview.replaceChildren()
    errorEl.hidden = true
    return
  }

  try {
    const theme = THEMES[currentThemeName]
    const svg = renderMermaidSVG(code, { ...theme, transparent: true })
    const container = document.createElement('div')
    container.innerHTML = svg
    preview.replaceChildren(...container.childNodes)
    errorEl.hidden = true
  } catch (err) {
    preview.replaceChildren()
    errorEl.textContent = err.message
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
  if (state?.code) {
    editor.value = state.code
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

// --- Init ---

const state = loadFromHash()
if (state?.code) {
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

// src/components/a11y.jsx
// ── Accessible primitives ──────────────────────────────────────
//
// Morpheus styles components with inline style objects. That is fine for
// looks, but it produced a habit of building controls out of <div onClick>,
// which cannot be reached with a keyboard, has no role, and is invisible to a
// screen reader. These primitives keep the same inline styling while giving
// each control the element and semantics it should have had.
//
// The rule of thumb: if it responds to a click, it is a <button>, a <label>
// wrapping a real radio, or a link — never a <div>.

import { useRef, useEffect } from 'react'

/**
 * Neutralises the browser's default button chrome so a <button> can carry the
 * exact inline styles a <div> used to. Spread it first, then the style object.
 */
export const BARE_BUTTON = {
  appearance: 'none',
  background: 'none',
  border: 0,
  margin: 0,
  padding: 0,
  font: 'inherit',
  color: 'inherit',
  textAlign: 'inherit',
  cursor: 'pointer',
}

/** Ids have to survive values like "CLEARCALL-CSR" and "workforce.academy". */
const idSafe = v => String(v).replace(/[^A-Za-z0-9_-]/g, '_')

/**
 * A WAI-ARIA tab list: arrow keys move between tabs, Home/End jump to the
 * ends, and only the selected tab is in the tab order (roving tabindex), so
 * Tab steps past the whole group rather than through every tab in it.
 *
 * `items` is [{ value, label }]. `panelId` is optional: aria-controls is
 * only emitted when a panel with that id actually exists, because an
 * aria-controls pointing at a missing id is invalid ARIA. Pair it with <TabPanel> using the same
 * `idPrefix` so each panel is announced as belonging to its tab.
 */
export function Tabs({
  label, value, onChange, items,
  idPrefix, panelId, style, itemStyle, activeItemStyle,
}) {
  const listRef = useRef(null)
  // Set when the selection changed by keyboard, so focus follows it. A click
  // must not steal focus back, and the new tab only carries tabIndex 0 after
  // React commits — which is why this waits for the effect rather than a
  // requestAnimationFrame, which can run before the commit.
  const focusAfterRender = useRef(false)

  useEffect(() => {
    if (!focusAfterRender.current) return
    focusAfterRender.current = false
    listRef.current?.querySelector(`[data-tab-value="${idSafe(value)}"]`)?.focus()
  }, [value])

  function move(e) {
    const values = items.map(i => i.value)
    const i = values.indexOf(value)
    if (i < 0) return
    let next
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = values[(i + 1) % values.length]
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = values[(i - 1 + values.length) % values.length]
    else if (e.key === 'Home') next = values[0]
    else if (e.key === 'End') next = values[values.length - 1]
    else return

    e.preventDefault()
    focusAfterRender.current = true
    onChange(next)
  }

  return (
    <div role="tablist" aria-label={label} style={style} ref={listRef} onKeyDown={move}>
      {items.map(item => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${idSafe(item.value)}`}
            data-tab-value={idSafe(item.value)}
            aria-selected={selected}
            {...(panelId ? { 'aria-controls': panelId } : {})}
            tabIndex={selected ? 0 : -1}
            style={{ ...BARE_BUTTON, ...itemStyle, ...(selected ? activeItemStyle : {}) }}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The panel for whichever tab is selected. Only one panel is rendered at a
 * time here, so a single element carries the role and points back at the tab
 * that is currently selected.
 */
export function TabPanel({ idPrefix, id, value, children, style }) {
  return (
    <div
      role="tabpanel"
      id={id ?? `${idPrefix}-panel`}
      aria-labelledby={`${idPrefix}-tab-${idSafe(value)}`}
      tabIndex={-1}
      style={style}
    >
      {children}
    </div>
  )
}

/**
 * A card that behaves as one option in a radio group. It wraps a real
 * <input type="radio">, so arrow-key navigation, group semantics and the
 * "2 of 3" announcement all come from the browser rather than being
 * reimplemented with ARIA.
 */
export function RadioCard({ name, value, checked, onChange, style, children, disabled }) {
  return (
    <label className="choice-card" style={{ ...style, cursor: disabled ? 'default' : 'pointer' }}>
      <input
        type="radio"
        className="sr-only"
        name={name}
        value={String(value)}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
      />
      {children}
    </label>
  )
}

/** Visible only to screen readers. */
export function VisuallyHidden({ children }) {
  return <span className="sr-only">{children}</span>
}

/**
 * First thing in the tab order: lets a keyboard user jump past the sidebar
 * instead of tabbing through every nav item on every page.
 */
export function SkipLink({ target = '#main-content' }) {
  return <a href={target} className="skip-link">Skip to main content</a>
}

/**
 * Announces asynchronous changes — "Scoring your call…", an error, a result —
 * that a sighted user sees appear but a screen reader user would otherwise
 * never be told about.
 */
export function LiveRegion({ children, assertive = false }) {
  return (
    <div
      className="sr-only"
      role="status"
      aria-live={assertive ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {children}
    </div>
  )
}

// src/hooks/useEngagementTimer.js
// ── Nguzo OS — time-in-module capture ──────────────────────────
//
// Mount this on a participant-facing module screen and it records how long
// the tab was actually in front of someone. Read src/lib/engagement.js first:
// what this produces is ENGAGEMENT, not attendance and not contact hours.
//
// The timer only runs while the tab is visible. Switching away closes the
// current segment and switching back opens a new one, so a browser left open
// for three days does not come back as three days of engagement. A segment
// shorter than a few seconds is dropped as navigation noise.
//
// Everything is fire-and-forget. If the insert fails nothing on screen
// changes, nothing is retried, and nothing is queued.

import { useEffect, useRef } from 'react'
import { recordModuleTime } from '../lib/engagement.js'

export function useEngagementTimer({ participantId, moduleKey, lessonId = null, enabled = true }) {
  // Kept in a ref so changing lessonId mid-segment closes the old segment
  // against the old lesson rather than mislabelling it.
  const startedAt = useRef(null)

  useEffect(() => {
    if (!enabled || !participantId || !moduleKey) return

    const open = () => { if (!startedAt.current) startedAt.current = new Date() }
    const close = () => {
      const start = startedAt.current
      startedAt.current = null
      if (start) recordModuleTime({ participantId, moduleKey, lessonId, startedAt: start })
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') close()
      else open()
    }

    if (document.visibilityState !== 'hidden') open()
    document.addEventListener('visibilitychange', onVisibility)
    // pagehide covers the mobile-Safari case where the tab is frozen without
    // ever firing visibilitychange or unload.
    window.addEventListener('pagehide', close)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', close)
      close()
    }
  }, [participantId, moduleKey, lessonId, enabled])
}

export default useEngagementTimer

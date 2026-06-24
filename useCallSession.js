// src/hooks/useCallSession.js
// ── Morpheus CRM — Call session hook ───────────────────────────
// Manages the full lifecycle of a single AI mock call:
//   idle → generating → ready → active → scoring → complete
// On completion, saves transcript + scores to Supabase automatically.

import { useState, useRef, useCallback } from 'react'
import { generateScenario, getCallerReply, scoreCall } from '../lib/ai.js'
import { createCallSession, saveCompletedCall } from '../lib/db.js'

export const CALL_STATES = {
  IDLE:       'idle',
  GENERATING: 'generating',
  READY:      'ready',
  ACTIVE:     'active',
  SCORING:    'scoring',
  COMPLETE:   'complete',
  ERROR:      'error',
}

/**
 * @param {object} config
 * @param {string} config.participantId   participants.id
 * @param {string|null} config.cohortId   cohorts.id (optional)
 * @param {string|null} config.scoredBy   staff_profiles.id (null = self-serve)
 */
export function useCallSession({ participantId, cohortId = null, scoredBy = null }) {
  const [state, setState]         = useState(CALL_STATES.IDLE)
  const [scenario, setScenario]   = useState(null)
  const [messages, setMessages]   = useState([])       // { id, role, name, text, ts }
  const [scores, setScores]       = useState(null)
  const [certified, setCertified] = useState(false)
  const [error, setError]         = useState(null)
  const [sessionId, setSessionId] = useState(null)

  // Internal AI history format [{role:'user'|'assistant', content}]
  const aiHistory = useRef([])

  // ── Generate scenario ────────────────────────────────────────
  const generate = useCallback(async (scenarioType, difficulty) => {
    setState(CALL_STATES.GENERATING)
    setError(null)
    setMessages([])
    setScores(null)
    setCertified(false)
    aiHistory.current = []
    try {
      const sc = await generateScenario(scenarioType, difficulty)
      setScenario(sc)
      setState(CALL_STATES.READY)
    } catch (e) {
      setError('Failed to generate scenario. Check your connection and try again.')
      setState(CALL_STATES.ERROR)
    }
  }, [])

  // ── Start call ───────────────────────────────────────────────
  const startCall = useCallback(async () => {
    if (!scenario || !participantId) return
    try {
      // Create DB record immediately so session is tracked
      const sid = await createCallSession({
        participantId,
        cohortId,
        scoredBy,
        scenarioType:  scenario.scenarioType ?? 'Unknown',
        difficulty:    scenario.difficulty   ?? 'Unknown',
        scenarioBrief: scenario.brief,
      })
      setSessionId(sid)

      // Open with caller's first line
      const openingMsg = {
        id: Date.now(), role: 'caller',
        name: scenario.caller_name,
        text: scenario.opening_line,
        ts: new Date().toISOString(),
      }
      setMessages([openingMsg])
      aiHistory.current = [{ role: 'assistant', content: scenario.opening_line }]
      setState(CALL_STATES.ACTIVE)
    } catch (e) {
      setError('Failed to start session. Please try again.')
      setState(CALL_STATES.ERROR)
    }
  }, [scenario, participantId, cohortId, scoredBy])

  // ── Send CSR response ────────────────────────────────────────
  const sendResponse = useCallback(async (text) => {
    if (!text.trim() || state !== CALL_STATES.ACTIVE) return

    const repMsg = {
      id: Date.now(), role: 'rep',
      name: 'You (CSR)', text,
      ts: new Date().toISOString(),
    }
    setMessages(prev => [...prev, repMsg])
    aiHistory.current.push({ role: 'user', content: text })

    // Typing indicator
    const typingId = Date.now() + 1
    setMessages(prev => [...prev, { id: typingId, role: 'typing', name: scenario.caller_name, text: '' }])

    try {
      const reply = await getCallerReply(scenario, aiHistory.current)
      aiHistory.current.push({ role: 'assistant', content: reply })
      setMessages(prev => prev
        .filter(m => m.id !== typingId)
        .concat({ id: Date.now(), role: 'caller', name: scenario.caller_name, text: reply, ts: new Date().toISOString() })
      )
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== typingId))
      setError('Connection error — your progress is saved. Try sending again.')
    }
  }, [state, scenario])

  // ── End call + score + save ──────────────────────────────────
  const endCall = useCallback(async () => {
    if (state !== CALL_STATES.ACTIVE) return
    setState(CALL_STATES.SCORING)

    // Build transcript string for AI scoring
    const transcriptText = aiHistory.current
      .map((m, i) => `${i % 2 === 0 ? 'Caller' : 'CSR'}: ${m.content}`)
      .join('\n')

    // Build transcript array for DB storage
    const transcriptArray = messages.map(m => ({
      role: m.role, name: m.name, content: m.text, ts: m.ts,
    }))

    try {
      const aiScores = await scoreCall(transcriptText)
      setScores(aiScores)

      // Save everything to Morpheus DB
      const result = await saveCompletedCall({
        sessionId,
        participantId,
        transcriptArray,
        scores: aiScores,
        issuedBy: scoredBy,
      })
      setCertified(result.certified)
      setState(CALL_STATES.COMPLETE)
    } catch (e) {
      setError('Scoring failed. Your call transcript was saved. Please contact your trainer.')
      setState(CALL_STATES.ERROR)
    }
  }, [state, messages, sessionId, participantId, scoredBy])

  // ── Reset ────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setState(CALL_STATES.IDLE)
    setScenario(null)
    setMessages([])
    setScores(null)
    setCertified(false)
    setError(null)
    setSessionId(null)
    aiHistory.current = []
  }, [])

  return {
    state, scenario, messages, scores, certified,
    error, sessionId,
    generate, startCall, sendResponse, endCall, reset,
    isIdle:       state === CALL_STATES.IDLE,
    isGenerating: state === CALL_STATES.GENERATING,
    isReady:      state === CALL_STATES.READY,
    isActive:     state === CALL_STATES.ACTIVE,
    isScoring:    state === CALL_STATES.SCORING,
    isComplete:   state === CALL_STATES.COMPLETE,
    isError:      state === CALL_STATES.ERROR,
  }
}

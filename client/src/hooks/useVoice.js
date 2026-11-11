/**
 * Two-way browser-native Voice Mode hook using the Web Speech API
 * (`SpeechRecognition` / `webkitSpeechRecognition`) and `window.speechSynthesis`.
 *
 * Coordinated call-center state machine:
 *   off -> requesting_permission -> paused | processing -> speaking -> (350ms cooldown) -> listening
 *
 * Key safeguards:
 * - Synchronous refs (`voiceModeRef`, `voiceStateRef`, `isSpeakingRef`) mirror React state so
 *   asynchronous Web Speech callbacks always read current state and never trigger audio feedback loops.
 * - `SpeechRecognition` is always aborted BEFORE TTS playback begins and only restarts after a 350ms
 *   post-speech echo cooldown once all chunks finish.
 * - `activeUtteranceRef` retains the active `SpeechSynthesisUtterance` to prevent Chrome GC from
 *   dropping `onend` mid-utterance, backed by a timeout watchdog and 170-char sentence chunking.
 */
import { useState, useCallback, useRef, useEffect } from 'react';

function getRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function hasSpeechSynthesisSupport() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.speechSynthesis) &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

/**
 * Convert raw chat markdown/bullets into natural, concise receptionist speech.
 * Condenses long multi-slot bullet lists (visible on screen) into conversational summaries,
 * spells DSQ-XXXXXX booking references clearly, and removes markdown/emojis.
 */
export function cleanTextForSpeech(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';

  let prepared = rawText;

  // Condense long bulleted slot lists (4+ times) so TTS sounds crisp instead of reading 10 slots aloud
  const slotBlockMatch = prepared.match(
    /(?:^|\n)((?:\s*[•*-]\s*\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:\n|$)){4,})(?:\.\.\.and\s+\d+\s+more\s+slots?\s+available\.?)?/i
  );
  if (slotBlockMatch) {
    prepared = prepared.replace(
      slotBlockMatch[0],
      '\nThe open time slots are displayed on your screen. '
    );
  }

  let cleaned = prepared
    // Spell out DSQ-XXXXXX booking references clearly
    .replace(/\bDSQ-([A-Z0-9]{4,10})\b/gi, (_, code) => `D S Q dash ${code.split('').join(' ')}`)
    // Convert bare ISO YYYY-MM-DD dates into readable spoken dates
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, m, d) => {
      const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12, 0, 0));
      if (Number.isNaN(dt.getTime())) return `${y}-${m}-${d}`;
      return dt.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      });
    })
    // Remove markdown bold/code formatting
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    // Turn line-start bullets into smooth sentence breaks
    .replace(/\n\s*[•*-]\s*/g, '. ')
    // Collapse blank lines into pauses
    .replace(/\n+/g, '. ')
    // Strip common UI icons/emojis that TTS reads awkwardly
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, ' ')
    // Clean extra punctuation/whitespace
    .replace(/\s*\.\s*\./g, '.')
    .replace(/:\s*\./g, ':')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Split long speech text into <= maxLen chunks so Chrome/Edge SpeechSynthesis never stalls mid-utterance.
 */
function splitSpeechChunks(text, maxLen = 170) {
  if (!text) return [];
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks = [];

  for (const sentence of sentences) {
    if (sentence.length <= maxLen) {
      if (chunks.length > 0 && chunks[chunks.length - 1].length + 1 + sentence.length <= maxLen) {
        chunks[chunks.length - 1] += ` ${sentence}`;
      } else {
        chunks.push(sentence);
      }
      continue;
    }

    // Split oversized sentences on commas or word boundaries
    const clauses = sentence.split(/(?<=,)\s+/).filter(Boolean);
    let current = '';
    for (const clause of clauses) {
      if (clause.length > maxLen) {
        if (current) {
          chunks.push(current);
          current = '';
        }
        const words = clause.split(/\s+/);
        let wordChunk = '';
        for (const w of words) {
          if (wordChunk && wordChunk.length + 1 + w.length > maxLen) {
            chunks.push(wordChunk);
            wordChunk = w;
          } else {
            wordChunk = wordChunk ? `${wordChunk} ${w}` : w;
          }
        }
        if (wordChunk) chunks.push(wordChunk);
      } else if (current && current.length + 1 + clause.length > maxLen) {
        chunks.push(current);
        current = clause;
      } else {
        current = current ? `${current} ${clause}` : clause;
      }
    }
    if (current) chunks.push(current);
  }

  return chunks;
}

function pickNaturalEnglishVoice(voices) {
  if (!Array.isArray(voices) || voices.length === 0) return null;
  const englishVoices = voices.filter((v) => v?.lang && v.lang.toLowerCase().startsWith('en'));
  if (englishVoices.length === 0) return null;

  let best = englishVoices[0];
  let bestScore = -999;

  for (const voice of englishVoices) {
    const name = (voice.name || '').toLowerCase();
    const lang = (voice.lang || '').toLowerCase();
    let score = 0;

    if (/natural|neural|online/i.test(name)) score += 50;
    if (/google/i.test(name)) score += 35;
    if (/microsoft/i.test(name)) score += 20;
    if (/en[-_]in/.test(lang)) score += 15;
    else if (/en[-_](gb|us)/.test(lang)) score += 10;
    if (/neerja|prabhat|aria|jenny|sonia|libby|samantha|daniel|heera|ravi/.test(name)) score += 8;
    if (/espeak|compact/.test(name)) score -= 25;
    if (voice.localService === false) score += 4;

    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }

  return best;
}

function mapMicErrorMessage(err) {
  const name = err?.name || '';
  const msg = String(err?.message || '').toLowerCase();

  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    msg.includes('permission') ||
    msg.includes('denied')
  ) {
    return 'Microphone access was denied. Click the lock/mic icon in your Chrome or Edge address bar to allow Microphone, then tap Retry Mic — or continue typing below.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was detected on this device. Connect or select an input device in your system Sound settings, then tap Retry Mic — or use text chat.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Microphone is currently busy or unavailable because another application is using it. Close other audio apps and tap Retry Mic, or use text chat.';
  }
  if (name === 'SecurityError' || (typeof window !== 'undefined' && !window.isSecureContext)) {
    return 'Microphone access requires a secure context (HTTPS or localhost). Open the app on localhost or HTTPS, or continue using text chat.';
  }
  return 'Unable to access microphone. Check your Chrome/Edge microphone permissions and tap Retry Mic, or continue using text chat.';
}

export default function useVoice({ onSpeechResult, isBusy = false } = {}) {
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState('off'); // 'off' | 'requesting_permission' | 'listening' | 'processing' | 'speaking' | 'paused'
  const [interimTranscript, setInterimTranscript] = useState('');
  const [transcript, setTranscript] = useState('');
  const [voiceError, setVoiceError] = useState(null);
  const [voiceNotice, setVoiceNotice] = useState(null);
  const [availableVoices, setAvailableVoices] = useState([]);

  const voiceModeRef = useRef(false);
  const voiceStateRef = useRef('off');
  const isBusyRef = useRef(isBusy);
  const isSpeakingRef = useRef(false);
  const onSpeechResultRef = useRef(onSpeechResult);

  const recognitionRef = useRef(null);
  const intentionalAbortRef = useRef(false);
  const hasSubmittedTurnRef = useRef(false);
  const consecutiveNoSpeechRef = useRef(0);

  const speechSessionRef = useRef(0);
  const listenSessionRef = useRef(0);
  const resumeTimerRef = useRef(null);
  const watchdogTimerRef = useRef(null);
  const activeUtteranceRef = useRef(null);

  useEffect(() => {
    onSpeechResultRef.current = onSpeechResult;
  }, [onSpeechResult]);

  useEffect(() => {
    isBusyRef.current = isBusy;
  }, [isBusy]);

  const setVoiceStateSynced = useCallback((nextState) => {
    voiceStateRef.current = nextState;
    setVoiceState(nextState);
  }, []);

  const isRecognitionSupported = Boolean(getRecognitionCtor());
  const isSynthesisSupported = hasSpeechSynthesisSupport();
  const isSupported = isRecognitionSupported && isSynthesisSupported;

  const unsupportedReason = !isRecognitionSupported && !isSynthesisSupported
    ? 'Voice recognition and speech output are not supported in this browser. Please use Google Chrome or Microsoft Edge for two-way voice conversation, or continue using text chat.'
    : !isRecognitionSupported
    ? 'Speech recognition (Web Speech API) is not supported in this browser. Please use Google Chrome or Microsoft Edge for two-way voice conversation; text chat works normally.'
    : !isSynthesisSupported
    ? 'Text-to-speech playback is not supported in this browser. Please use Google Chrome or Microsoft Edge for two-way voice conversation; text chat works normally.'
    : null;

  // Load voices (handles async Chrome voiceschanged loading)
  useEffect(() => {
    if (!isSynthesisSupported) return;

    const loadVoices = () => {
      try {
        const list = window.speechSynthesis.getVoices() || [];
        if (list.length > 0) {
          setAvailableVoices(list);
        }
      } catch {
        // Ignore browser voice enumeration errors
      }
    };

    loadVoices();
    const synth = window.speechSynthesis;
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', loadVoices);
      return () => synth.removeEventListener('voiceschanged', loadVoices);
    }
    synth.onvoiceschanged = loadVoices;
    return () => {
      if (synth.onvoiceschanged === loadVoices) synth.onvoiceschanged = null;
    };
  }, [isSynthesisSupported]);

  const clearTimers = useCallback(() => {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
  }, []);

  const cleanupRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    recognitionRef.current = null;
    intentionalAbortRef.current = true;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    try {
      rec.abort();
    } catch {
      // Ignore abort errors on already-stopped instance
    }
  }, []);

  const cancelSpeechOutput = useCallback(() => {
    speechSessionRef.current += 1;
    isSpeakingRef.current = false;
    activeUtteranceRef.current = null;
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    if (hasSpeechSynthesisSupport()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore cancel errors
      }
    }
  }, []);

  const disableVoiceMode = useCallback(() => {
    voiceModeRef.current = false;
    listenSessionRef.current += 1;
    clearTimers();
    cancelSpeechOutput();
    cleanupRecognition();
    setVoiceMode(false);
    setInterimTranscript('');
    setVoiceNotice(null);
    setVoiceStateSynced('off');
  }, [clearTimers, cancelSpeechOutput, cleanupRecognition, setVoiceStateSynced]);

  const startListening = useCallback(() => {
    if (!voiceModeRef.current) return false;
    if (isSpeakingRef.current || isBusyRef.current) return false;

    const SpeechRecognition = getRecognitionCtor();
    if (!SpeechRecognition || !hasSpeechSynthesisSupport()) {
      setVoiceError(unsupportedReason);
      disableVoiceMode();
      return false;
    }

    // Never listen while speechSynthesis is actively speaking
    try {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // ignore
    }

    clearTimers();
    cleanupRecognition();

    const currentListenSession = ++listenSessionRef.current;
    hasSubmittedTurnRef.current = false;
    intentionalAbortRef.current = false;
    setInterimTranscript('');
    setVoiceNotice(null);

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      if (currentListenSession !== listenSessionRef.current || !voiceModeRef.current) return;

      let interim = '';
      let finalChunk = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const piece = res?.[0]?.transcript || '';
        if (res?.isFinal) {
          finalChunk += `${piece} `;
        } else {
          interim += `${piece} `;
        }
      }

      if (interim.trim()) {
        setInterimTranscript(interim.trim());
      }

      const finalText = finalChunk.trim();
      if (finalText && !hasSubmittedTurnRef.current) {
        hasSubmittedTurnRef.current = true;
        consecutiveNoSpeechRef.current = 0;
        setTranscript(finalText);
        setInterimTranscript('');
        cleanupRecognition();
        setVoiceStateSynced('processing');
        onSpeechResultRef.current?.(finalText);
      }
    };

    recognition.onerror = (event) => {
      if (currentListenSession !== listenSessionRef.current) return;

      const errCode = event?.error || 'unknown';
      if (errCode === 'aborted' && intentionalAbortRef.current) {
        return;
      }

      if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
        setVoiceError(
          'Microphone permission was denied or blocked. Click the lock/mic icon in your browser address bar to allow Microphone, then tap Retry Mic — or continue typing below.'
        );
        disableVoiceMode();
        return;
      }

      if (errCode === 'audio-capture') {
        cleanupRecognition();
        setVoiceError(
          'No audio could be captured from your microphone. Check your microphone device and tap Retry Mic, or type below.'
        );
        setVoiceStateSynced('error');
        return;
      }

      if (errCode === 'network') {
        cleanupRecognition();
        setVoiceError(
          'Browser speech recognition could not connect to the speech service. Tap Retry Mic or continue typing below.'
        );
        setVoiceStateSynced('error');
        return;
      }

      if (errCode === 'no-speech') {
        consecutiveNoSpeechRef.current += 1;
        if (consecutiveNoSpeechRef.current >= 2) {
          cleanupRecognition();
          setVoiceNotice('Listening paused after silence. Tap "Resume Mic" when you are ready to speak.');
          setVoiceStateSynced('paused');
        } else {
          setVoiceNotice('I did not catch that — listening again…');
        }
        return;
      }

      if (voiceModeRef.current) {
        cleanupRecognition();
        setVoiceError(`Voice recognition hit an issue (${errCode}). Tap "Retry Mic" or type below.`);
        setVoiceStateSynced('error');
      }
    };

    recognition.onend = () => {
      if (currentListenSession !== listenSessionRef.current) return;
      recognitionRef.current = null;
      setInterimTranscript('');

      if (!voiceModeRef.current) {
        setVoiceStateSynced('off');
        return;
      }

      // Do not restart while submitting/processing, speaking, errored, or paused on silence/typing
      if (
        hasSubmittedTurnRef.current ||
        isSpeakingRef.current ||
        isBusyRef.current ||
        voiceStateRef.current === 'processing' ||
        voiceStateRef.current === 'speaking' ||
        voiceStateRef.current === 'paused' ||
        voiceStateRef.current === 'error'
      ) {
        return;
      }

      // Brief pause before reopening mic if recognition ended naturally between turns
      if (consecutiveNoSpeechRef.current >= 2) {
        setVoiceNotice('Listening paused after silence. Tap "Resume Mic" when ready.');
        setVoiceStateSynced('paused');
        return;
      }

      resumeTimerRef.current = setTimeout(() => {
        if (
          voiceModeRef.current &&
          !isSpeakingRef.current &&
          !isBusyRef.current &&
          voiceStateRef.current === 'listening'
        ) {
          startListening();
        }
      }, 250);
    };

    recognitionRef.current = recognition;
    setVoiceStateSynced('listening');

    try {
      recognition.start();
      return true;
    } catch (err) {
      recognitionRef.current = null;
      const msg = String(err?.message || err);
      if (/not-allowed|permission|denied/i.test(msg)) {
        setVoiceError(
          'Microphone access was denied. Click the lock/mic icon in your Chrome or Edge address bar to allow Microphone, then tap Retry Mic — or continue typing below.'
        );
        disableVoiceMode();
      } else {
        setVoiceError(`Could not start speech recognition: ${msg}`);
        setVoiceStateSynced('error');
      }
      return false;
    }
  }, [
    unsupportedReason,
    clearTimers,
    cleanupRecognition,
    disableVoiceMode,
    setVoiceStateSynced,
  ]);

  const pauseListening = useCallback(() => {
    if (!voiceModeRef.current) return;
    listenSessionRef.current += 1;
    clearTimers();
    cleanupRecognition();
    setInterimTranscript('');
    setVoiceNotice('Microphone paused. Tap "Resume Mic" to speak or type your reply below.');
    setVoiceStateSynced('paused');
  }, [clearTimers, cleanupRecognition, setVoiceStateSynced]);

  const pauseForProcessing = useCallback(() => {
    if (!voiceModeRef.current) return;
    listenSessionRef.current += 1;
    clearTimers();
    cancelSpeechOutput();
    cleanupRecognition();
    setInterimTranscript('');
    setVoiceNotice(null);
    setVoiceStateSynced('processing');
  }, [clearTimers, cancelSpeechOutput, cleanupRecognition, setVoiceStateSynced]);

  const resumeListening = useCallback(() => {
    consecutiveNoSpeechRef.current = 0;
    setVoiceError(null);
    setVoiceNotice(null);
    return startListening();
  }, [startListening]);

  /**
   * Release raw MediaStream tracks immediately after permission verification because
   * `SpeechRecognition` needs exclusive access to the audio capture pipeline on some platforms.
   */
  const enableVoiceMode = useCallback(
    async ({ autoListen = true } = {}) => {
      if (!isSupported) {
        setVoiceError(unsupportedReason);
        setVoiceMode(false);
        voiceModeRef.current = false;
        setVoiceStateSynced('off');
        return false;
      }

      setVoiceError(null);
      setVoiceNotice(null);
      consecutiveNoSpeechRef.current = 0;
      setVoiceStateSynced('requesting_permission');

      if (
        typeof window !== 'undefined' &&
        !window.isSecureContext &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1'
      ) {
        setVoiceError('Microphone access requires HTTPS or localhost.');
        setVoiceStateSynced('off');
        return false;
      }

      let releasedMediaTrack = false;
      if (navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Release MediaStream immediately so SpeechRecognition has exclusive access
          stream.getTracks().forEach((track) => track.stop());
          releasedMediaTrack = true;
        } catch (err) {
          setVoiceError(mapMicErrorMessage(err));
          voiceModeRef.current = false;
          setVoiceMode(false);
          setVoiceStateSynced('off');
          return false;
        }
      }

      voiceModeRef.current = true;
      setVoiceMode(true);

      if (autoListen && !isBusyRef.current && !isSpeakingRef.current) {
        if (releasedMediaTrack) {
          // Brief OS audio-driver settle delay so real Chrome/Windows hardware mics don't collide on handoff
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        if (voiceModeRef.current && !isBusyRef.current && !isSpeakingRef.current) {
          startListening();
        }
      } else {
        setVoiceStateSynced(isBusyRef.current ? 'processing' : 'paused');
      }

      return true;
    },
    [isSupported, unsupportedReason, setVoiceStateSynced, startListening]
  );

  /**
   * Play assistant replies aloud via `speechSynthesis` in chunked natural English segments.
   * Stops active speech recognition before starting audio output, then optionally resumes listening.
   */
  const speak = useCallback(
    (rawText, { autoResume = true } = {}) => {
      if (!hasSpeechSynthesisSupport()) {
        if (autoResume && voiceModeRef.current) {
          setVoiceError(
            'Browser speech synthesis is unavailable in this browser; please read the reply in chat.'
          );
          startListening();
        }
        return;
      }

      // Strictly stop recognition BEFORE starting bot audio to prevent echo/feedback loops
      listenSessionRef.current += 1;
      clearTimers();
      cleanupRecognition();
      cancelSpeechOutput();

      const spokenText = cleanTextForSpeech(rawText);
      if (!spokenText) {
        if (autoResume && voiceModeRef.current && !isBusyRef.current) {
          startListening();
        }
        return;
      }

      const chunks = splitSpeechChunks(spokenText);
      if (chunks.length === 0) return;

      const sessionToken = ++speechSessionRef.current;
      isSpeakingRef.current = true;
      setVoiceStateSynced('speaking');
      setVoiceNotice(null);

      const voices =
        availableVoices.length > 0 ? availableVoices : window.speechSynthesis.getVoices() || [];
      const chosenVoice = pickNaturalEnglishVoice(voices);

      const finishSpeech = () => {
        if (sessionToken !== speechSessionRef.current) return;
        isSpeakingRef.current = false;
        activeUtteranceRef.current = null;
        if (watchdogTimerRef.current) {
          clearTimeout(watchdogTimerRef.current);
          watchdogTimerRef.current = null;
        }

        if (!voiceModeRef.current) {
          setVoiceStateSynced('off');
          return;
        }

        if (autoResume && !isBusyRef.current) {
          // 350ms post-speech cooldown avoids capturing lingering speaker echo
          resumeTimerRef.current = setTimeout(() => {
            if (voiceModeRef.current && !isSpeakingRef.current && !isBusyRef.current) {
              startListening();
            }
          }, 350);
        } else {
          setVoiceStateSynced('paused');
        }
      };

      const speakChunkAt = (index) => {
        if (sessionToken !== speechSessionRef.current || !voiceModeRef.current) {
          return;
        }
        if (index >= chunks.length) {
          finishSpeech();
          return;
        }

        const chunk = chunks[index];
        const utterance = new window.SpeechSynthesisUtterance(chunk);
        activeUtteranceRef.current = utterance;

        if (chosenVoice) {
          utterance.voice = chosenVoice;
          utterance.lang = chosenVoice.lang || 'en-IN';
        } else {
          utterance.lang = 'en-IN';
        }
        utterance.rate = 0.98;
        utterance.pitch = 1.0;
        utterance.volume = 0.95;

        let settled = false;
        const advance = (hadError = false, errName = null) => {
          if (settled) return;
          settled = true;
          if (watchdogTimerRef.current) {
            clearTimeout(watchdogTimerRef.current);
            watchdogTimerRef.current = null;
          }
          if (sessionToken !== speechSessionRef.current || !voiceModeRef.current) return;

          if (hadError && errName && errName !== 'interrupted' && errName !== 'canceled') {
            setVoiceError(`Audio playback issue (${errName}). You can read the response in chat.`);
            finishSpeech();
            return;
          }
          speakChunkAt(index + 1);
        };

        utterance.onend = () => advance(false);
        utterance.onerror = (event) => advance(true, event?.error);

        const watchdogMs = Math.max(12000, chunk.length * 160);
        watchdogTimerRef.current = setTimeout(() => {
          try {
            window.speechSynthesis.cancel();
          } catch {
            // ignore
          }
          advance(false);
        }, watchdogMs);

        try {
          if (window.speechSynthesis.paused && typeof window.speechSynthesis.resume === 'function') {
            window.speechSynthesis.resume();
          }
          window.speechSynthesis.speak(utterance);
        } catch (err) {
          advance(true, err?.message || 'speak-failed');
        }
      };

      speakChunkAt(0);
    },
    [
      availableVoices,
      cancelSpeechOutput,
      cleanupRecognition,
      clearTimers,
      setVoiceStateSynced,
      startListening,
    ]
  );

  const stopSpeaking = useCallback(
    ({ resumeMic = true } = {}) => {
      cancelSpeechOutput();
      clearTimers();
      if (!voiceModeRef.current) {
        setVoiceStateSynced('off');
        return;
      }
      if (resumeMic && !isBusyRef.current) {
        resumeTimerRef.current = setTimeout(() => {
          if (voiceModeRef.current && !isBusyRef.current && !isSpeakingRef.current) {
            startListening();
          }
        }, 150);
      } else {
        setVoiceStateSynced('paused');
      }
    },
    [cancelSpeechOutput, clearTimers, setVoiceStateSynced, startListening]
  );

  // Sync processing indicator when request finishes without speech or is in flight
  useEffect(() => {
    if (isBusy && voiceModeRef.current && !isSpeakingRef.current) {
      cleanupRecognition();
      setVoiceStateSynced('processing');
    }
  }, [isBusy, cleanupRecognition, setVoiceStateSynced]);

  // Cleanup everything on unmount
  useEffect(() => {
    return () => {
      voiceModeRef.current = false;
      clearTimers();
      cancelSpeechOutput();
      cleanupRecognition();
    };
  }, [clearTimers, cancelSpeechOutput, cleanupRecognition]);

  const selectedVoice = pickNaturalEnglishVoice(availableVoices);

  return {
    voiceMode,
    voiceState,
    isListening: voiceState === 'listening',
    isSpeaking: voiceState === 'speaking',
    interimTranscript,
    transcript,
    voiceError,
    voiceNotice,
    isSupported,
    isRecognitionSupported,
    isSynthesisSupported,
    unsupportedReason,
    selectedVoiceName: selectedVoice?.name || null,
    clearVoiceError: () => setVoiceError(null),
    enableVoiceMode,
    disableVoiceMode,
    startListening,
    resumeListening,
    pauseListening,
    pauseForProcessing,
    speak,
    stopSpeaking,
  };
}

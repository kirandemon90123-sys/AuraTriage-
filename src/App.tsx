/**
 * AuraTriage (SirenSight)
 * AI-Powered Emergency Co-Pilot & Real-Time Hospital Pre-Arrival Dispatcher
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Brain,
  Camera,
  CheckCircle2,
  Clock,
  Flame,
  HeartPulse,
  MapPin,
  Mic,
  Radio,
  RefreshCw,
  ShieldAlert,
  Volume2,
  VolumeX,
  Wind,
  Droplet,
  ExternalLink,
  Download,
  Monitor,
  Smartphone,
  Layers,
} from 'lucide-react';
import {
  calculateFacialAsymmetry,
  classifyAsymmetry,
  classifyAcousticAirway,
  getTriageProtocol,
  formatETA,
  type TriageProtocol,
} from './utils/triage';

export default function App() {
  // Navigation View: 'split' (Dual Stage Demo), 'patient' (Mobile Co-Pilot), 'dashboard' (Hospital ED)
  const [viewMode, setViewMode] = useState<'split' | 'patient' | 'dashboard'>('split');

  // WebSocket connections & status
  const [patientWsConnected, setPatientWsConnected] = useState(false);
  const [hospitalWsConnected, setHospitalWsConnected] = useState(false);
  const [lastAck, setLastAck] = useState<string | null>(null);

  // Patient Co-Pilot State
  const [asymmetryIndex, setAsymmetryIndex] = useState(0.08);
  const [leftDist, setLeftDist] = useState(82);
  const [rightDist, setRightDist] = useState(76);
  const [autoTriggerEnabled, setAutoTriggerEnabled] = useState(true);
  const [audioDecibels, setAudioDecibels] = useState(34);
  const [audioClass, setAudioClass] = useState<'Normal Breathing' | 'Tachypnea / Hyperventilation' | 'Inspiratory Stridor / Wheezing'>('Normal Breathing');
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [snapshotDataUrl, setSnapshotDataUrl] = useState<string>('');
  const [userLocation] = useState({ lat: 37.7749, lon: -122.4194 });

  // Active Emergency State
  const [activeDossier, setActiveDossier] = useState<any | null>(null);
  const [remainingEta, setRemainingEta] = useState<number>(300);
  const [traumaBayReady, setTraumaBayReady] = useState(false);
  const [traumaBayBanner, setTraumaBayBanner] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  // Audio / Speech / Video Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const alarmIntervalRef = useRef<any>(null);
  const etaTimerRef = useRef<any>(null);
  const highAsymStartRef = useRef<number | null>(null);

  // WebSockets Refs
  const patientWsRef = useRef<WebSocket | null>(null);
  const hospitalWsRef = useRef<WebSocket | null>(null);

  // 1. Initialize WebSockets for Patient & Hospital Hubs
  useEffect(() => {
    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const patientUrl = `${protocol}//${loc.host}/ws/patient`;
    const hospitalUrl = `${protocol}//${loc.host}/ws/hospital`;

    // Patient WS
    const pWs = new WebSocket(patientUrl);
    patientWsRef.current = pWs;
    pWs.onopen = () => setPatientWsConnected(true);
    pWs.onclose = () => setPatientWsConnected(false);
    pWs.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'trauma_ready_confirmed') {
          setTraumaBayReady(true);
          setTraumaBayBanner(data.banner || '🏥 METRO GENERAL ED: TRAUMA TEAM PREPARED & STANDING BY');
          playTone(880, 0.2);
        } else if (data.type === 'dispatch_ack') {
          setLastAck(`Telemetry Ack: ${data.patientId}`);
        } else if (data.type === 'emergency_cleared') {
          handleResetEmergency(false);
        }
      } catch (err) {
        console.error('Patient WS parse err:', err);
      }
    };

    // Hospital WS
    const hWs = new WebSocket(hospitalUrl);
    hospitalWsRef.current = hWs;
    hWs.onopen = () => setHospitalWsConnected(true);
    hWs.onclose = () => setHospitalWsConnected(false);
    hWs.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'emergency_dossier') {
          handleIncomingHospitalDossier(data);
        } else if (data.type === 'trauma_ready_confirmed') {
          setTraumaBayReady(true);
        } else if (data.type === 'emergency_cleared') {
          handleResetEmergency(false);
        }
      } catch (err) {
        console.error('Hospital WS parse err:', err);
      }
    };

    return () => {
      pWs.close();
      hWs.close();
    };
  }, []);

  // 2. WebAudio Tone Player
  function playTone(freq: number, duration: number) {
    try {
      const actx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.frequency.setValueAtTime(freq, actx.currentTime);
      gain.gain.setValueAtTime(0.15, actx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + duration);
      osc.connect(gain);
      gain.connect(actx.destination);
      osc.start();
      osc.stop(actx.currentTime + duration);
    } catch (e) {}
  }

  // 3. Hospital Emergency Alarm Chime (Dual Tone 960Hz / 770Hz)
  function startHospitalAlarm() {
    stopHospitalAlarm();
    try {
      const actx = new (window.AudioContext || (window as any).webkitAudioContext)();
      let isHigh = true;
      alarmIntervalRef.current = setInterval(() => {
        try {
          const osc = actx.createOscillator();
          const gain = actx.createGain();
          osc.frequency.setValueAtTime(isHigh ? 960 : 770, actx.currentTime);
          gain.gain.setValueAtTime(0.12, actx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.35);
          osc.connect(gain);
          gain.connect(actx.destination);
          osc.start();
          osc.stop(actx.currentTime + 0.36);
          isHigh = !isHigh;
        } catch (e) {}
      }, 420);
    } catch (e) {}
  }

  function stopHospitalAlarm() {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
  }

  // 4. Voice Guidance Synthesis
  function speakVoiceGuidance(text: string) {
    if (voiceMuted || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  }

  // 5. Initialize Camera & Mic Stream
  async function activateSensors() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
      setCameraError(false);

      // WebAudio setup
      const actx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = actx;
      const micSource = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 256;
      micSource.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const trackAudio = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        let highSum = 0;
        const half = Math.floor(dataArray.length / 2);
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
          if (i > half) highSum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const db = Math.min(100, Math.max(20, Math.round((avg / 255) * 100)));
        setAudioDecibels(db);
        const classified = classifyAcousticAirway(db, highSum / (sum || 1));
        setAudioClass(classified.status);
        requestAnimationFrame(trackAudio);
      };
      trackAudio();
    } catch (err) {
      console.warn('Sensors failed or permissions denied, using stage simulation:', err);
      setCameraError(true);
      setCameraActive(true);
    }
  }

  // Draw face overlay canvas
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderOverlay = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      // Simulated Face wireframe or video landmark overlay
      ctx.strokeStyle = '#27272a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 65, 85, 0, 0, Math.PI * 2);
      ctx.stroke();

      const asymData = classifyAsymmetry(asymmetryIndex);
      const strokeColor = asymData.color;

      // Eye to mouth corner vectors
      // Left: 33 to 61
      // Right: 263 to 291
      const droopOffset = asymmetryIndex >= 0.35 ? asymmetryIndex * 35 : 0;
      const eyeY = cy - 25;
      const mouthY = cy + 35;

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;

      // Left vector
      ctx.beginPath();
      ctx.moveTo(cx - 32, eyeY);
      ctx.lineTo(cx - 28, mouthY + droopOffset);
      ctx.stroke();

      // Right vector
      ctx.beginPath();
      ctx.moveTo(cx + 32, eyeY);
      ctx.lineTo(cx + 28, mouthY);
      ctx.stroke();

      // Key Landmark Nodes
      [
        { x: cx - 32, y: eyeY },
        { x: cx - 28, y: mouthY + droopOffset },
        { x: cx + 32, y: eyeY },
        { x: cx + 28, y: mouthY },
      ].forEach((pt) => {
        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, asymData.isAbnormal ? 6 : 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Check Auto-trigger threshold (>= 0.42 for 1.5s)
      if (autoTriggerEnabled && asymData.isTriggerThreshold) {
        if (!highAsymStartRef.current) {
          highAsymStartRef.current = Date.now();
        } else if (Date.now() - highAsymStartRef.current > 1500 && !activeDossier) {
          triggerEmergency('STROKE', asymmetryIndex, true);
        }
      } else {
        highAsymStartRef.current = null;
      }

      animId = requestAnimationFrame(renderOverlay);
    };

    renderOverlay();
    return () => cancelAnimationFrame(animId);
  }, [asymmetryIndex, autoTriggerEnabled, activeDossier]);

  // 6. Generate Base64 snapshot
  function captureSnapshotFrame(): string {
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = 320;
    snapCanvas.height = 180;
    const sctx = snapCanvas.getContext('2d');
    if (sctx) {
      if (videoRef.current && videoRef.current.videoWidth > 0) {
        sctx.drawImage(videoRef.current, 0, 0, 320, 180);
      } else {
        sctx.fillStyle = '#09090b';
        sctx.fillRect(0, 0, 320, 180);
        sctx.fillStyle = '#ef4444';
        sctx.font = 'bold 14px monospace';
        sctx.fillText('AuraTriage Live Snapshot', 40, 90);
      }
      return snapCanvas.toDataURL('image/jpeg', 0.6);
    }
    return '';
  }

  // 7. Dispatch Emergency Trigger
  function triggerEmergency(conditionKey: string, asymOverride?: number, autoTriggered = false) {
    const pKey = conditionKey.toUpperCase();
    const proto = getTriageProtocol(pKey);
    const asymVal = asymOverride !== undefined ? asymOverride : asymmetryIndex;
    const patientId = `PAT-${Math.floor(10000 + Math.random() * 90000)}`;
    const snap = captureSnapshotFrame();
    setSnapshotDataUrl(snap);

    const dossier = {
      type: 'emergency_dossier',
      patientId,
      timestamp: new Date().toISOString(),
      condition: pKey,
      conditionName: proto.conditionName,
      esiLevel: proto.esiLevel,
      esiColor: proto.esiColor,
      asymmetry: asymVal,
      decibels: audioDecibels,
      audioClass: audioClass,
      snapshot: snap,
      lat: userLocation.lat,
      lon: userLocation.lon,
      autoTriggered,
      etaSeconds: proto.defaultEtaSeconds,
      bystanderSteps: proto.bystanderSteps,
      voiceScript: proto.voiceScript,
      edChecklist: proto.edChecklist,
      status: 'DISPATCHED',
    };

    setActiveDossier(dossier);
    setRemainingEta(proto.defaultEtaSeconds);
    setTraumaBayReady(false);
    setTraumaBayBanner(null);
    setCheckedItems({});

    // Start ETA Timer
    if (etaTimerRef.current) clearInterval(etaTimerRef.current);
    etaTimerRef.current = setInterval(() => {
      setRemainingEta((prev) => {
        if (prev <= 1) {
          clearInterval(etaTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Speak voice guidance aloud
    speakVoiceGuidance(proto.voiceScript);

    // Transmit over WebSocket
    const packet = {
      ...dossier,
      type: 'telemetry',
    };

    if (patientWsRef.current && patientWsRef.current.readyState === WebSocket.OPEN) {
      patientWsRef.current.send(JSON.stringify(packet));
    } else {
      // Fallback REST
      fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packet),
      }).catch(console.warn);
    }
  }

  // 8. Hospital Incoming Dossier Handler
  function handleIncomingHospitalDossier(dossier: any) {
    setActiveDossier(dossier);
    setRemainingEta(dossier.etaSeconds || 300);
    setTraumaBayReady(false);
    setCheckedItems({});
    startHospitalAlarm();
  }

  // 9. Confirm Trauma Bay Ready
  function handleConfirmTraumaReady() {
    stopHospitalAlarm();
    setTraumaBayReady(true);
    const patientId = activeDossier?.patientId || 'CURRENT_PATIENT';

    const payload = {
      type: 'confirm_trauma_ready',
      patientId,
      bay: 'Trauma Resuscitation Bay 1',
      timestamp: new Date().toISOString(),
    };

    if (hospitalWsRef.current && hospitalWsRef.current.readyState === WebSocket.OPEN) {
      hospitalWsRef.current.send(JSON.stringify(payload));
    }
  }

  // 10. Reset Emergency Case
  function handleResetEmergency(notifyWs = true) {
    stopHospitalAlarm();
    if (etaTimerRef.current) clearInterval(etaTimerRef.current);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setActiveDossier(null);
    setTraumaBayReady(false);
    setTraumaBayBanner(null);
    setCheckedItems({});

    if (notifyWs && hospitalWsRef.current && hospitalWsRef.current.readyState === WebSocket.OPEN) {
      hospitalWsRef.current.send(JSON.stringify({ type: 'reset_emergency' }));
    }
  }

  // Asymmetry classification for UI
  const asymClassification = classifyAsymmetry(asymmetryIndex);

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans selection:bg-red-600 selection:text-white">
      {/* GLOBAL TOP NAVIGATION & MODE BAR */}
      <header className="bg-zinc-950 border-b border-zinc-800 px-4 py-2.5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Hackathon Tag */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center font-black text-white shadow-lg shadow-red-950/50">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-base tracking-wider uppercase text-white">AuraTriage</span>
                <span className="bg-red-950 text-red-400 border border-red-800 text-[10px] font-mono px-1.5 py-0.5 rounded font-bold">
                  SIRENSIGHT MVP
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 font-mono">
                AI Pre-Hospital Emergency Co-Pilot & Hospital ED Trauma Dispatcher
              </p>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 p-1 rounded-xl text-xs font-bold font-mono">
            <button
              onClick={() => setViewMode('split')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                viewMode === 'split' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Stage Split Demo</span>
            </button>
            <button
              onClick={() => setViewMode('patient')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                viewMode === 'patient' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Patient Co-Pilot</span>
            </button>
            <button
              onClick={() => setViewMode('dashboard')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                viewMode === 'dashboard' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Hospital ED Command</span>
            </button>
          </div>

          {/* Quick Launch & Status Links */}
          <div className="flex items-center space-x-3 text-xs font-mono">
            <div className="flex items-center gap-2 bg-zinc-900 px-2.5 py-1 rounded border border-zinc-800">
              <span
                className={`w-2 h-2 rounded-full ${
                  patientWsConnected && hospitalWsConnected ? 'bg-emerald-500' : 'bg-amber-400'
                } animate-pulse`}
              ></span>
              <span className="text-[11px] text-zinc-300">
                WS Dual-Hub: {patientWsConnected ? 'P✓' : 'P…'} / {hospitalWsConnected ? 'ED✓' : 'ED…'}
              </span>
            </div>
            <a
              href="/patient"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center gap-1 text-zinc-400 hover:text-zinc-100 hover:underline"
            >
              <span>/patient</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="/dashboard"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center gap-1 text-zinc-400 hover:text-zinc-100 hover:underline"
            >
              <span>/dashboard</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </header>

      {/* TOP EMERGENCY CONFIRMATION BANNER (DISPLAYS WHEN ED CONFIRMS TRAUMA BAY READY) */}
      {traumaBayBanner && (
        <div className="bg-emerald-600 text-black px-4 py-3 border-y-2 border-emerald-300 font-black text-center shadow-2xl animate-pulse">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-sm sm:text-base">
            <span className="text-xl">🏥</span>
            <span>{traumaBayBanner}</span>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {/* =========================================================================
            SPLIT VIEW: DUAL STAGE DEMO (PATIENT PHONE + HOSPITAL ED DASHBOARD)
            ========================================================================= */}
        {viewMode === 'split' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT 5 COLS: PATIENT PHONE SIMULATOR */}
            <div className="lg:col-span-5 bg-zinc-950 border-2 border-zinc-800 rounded-3xl p-4 shadow-2xl relative max-h-[88vh] overflow-y-auto flex flex-col justify-between">
              {/* Phone Speaker Notch */}
              <div className="w-32 h-4 bg-zinc-900 border border-zinc-800 rounded-full mx-auto mb-3 flex items-center justify-center">
                <div className="w-12 h-1 bg-zinc-700 rounded-full"></div>
              </div>

              {/* Patient App Header */}
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800">
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping"></div>
                  <span className="font-black text-xs uppercase tracking-wider text-white">
                    Patient Co-Pilot
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      const next = !voiceMuted;
                      setVoiceMuted(next);
                      if (next && 'speechSynthesis' in window) window.speechSynthesis.cancel();
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 border ${
                      voiceMuted
                        ? 'bg-red-950 border-red-800 text-red-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                    }`}
                  >
                    {voiceMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                    <span>{voiceMuted ? 'Muted' : 'Voice ON'}</span>
                  </button>
                </div>
              </div>

              {/* Camera & Facial Landmark Overlay */}
              <div className="space-y-3">
                <div className="relative aspect-[4/3] bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 flex items-center justify-center shadow-inner">
                  {/* Real video if camera active */}
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="absolute inset-0 w-full h-full object-cover -scale-x-100"
                  />
                  {/* Canvas Landmark Overlay */}
                  <canvas
                    ref={canvasRef}
                    width={320}
                    height={240}
                    className="absolute inset-0 w-full h-full pointer-events-none -scale-x-100 z-10"
                  />

                  {/* Fallback Camera Activation Overlay */}
                  {!cameraActive && (
                    <div className="absolute inset-0 bg-zinc-950/90 z-20 flex flex-col items-center justify-center p-4 text-center">
                      <Camera className="w-10 h-10 text-zinc-400 mb-2" />
                      <p className="text-xs font-bold text-zinc-200 mb-1">Webcam & Airway Mic</p>
                      <p className="text-[11px] text-zinc-400 mb-3 max-w-xs">
                        Enable camera for real-time landmark tracking, or use the interactive slider below.
                      </p>
                      <button
                        onClick={activateSensors}
                        className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-xs rounded-lg uppercase tracking-wider transition shadow-lg shadow-red-950"
                      >
                        Activate Sensors
                      </button>
                    </div>
                  )}

                  {/* Top HUD Asymmetry Badge */}
                  <div className="absolute top-2 left-2 z-20 bg-black/85 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-zinc-700 flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: asymClassification.color }}
                    ></div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-zinc-400 font-mono font-bold">
                        Facial Asymmetry
                      </div>
                      <div
                        className="text-xs font-black font-mono"
                        style={{ color: asymClassification.color }}
                      >
                        {asymmetryIndex.toFixed(2)}{' '}
                        <span className="text-[9px] font-normal text-zinc-400">
                          ({asymClassification.label.split(' ')[0]})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Auto-Trigger Toggle */}
                  <div className="absolute top-2 right-2 z-20 bg-black/85 backdrop-blur-md px-2 py-1 rounded-md border border-zinc-700 flex items-center gap-1.5 text-[10px] font-mono text-zinc-300">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoTriggerEnabled}
                        onChange={(e) => setAutoTriggerEnabled(e.target.checked)}
                        className="w-3.5 h-3.5 accent-red-600 rounded cursor-pointer"
                      />
                      <span>Auto &ge;0.42</span>
                    </label>
                  </div>
                </div>

                {/* Stage Interactive Asymmetry Slider for live testing */}
                <div className="bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-800">
                  <div className="flex justify-between items-center text-[11px] font-mono mb-1">
                    <span className="text-zinc-400 font-bold">Simulate Asymmetry:</span>
                    <span className="font-bold" style={{ color: asymClassification.color }}>
                      {asymmetryIndex.toFixed(2)} ({asymClassification.label})
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.60"
                    step="0.01"
                    value={asymmetryIndex}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setAsymmetryIndex(val);
                    }}
                    className="w-full accent-red-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] font-mono text-zinc-500 mt-0.5">
                    <span>0.00 (Normal)</span>
                    <span className="text-amber-400">0.35 (Threshold)</span>
                    <span className="text-red-400">0.42 (Stroke Auto-Trigger)</span>
                  </div>
                </div>

                {/* Acoustic Airway Scanner Bar */}
                <div className="bg-zinc-900/90 border border-zinc-800 p-2.5 rounded-xl flex items-center gap-3">
                  <div className="p-1.5 bg-zinc-800 rounded-lg text-amber-400">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center text-[10px] font-mono mb-1">
                      <span className="text-zinc-400 uppercase font-bold">Airway Scanner</span>
                      <span
                        className={`font-bold ${
                          audioClass.includes('Stridor')
                            ? 'text-red-400'
                            : audioClass.includes('Tachypnea')
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {audioClass} ({audioDecibels} dB)
                      </span>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden flex">
                      <div
                        className={`h-full transition-all duration-75 ${
                          audioClass.includes('Stridor')
                            ? 'bg-red-500'
                            : audioClass.includes('Tachypnea')
                            ? 'bg-amber-400'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${audioDecibels}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Fail-Safe Stage Demo Triggers */}
                <div className="bg-zinc-900/90 border border-zinc-800 p-3 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5" /> Stage Demo Triggers
                    </span>
                    <span className="text-[9px] font-mono text-zinc-500">1-Tap Stage Test</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => triggerEmergency('STROKE', 0.48)}
                      className="p-2 bg-zinc-950 hover:bg-red-950/50 hover:border-red-500 border border-zinc-800 rounded-lg text-left transition flex flex-col justify-between"
                    >
                      <Brain className="w-4 h-4 text-red-400 mb-1" />
                      <div className="font-bold text-xs text-white">Stroke</div>
                      <div className="text-[9px] text-zinc-400 font-mono">Droop &gt;0.42</div>
                    </button>

                    <button
                      onClick={() => {
                        setAudioDecibels(78);
                        setAudioClass('Inspiratory Stridor / Wheezing');
                        triggerEmergency('ANAPHYLAXIS', 0.12);
                      }}
                      className="p-2 bg-zinc-950 hover:bg-amber-950/50 hover:border-amber-500 border border-zinc-800 rounded-lg text-left transition flex flex-col justify-between"
                    >
                      <Wind className="w-4 h-4 text-amber-400 mb-1" />
                      <div className="font-bold text-xs text-white">Anaphylaxis</div>
                      <div className="text-[9px] text-zinc-400 font-mono">Stridor &gt;75dB</div>
                    </button>

                    <button
                      onClick={() => triggerEmergency('HEMORRHAGE', 0.05)}
                      className="p-2 bg-zinc-950 hover:bg-rose-950/50 hover:border-rose-500 border border-zinc-800 rounded-lg text-left transition flex flex-col justify-between"
                    >
                      <Droplet className="w-4 h-4 text-rose-500 mb-1" />
                      <div className="font-bold text-xs text-white">Hemorrhage</div>
                      <div className="text-[9px] text-zinc-400 font-mono">Arterial Trauma</div>
                    </button>

                    <button
                      onClick={() => triggerEmergency('BURN', 0.06)}
                      className="p-2 bg-zinc-950 hover:bg-orange-950/50 hover:border-orange-500 border border-zinc-800 rounded-lg text-left transition flex flex-col justify-between"
                    >
                      <Flame className="w-4 h-4 text-orange-400 mb-1" />
                      <div className="font-bold text-xs text-white">Severe Burn</div>
                      <div className="text-[9px] text-zinc-400 font-mono">Cyanosis / Fire</div>
                    </button>
                  </div>
                </div>

                {/* Active Emergency Bystander First Aid UI */}
                {activeDossier && (
                  <div className="bg-black border-2 border-amber-400 rounded-2xl p-3.5 space-y-3 shadow-xl">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <span className="bg-red-600 text-white font-black text-[10px] px-2 py-0.5 rounded font-mono">
                        {activeDossier.esiLevel}
                      </span>
                      <span className="text-xs font-mono font-bold text-amber-300 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>ETA: {formatETA(remainingEta)}</span>
                      </span>
                    </div>

                    <h4 className="font-black text-sm text-white">{activeDossier.conditionName}</h4>

                    <div className="space-y-2">
                      {activeDossier.bystanderSteps?.map((step: string, i: number) => (
                        <div
                          key={i}
                          className="flex items-start gap-2.5 bg-zinc-900 border border-amber-500/30 p-2.5 rounded-lg"
                        >
                          <div className="w-5 h-5 rounded-full bg-amber-400 text-black font-black text-xs flex items-center justify-center shrink-0">
                            {i + 1}
                          </div>
                          <div className="text-xs font-semibold text-zinc-100 leading-snug">
                            {step}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                      <button
                        onClick={() => speakVoiceGuidance(activeDossier.voiceScript)}
                        className="px-2.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs rounded-lg flex items-center gap-1.5 transition"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Repeat Voice</span>
                      </button>
                      <button
                        onClick={() => handleResetEmergency(true)}
                        className="text-[11px] text-zinc-400 hover:text-zinc-200 underline"
                      >
                        Reset Triage
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT 7 COLS: HOSPITAL ED COMMAND DASHBOARD */}
            <div className="lg:col-span-7 bg-zinc-950 border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-4">
              {/* ED Monitor Header */}
              <div
                className={`p-3.5 rounded-2xl border transition-colors ${
                  activeDossier
                    ? 'bg-red-950/80 border-red-600'
                    : 'bg-zinc-900/90 border-zinc-800'
                } flex flex-wrap items-center justify-between gap-3`}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-3.5 h-3.5 rounded-full ${
                      activeDossier ? 'bg-red-500 animate-ping' : 'bg-emerald-500'
                    }`}
                  ></div>
                  <div>
                    <h3 className="font-black text-sm uppercase tracking-wider text-white">
                      Metro General Trauma ED
                    </h3>
                    <p className="text-[10px] text-zinc-400 font-mono">
                      Resuscitation Bay 1 &bull; Real-Time Telemetry Stream
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 font-mono text-xs">
                  <span
                    className={`px-2.5 py-1 rounded font-bold ${
                      traumaBayReady
                        ? 'bg-emerald-950 border border-emerald-700 text-emerald-300'
                        : activeDossier
                        ? 'bg-red-900 border border-red-700 text-red-200 animate-pulse'
                        : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    {traumaBayReady
                      ? 'BAY 1: READY & PREPPED'
                      : activeDossier
                      ? 'BAY 1: CODE RED ALERT'
                      : 'BAY 1: STANDBY'}
                  </span>
                  {activeDossier && (
                    <button
                      onClick={stopHospitalAlarm}
                      className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 text-[11px]"
                    >
                      Silence
                    </button>
                  )}
                </div>
              </div>

              {/* ED Content: Either Standby Radar OR Active 3-Column Telemetry */}
              {!activeDossier ? (
                <div className="py-16 text-center flex flex-col items-center justify-center">
                  <div className="relative w-36 h-36 mb-4 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border border-emerald-900/60"></div>
                    <div className="absolute inset-4 rounded-full border border-emerald-800/40"></div>
                    <div className="absolute inset-10 rounded-full border border-emerald-700/30"></div>
                    <Radio className="w-10 h-10 text-emerald-500 animate-pulse z-10" />
                  </div>
                  <h4 className="font-bold text-zinc-200 text-base mb-1">
                    Telemetry Receiver Standing By
                  </h4>
                  <p className="text-xs text-zinc-400 font-mono max-w-sm mb-4">
                    Trigger any stage demo emergency on the left phone to watch biometrics, facial droop
                    vectors, and trauma prep checklists broadcast in real time.
                  </p>
                  <button
                    onClick={() => triggerEmergency('STROKE', 0.48)}
                    className="px-4 py-2 bg-zinc-800 hover:bg-red-950 border border-zinc-700 hover:border-red-600 rounded-xl text-xs font-bold transition"
                  >
                    Trigger Code Stroke Test
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Alarm Banner & ETA */}
                  <div className="bg-red-650 bg-red-600 text-white p-3 rounded-xl flex items-center justify-between font-mono">
                    <div className="flex items-center gap-2">
                      <AlertOctagon className="w-5 h-5 animate-bounce" />
                      <div>
                        <div className="font-black text-xs uppercase tracking-wide">
                          {activeDossier.conditionName}
                        </div>
                        <div className="text-[10px] text-red-100">
                          Transit ID: {activeDossier.patientId} &bull;{' '}
                          {activeDossier.autoTriggered
                            ? 'Auto-Triggered via Facial Droop'
                            : 'Bystander Dispatched'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] uppercase tracking-wider text-red-200">Transit ETA</div>
                      <div className="text-lg font-black text-amber-300">
                        {formatETA(remainingEta)}
                      </div>
                    </div>
                  </div>

                  {/* 3 Telemetry Panels */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Panel 1: Scene Snapshot & Location */}
                    <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl space-y-2.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5" /> Scene Visual
                      </div>
                      <div className="aspect-video bg-black rounded-lg overflow-hidden border border-zinc-800 flex items-center justify-center">
                        {snapshotDataUrl || activeDossier.snapshot ? (
                          <img
                            src={snapshotDataUrl || activeDossier.snapshot}
                            alt="Snapshot"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-[10px] font-mono text-zinc-500">Live Frame</div>
                        )}
                      </div>
                      <div className="bg-zinc-950 p-2 rounded text-[10px] font-mono space-y-1 border border-zinc-850">
                        <div className="flex justify-between text-zinc-400">
                          <span>Location:</span>
                          <span className="text-emerald-400 font-bold">
                            {userLocation.lat}° N, {userLocation.lon}° W
                          </span>
                        </div>
                        <div className="flex justify-between text-zinc-500">
                          <span>Distance:</span>
                          <span>2.4 mi (Corridor 1)</span>
                        </div>
                      </div>
                    </div>

                    {/* Panel 2: Multimodal Biometrics */}
                    <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl space-y-2.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                        <Brain className="w-3.5 h-3.5" /> Biometrics
                      </div>

                      {/* Asymmetry Metric */}
                      <div className="bg-zinc-950 p-2 rounded border border-zinc-850">
                        <div className="flex justify-between text-[11px] font-mono mb-1">
                          <span className="text-zinc-400">Asymmetry:</span>
                          <span
                            className="font-bold"
                            style={{ color: classifyAsymmetry(activeDossier.asymmetry).color }}
                          >
                            {Number(activeDossier.asymmetry).toFixed(2)}
                          </span>
                        </div>
                        <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden flex">
                          <div
                            className="h-full"
                            style={{
                              width: `${Math.min(100, activeDossier.asymmetry * 100)}%`,
                              backgroundColor: classifyAsymmetry(activeDossier.asymmetry).color,
                            }}
                          ></div>
                        </div>
                      </div>

                      {/* Airway Metric */}
                      <div className="bg-zinc-950 p-2 rounded border border-zinc-850">
                        <div className="flex justify-between text-[11px] font-mono mb-1">
                          <span className="text-zinc-400">Acoustic Airway:</span>
                          <span className="font-bold text-zinc-200">
                            {activeDossier.decibels} dB
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-amber-400 font-bold truncate">
                          {activeDossier.audioClass}
                        </div>
                      </div>

                      {/* Scene Voice Guidance */}
                      <div className="bg-zinc-950 p-2 rounded border border-zinc-850 text-[10px] text-zinc-400 italic">
                        "{activeDossier.voiceScript.slice(0, 90)}..."
                      </div>
                    </div>

                    {/* Panel 3: ER Trauma Preparation Checklist */}
                    <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl flex flex-col justify-between space-y-2.5">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5 mb-2">
                          <CheckCircle2 className="w-3.5 h-3.5" /> ED Preparation
                        </div>
                        <div className="space-y-1.5">
                          {activeDossier.edChecklist?.map((item: string, idx: number) => (
                            <label
                              key={idx}
                              className="flex items-start gap-2 bg-zinc-950 p-2 rounded border border-zinc-800/80 cursor-pointer text-[10px] select-none hover:bg-zinc-900"
                            >
                              <input
                                type="checkbox"
                                checked={!!checkedItems[idx]}
                                onChange={(e) =>
                                  setCheckedItems((prev) => ({
                                    ...prev,
                                    [idx]: e.target.checked,
                                  }))
                                }
                                className="w-3.5 h-3.5 mt-0.5 accent-emerald-500 rounded cursor-pointer"
                              />
                              <span
                                className={`leading-tight ${
                                  checkedItems[idx]
                                    ? 'line-through text-zinc-500'
                                    : 'text-zinc-200 font-semibold'
                                }`}
                              >
                                {item}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Confirm Ready Button */}
                      <button
                        onClick={handleConfirmTraumaReady}
                        className={`w-full py-2.5 px-3 rounded-lg font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-1.5 shadow ${
                          traumaBayReady
                            ? 'bg-emerald-700 text-white cursor-default'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-black active:scale-95'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{traumaBayReady ? '✔ Bay Confirmed Ready' : 'Confirm Bay Ready'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            STANDALONE FULLSCREEN PATIENT CO-PILOT VIEW
            ========================================================================= */}
        {viewMode === 'patient' && (
          <div className="max-w-md mx-auto">
            <iframe
              src="/patient"
              title="Patient Co-Pilot Standalone"
              className="w-full h-[85vh] rounded-2xl border border-zinc-800 shadow-2xl bg-black"
            />
          </div>
        )}

        {/* =========================================================================
            STANDALONE FULLSCREEN HOSPITAL ED COMMAND DASHBOARD VIEW
            ========================================================================= */}
        {viewMode === 'dashboard' && (
          <div className="w-full">
            <iframe
              src="/dashboard"
              title="Hospital Dashboard Standalone"
              className="w-full h-[85vh] rounded-2xl border border-zinc-800 shadow-2xl bg-zinc-950"
            />
          </div>
        )}
      </main>
    </div>
  );
}

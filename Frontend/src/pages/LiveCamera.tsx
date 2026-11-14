import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, CameraOff, Circle, Square, Send, RotateCcw, Trash2, Image as ImageIcon, Video, CheckCircle2, AlertTriangle, MapPin, Crosshair, ShieldAlert } from 'lucide-react';
import { PageHeading, SectionLabel } from '@/components/layout/PageHeading';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { apiClient } from '@/api/api';
import type { CameraStatus, Incident } from '@/types';
import { cn } from '@/lib/utils';

const MAX_RECORD_S = 30;

type Mode = 'photo' | 'video';
type Danger = '' | 'low' | 'medium' | 'high';

const DANGER_STYLE: Record<'low' | 'medium' | 'high', { label: string; cls: string }> = {
  high: { label: 'High', cls: 'bg-traffic-red/15 text-traffic-red' },
  medium: { label: 'Medium', cls: 'bg-traffic-orange/15 text-traffic-orange' },
  low: { label: 'Low', cls: 'bg-traffic-green/15 text-traffic-green' },
};
interface Captured {
  kind: Mode;
  blob: Blob;
  url: string;
}

// Telegram plays MP4 inline, so prefer it when the browser can record it.
function pickRecorderMime(): string {
  const options = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  if (typeof MediaRecorder === 'undefined') return '';
  return options.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

function cameraErrorMessage(err: any): string {
  switch (err?.name) {
    case 'NotAllowedError':
      return 'Camera permission was blocked. Click the camera icon in the address bar, choose "Allow", then try again.';
    case 'NotFoundError':
      return 'No camera was found on this computer.';
    case 'NotReadableError':
      return 'The camera is being used by another app (Zoom, Teams, Camera app). Close it and try again.';
    default:
      return err?.message || 'Could not start the camera.';
  }
}

const fmtSize = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

export default function LiveCamera() {
  const { add } = useToast() as any;
  const [params] = useSearchParams();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  const [status, setStatus] = useState<CameraStatus | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentId, setIncidentId] = useState<string>(params.get('incident') ?? '');
  const [note, setNote] = useState('');
  const [danger, setDanger] = useState<Danger>('');
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const [cameraOn, setCameraOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('photo');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);

  // Telegram set up? + incidents to link the evidence to.
  useEffect(() => {
    apiClient.getCameraStatus().then(setStatus).catch(() => setStatus(null));
    apiClient
      .getIncidents()
      .then((list) => setIncidents(list.filter((i) => i.status === 'pending' || i.status === 'verified')))
      .catch(() => setIncidents([]));
  }, []);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopCamera = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    clearTimer();
    streamRef.current?.getTracks().forEach((t) => t.stop()); // releases the webcam (light goes off)
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    setRecording(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser cannot use the camera. Open the site in Chrome or Edge on http://localhost.');
      return;
    }
    setStarting(true);
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraOn(true);
    } catch (err) {
      setCameraError(cameraErrorMessage(err));
    } finally {
      setStarting(false);
    }
  }, []);

  // Always release the camera when leaving the page.
  useEffect(() => () => stopCamera(), [stopCamera]);

  // Free the preview's memory when it is replaced.
  useEffect(() => () => { if (captured) URL.revokeObjectURL(captured.url); }, [captured]);

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    // Time stamp in the corner, like a dash cam.
    const stamp = `HUMSAFAR · ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;
    ctx.font = `${Math.max(14, Math.round(canvas.width / 60))}px sans-serif`;
    const pad = 8;
    const w = ctx.measureText(stamp).width + pad * 2;
    const h = Math.max(14, Math.round(canvas.width / 60)) + pad * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, canvas.height - h, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillText(stamp, pad, canvas.height - pad - 2);
    canvas.toBlob(
      (blob) => {
        if (blob) setCaptured({ kind: 'photo', blob, url: URL.createObjectURL(blob) });
      },
      'image/jpeg',
      0.9,
    );
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = pickRecorderMime();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 }) : new MediaRecorder(stream);
    } catch (err: any) {
      add?.('error', 'Recording not supported', err?.message);
      return;
    }
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      clearTimer();
      setRecording(false);
      const type = (recorder.mimeType || mimeType || 'video/webm').split(';')[0];
      const blob = new Blob(chunks, { type });
      if (blob.size) setCaptured({ kind: 'video', blob, url: URL.createObjectURL(blob) });
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    setRecording(true);
    setSeconds(0);
    timerRef.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_RECORD_S && recorder.state !== 'inactive') recorder.stop();
        return s + 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  };

  const discard = () => setCaptured(null);

  // Laptop location from the browser (Wi-Fi based, so it can be off by a few hundred metres).
  const shareLocation = () => {
    if (!navigator.geolocation) {
      add?.('error', 'Location not available', 'This browser cannot share location.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        add?.('error', 'Could not get location', err.code === err.PERMISSION_DENIED ? 'Location permission was blocked.' : err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const send = async () => {
    if (!captured) return;
    setSending(true);
    try {
      const res = await apiClient.sendCameraMedia(captured.kind, captured.blob, {
        incidentId: incidentId || null,
        note,
        danger,
        location: myLocation,
      });
      const what = captured.kind === 'photo' ? 'Photo' : 'Video';
      const extras = [
        res.incident_id ? `incident #${res.incident_id}` : null,
        res.danger_level ? `${res.danger_level} danger` : null,
        res.location ? (res.location.road ?? 'location') + (res.map_pin_sent ? ' + map pin' : '') : null,
      ].filter(Boolean);
      setLastSent(`${what} sent to Telegram (${res.size_kb} KB)${extras.length ? ' · ' + extras.join(' · ') : ''}`);
      add?.('success', `${what} sent`, 'Check your Telegram chat');
      setCaptured(null);
      setNote('');
    } catch (err: any) {
      add?.('error', 'Could not send', err.message);
    } finally {
      setSending(false);
    }
  };

  const linked = incidents.find((i) => String(i.id) === incidentId);
  const limitMb = status ? status.limits_mb[captured?.kind ?? 'photo'] : null;
  const tooBig = captured && limitMb ? captured.blob.size > limitMb * 1024 * 1024 : false;

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5 md:flex-row md:p-7">
      {/* ---------- Left: controls ---------- */}
      <aside className="flex w-full shrink-0 flex-col gap-5 md:w-[320px]">
        <PageHeading
          eyebrow="Incident evidence"
          title="Live"
          accent="camera"
          description="Turn on the laptop camera, take a photo or a short video, and send it straight to the Telegram bot."
        />

        <div
          className={cn(
            'flex items-center gap-2 rounded-2xl px-4 py-3 text-xs font-medium',
            status?.telegram_configured ? 'bg-traffic-green/10 text-traffic-green' : 'bg-traffic-orange/10 text-traffic-orange',
          )}
        >
          {status?.telegram_configured ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {status === null
            ? 'Checking Telegram…'
            : status.telegram_configured
              ? 'Telegram bot connected'
              : 'Telegram not set up — add the token and chat id to backend/.env'}
        </div>

        <SectionLabel>Link to incident</SectionLabel>
        <Select value={incidentId} onChange={(e) => setIncidentId(e.target.value)} aria-label="Incident">
          <option value="">No incident (demo)</option>
          {incidentId && !linked && <option value={incidentId}>Incident #{incidentId}</option>}
          {incidents.map((i) => (
            <option key={i.id} value={String(i.id)}>
              #{i.id} · {i.type} · {i.status}
            </option>
          ))}
        </Select>

        {linked ? (
          <div className="space-y-2 rounded-2xl border border-white/80 bg-white/55 p-3.5 text-xs">
            <p className="eyebrow">Telegram will show</p>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-3.5 w-3.5 text-ink-muted" />
              <span className="text-ink-muted">Danger level</span>
              {DANGER_STYLE[linked.severity as 'low' | 'medium' | 'high'] ? (
                <span className={cn('ml-auto rounded-full px-2.5 py-0.5 font-semibold', DANGER_STYLE[linked.severity as 'low' | 'medium' | 'high'].cls)}>
                  {DANGER_STYLE[linked.severity as 'low' | 'medium' | 'high'].label}
                </span>
              ) : (
                <span className="ml-auto capitalize text-ink">{linked.severity || '—'}</span>
              )}
            </div>
            {(linked.is_closure || (linked.lanes_blocked ?? 0) > 0) && (
              <p className="pl-5 text-ink-muted">
                {linked.is_closure ? 'Road closed' : `${linked.lanes_blocked} lane${(linked.lanes_blocked ?? 0) > 1 ? 's' : ''} blocked`}
              </p>
            )}
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" />
              <span className="text-ink">
                {linked.nearby_node || 'Incident location'}
                <span className="block text-[10px] text-ink-faint">
                  {linked.lat.toFixed(5)}, {linked.lng.toFixed(5)} · map pin included
                </span>
              </span>
            </div>
          </div>
        ) : (
          <>
            <Select label="Danger level" value={danger} onChange={(e) => setDanger(e.target.value as Danger)}>
              <option value="">Not set</option>
              <option value="low">🟢 Low</option>
              <option value="medium">🟠 Medium</option>
              <option value="high">🔴 High</option>
            </Select>
            {myLocation ? (
              <div className="flex items-start gap-2 rounded-2xl border border-white/80 bg-white/55 p-3 text-xs">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bronze" />
                <span className="flex-1 text-ink">
                  My location attached
                  <span className="block text-[10px] text-ink-faint">
                    {myLocation.lat.toFixed(5)}, {myLocation.lng.toFixed(5)} · ±{myLocation.accuracy} m
                  </span>
                </span>
                <button onClick={() => setMyLocation(null)} className="text-[11px] font-semibold text-ink-muted hover:text-traffic-red">
                  Remove
                </button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" onClick={shareLocation} loading={locating}>
                <Crosshair className="mr-1.5 h-3.5 w-3.5" /> Attach my location
              </Button>
            )}
          </>
        )}

        <div className="space-y-1.5">
          <label htmlFor="cam-note" className="block pl-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">
            Note (optional)
          </label>
          <input
            id="cam-note"
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Two cars blocking left lane"
            className="block w-full rounded-full border border-white/80 bg-white/70 px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-bronze/40"
          />
        </div>

        <SectionLabel>Camera</SectionLabel>
        {cameraOn ? (
          <Button variant="secondary" onClick={stopCamera} disabled={recording}>
            <CameraOff className="mr-2 h-4 w-4" /> Turn off camera
          </Button>
        ) : (
          <Button onClick={startCamera} loading={starting}>
            <Camera className="mr-2 h-4 w-4" /> Turn on camera
          </Button>
        )}

        <div className="flex gap-1 rounded-full bg-white/60 p-1" role="tablist" aria-label="Capture mode">
          {(['photo', 'video'] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              disabled={recording}
              onClick={() => setMode(m)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold capitalize transition-colors',
                mode === m ? 'bg-ink text-sand-50' : 'text-ink-muted hover:text-ink',
              )}
            >
              {m === 'photo' ? <ImageIcon className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />} {m}
            </button>
          ))}
        </div>

        {lastSent && (
          <div className="glass-dark flex items-center gap-2 rounded-2xl px-4 py-3 text-xs text-sand-50 animate-slide-up">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-traffic-green" /> {lastSent}
          </div>
        )}
      </aside>

      {/* ---------- Right: live view / preview ---------- */}
      <section className="flex min-h-[360px] flex-1 flex-col gap-4">
        <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-[1.75rem] border border-white/80 bg-black/60">
          {/* Live view stays mounted so the stream keeps running behind the preview. */}
          <video
            ref={videoRef}
            muted
            playsInline
            className={cn('h-full w-full object-contain', (!cameraOn || captured) && 'hidden')}
          />

          {captured &&
            (captured.kind === 'photo' ? (
              <img src={captured.url} alt="Captured photo" className="h-full w-full object-contain" />
            ) : (
              <video src={captured.url} controls playsInline className="h-full w-full object-contain" />
            ))}

          {!cameraOn && !captured && (
            <div className="max-w-sm px-6 text-center text-ink-muted">
              <CameraOff className="mx-auto mb-3 h-10 w-10 opacity-60" />
              {cameraError ? (
                <p className="text-sm text-traffic-red">{cameraError}</p>
              ) : (
                <p className="text-sm">Camera is off. Click <b>Turn on camera</b> and allow access when the browser asks.</p>
              )}
            </div>
          )}

          {cameraOn && !captured && (
            <span className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-semibold text-white">
              <span className={cn('h-2 w-2 rounded-full', recording ? 'animate-pulse bg-traffic-red' : 'bg-traffic-green')} />
              {recording ? `REC ${seconds}s / ${MAX_RECORD_S}s` : 'LIVE'}
            </span>
          )}
          {captured && (
            <span className="absolute left-4 top-4 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-semibold text-white">
              Preview · {captured.kind} · {fmtSize(captured.blob.size)}
            </span>
          )}
        </div>

        {/* Action bar */}
        <div className="glass flex flex-wrap items-center justify-center gap-2 rounded-full p-2">
          {captured ? (
            <>
              <Button variant="ghost" onClick={discard} disabled={sending}>
                {captured.kind === 'photo' ? <RotateCcw className="mr-2 h-4 w-4" /> : <Trash2 className="mr-2 h-4 w-4" />}
                {captured.kind === 'photo' ? 'Retake' : 'Discard'}
              </Button>
              <Button onClick={send} loading={sending} disabled={!status?.telegram_configured || tooBig}>
                <Send className="mr-2 h-4 w-4" /> Send to Telegram
              </Button>
              {tooBig && <span className="text-xs text-traffic-red">Too large (max {limitMb} MB)</span>}
            </>
          ) : mode === 'photo' ? (
            <Button onClick={takePhoto} disabled={!cameraOn}>
              <Camera className="mr-2 h-4 w-4" /> Capture photo
            </Button>
          ) : recording ? (
            <Button variant="danger" onClick={stopRecording}>
              <Square className="mr-2 h-4 w-4" /> Stop recording ({MAX_RECORD_S - seconds}s left)
            </Button>
          ) : (
            <Button variant="danger" onClick={startRecording} disabled={!cameraOn}>
              <Circle className="mr-2 h-4 w-4 fill-current" /> Record video (max {MAX_RECORD_S}s)
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

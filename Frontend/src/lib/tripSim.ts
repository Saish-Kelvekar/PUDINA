// Live Trip simulation: where the simulated vehicle is at trip time t (seconds).
// The plan's legs come from the backend with the same timings as the route cards:
// each road takes drive_s (+ incident delay, driven slower), then a red light may hold it at the junction.
import type { TripLeg } from '@/types';

export type SegmentKind = 'drive' | 'signal';

export interface Segment {
  kind: SegmentKind;
  legIndex: number;
  start: number; // trip seconds
  end: number;
}

export interface Timeline {
  legs: TripLeg[];
  segments: Segment[];
  legLengthsM: number[]; // measured along each leg's coordinates
  cumLegStartM: number[]; // distance driven before each leg starts
  totalM: number;
  totalS: number;
}

export interface VehicleState {
  lat: number;
  lng: number;
  legIndex: number;
  kind: SegmentKind | 'arrived';
  speedKmph: number; // 0 while waiting at a red light
  travelledM: number;
  remainingM: number;
  elapsedS: number;
  remainingS: number;
  waitLeftS: number; // seconds left at the current red light
  progress: number; // 0..1 of the trip time
}

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distM(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function lineLength(coords: Array<[number, number]>): number {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += distM(coords[i - 1], coords[i]);
  return m;
}

/** The point `along` metres into a polyline. */
export function pointAlong(coords: Array<[number, number]>, along: number): [number, number] {
  if (coords.length === 0) return [0, 0];
  if (along <= 0 || coords.length === 1) return coords[0];
  let left = along;
  for (let i = 1; i < coords.length; i++) {
    const piece = distM(coords[i - 1], coords[i]);
    if (left <= piece && piece > 0) {
      const f = left / piece;
      return [coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f];
    }
    left -= piece;
  }
  return coords[coords.length - 1];
}

/** Turns legs into back-to-back drive / red-light segments, starting at trip time `startAt`. */
export function buildTimeline(legs: TripLeg[], startAt = 0, legIndexOffset = 0): Timeline {
  const segments: Segment[] = [];
  const legLengthsM: number[] = [];
  const cumLegStartM: number[] = [];
  let t = startAt;
  let m = 0;
  legs.forEach((leg, i) => {
    const len = lineLength(leg.coords) || leg.length_m;
    legLengthsM.push(len);
    cumLegStartM.push(m);
    m += len;
    const drive = Math.max(0.1, leg.drive_s + leg.incident_delay_s);
    segments.push({ kind: 'drive', legIndex: i + legIndexOffset, start: t, end: t + drive });
    t += drive;
    if (leg.signal_wait_s > 0) {
      segments.push({ kind: 'signal', legIndex: i + legIndexOffset, start: t, end: t + leg.signal_wait_s });
      t += leg.signal_wait_s;
    }
  });
  return { legs, segments, legLengthsM, cumLegStartM, totalM: m, totalS: t };
}

/**
 * Keeps everything up to and including leg `keepThrough` (its drive and red light),
 * then continues with `newLegs` (a new plan that starts at that leg's end junction).
 */
export function spliceTimeline(tl: Timeline, keepThrough: number, newLegs: TripLeg[]): Timeline {
  const kept = tl.legs.slice(0, keepThrough + 1);
  return buildTimeline([...kept, ...newLegs]);
}

export function stateAt(tl: Timeline, tRaw: number): VehicleState {
  const t = Math.max(0, Math.min(tRaw, tl.totalS));
  const last = tl.legs[tl.legs.length - 1];
  const end = last.coords[last.coords.length - 1];
  if (t >= tl.totalS) {
    return { lat: end[0], lng: end[1], legIndex: tl.legs.length - 1, kind: 'arrived', speedKmph: 0,
             travelledM: tl.totalM, remainingM: 0, elapsedS: tl.totalS, remainingS: 0, waitLeftS: 0, progress: 1 };
  }
  const seg = tl.segments.find((s) => t >= s.start && t < s.end) ?? tl.segments[tl.segments.length - 1];
  const leg = tl.legs[seg.legIndex];
  const legLen = tl.legLengthsM[seg.legIndex];
  let along: number;
  let speed = 0;
  let waitLeft = 0;
  if (seg.kind === 'drive') {
    const f = (t - seg.start) / (seg.end - seg.start);
    along = legLen * f;
    speed = (legLen / (seg.end - seg.start)) * 3.6;
  } else {
    along = legLen;
    waitLeft = seg.end - t;
  }
  const [lat, lng] = pointAlong(leg.coords, along);
  const travelled = tl.cumLegStartM[seg.legIndex] + along;
  return {
    lat, lng, legIndex: seg.legIndex, kind: seg.kind, speedKmph: speed,
    travelledM: travelled, remainingM: Math.max(0, tl.totalM - travelled),
    elapsedS: t, remainingS: tl.totalS - t, waitLeftS: waitLeft, progress: t / tl.totalS,
  };
}

/** Coordinates already driven, for the grey trail on the map. */
export function trailUntil(tl: Timeline, st: VehicleState): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < st.legIndex; i++) out.push(...(out.length ? tl.legs[i].coords.slice(1) : tl.legs[i].coords));
  const leg = tl.legs[st.legIndex];
  const legStart = tl.cumLegStartM[st.legIndex];
  const along = st.travelledM - legStart;
  let left = along;
  const cur = leg.coords;
  const part: Array<[number, number]> = [cur[0]];
  for (let i = 1; i < cur.length && left > 0; i++) {
    const piece = distM(cur[i - 1], cur[i]);
    if (left >= piece) { part.push(cur[i]); left -= piece; }
    else { part.push(pointAlong(cur, along)); left = 0; }
  }
  out.push(...(out.length ? part.slice(1) : part));
  out.push([st.lat, st.lng]);
  return out;
}

/** The next red light ahead of the vehicle (not the one it is waiting at). */
export function nextSignal(tl: Timeline, st: VehicleState): { legIndex: number; inM: number } | null {
  for (let i = st.legIndex; i < tl.legs.length; i++) {
    if (tl.legs[i].signal_wait_s <= 0) continue;
    if (i === st.legIndex && st.kind === 'signal') continue;
    const endM = tl.cumLegStartM[i] + tl.legLengthsM[i];
    return { legIndex: i, inM: Math.max(0, endM - st.travelledM) };
  }
  return null;
}

export const fmtClock = (s: number) => {
  const v = Math.max(0, Math.round(s));
  const m = Math.floor(v / 60);
  return `${String(m).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};

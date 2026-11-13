import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import hi from '@/locales/hi';
import kn from '@/locales/kn';
import mr from '@/locales/mr';

/**
 * Whole-site translation without touching every component.
 *
 * The pages are written in English. When another language is chosen, a MutationObserver watches
 * the page and swaps each English text (and placeholder / title / aria-label) for its translation
 * from src/locales/<lang>.ts. React keeps working normally: when it writes new English text, the
 * observer translates it again. Switching back to English restores the original text.
 *
 * Dictionary keys are the English text. A key may contain {placeholders}: "{n} incidents".
 * Keys starting with "~" only match when every placeholder can be translated too.
 * Road names, numbers and user-typed text have no entry, so they stay as they are.
 * Mark an element with data-no-translate to leave it alone.
 */

export type Lang = 'en' | 'hi' | 'kn' | 'mr';

export const LANGUAGES: Array<{ code: Lang; label: string; english: string }> = [
  { code: 'en', label: 'English', english: 'English' },
  { code: 'hi', label: 'हिन्दी', english: 'Hindi' },
  { code: 'kn', label: 'ಕನ್ನಡ', english: 'Kannada' },
  { code: 'mr', label: 'मराठी', english: 'Marathi' },
];

const DICTS: Record<Exclude<Lang, 'en'>, Record<string, string>> = { hi, kn, mr };
const KEY = 'tv_lang';

// ---------- dictionary lookup ----------
interface Pattern {
  re: RegExp;
  out: string;
  names: string[];
  strict: boolean;
}
interface Compiled {
  exact: Map<string, string>;
  lower: Map<string, string>;
  patterns: Pattern[];
}
const compiled = new Map<Lang, Compiled>();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(lang: Exclude<Lang, 'en'>): Compiled {
  const c = compiled.get(lang);
  if (c) return c;
  const exact = new Map<string, string>();
  const lower = new Map<string, string>();
  const patterns: Pattern[] = [];
  for (const [rawKey, out] of Object.entries(DICTS[lang])) {
    const strict = rawKey.startsWith('~');
    const key = strict ? rawKey.slice(1) : rawKey;
    if (/\{\w+\}/.test(key)) {
      const names: string[] = [];
      const re = new RegExp(
        '^' + key.split(/(\{\w+\})/).map((part) => {
          const m = part.match(/^\{(\w+)\}$/);
          if (m) { names.push(m[1]); return '(.+?)'; }
          return escapeRe(part);
        }).join('') + '$',
      );
      patterns.push({ re, out, names, strict });
    } else {
      exact.set(key, out);
      lower.set(key.toLowerCase(), out);
    }
  }
  // Longer patterns first: they are more specific.
  patterns.sort((a, b) => b.re.source.length - a.re.source.length);
  const done = { exact, lower, patterns };
  compiled.set(lang, done);
  return done;
}

const isNumberish = (s: string) => !/[A-Za-z]{2}/.test(s);

function lookup(s: string, c: Compiled, depth = 0): string | null {
  if (!s || isNumberish(s)) return null;
  const hit = c.exact.get(s) ?? c.lower.get(s.toLowerCase());
  if (hit !== undefined) return hit;
  if (depth > 4) return null;

  // "Label ·" / "· label" (pieces of a longer line) -> translate the words, keep the dot
  const dot = s.match(/^(·\s*)?(.*?)(\s*·)?$/);
  if (dot && (dot[1] || dot[3]) && dot[2]) {
    const core = lookup(dot[2], c, depth + 1);
    if (core !== null) return (dot[1] ?? '') + core + (dot[3] ?? '');
  }

  // "Something." / "Something…" / "Something:" -> translate the core, keep the ending
  const end = s.match(/^(.*?)([.…:!?]+)$/);
  if (end && end[1]) {
    const core = lookup(end[1], c, depth + 1);
    if (core !== null) return core + end[2];
  }

  for (const p of c.patterns) {
    const m = s.match(p.re);
    if (!m) continue;
    let ok = true;
    let out = p.out;
    p.names.forEach((name, i) => {
      const v = m[i + 1];
      const t = lookup(v, c, depth + 1);
      if (t === null && p.strict && !isNumberish(v)) ok = false;
      out = out.split(`{${name}}`).join(t ?? v);
    });
    if (ok) return out;
  }

  // "A · B · C" -> translate each part
  for (const sep of [' · ', ' — ', ' → ']) {
    if (s.includes(sep)) {
      const parts = s.split(sep);
      const tr = parts.map((p) => lookup(p.trim(), c, depth + 1));
      if (tr.some((t) => t !== null)) return parts.map((p, i) => tr[i] ?? p).join(sep);
    }
  }

  // "Label: value"
  const lab = s.match(/^([^:]{2,40}):\s+(.+)$/);
  if (lab) {
    const l = lookup(lab[1], c, depth + 1);
    if (l !== null) return `${l}: ${lookup(lab[2], c, depth + 1) ?? lab[2]}`;
  }
  return null;
}

/** Translate one English string (for code that builds text itself). Returns the input if unknown. */
export function translate(text: string, lang: Lang): string {
  if (lang === 'en') return text;
  const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  const t = lookup(m[2], compile(lang));
  return t === null ? text : m[1] + t + m[3];
}

// ---------- live page translation ----------
const ATTRS = ['placeholder', 'title', 'aria-label'];
const textOrig = new WeakMap<Text, string>(); // English text React last wrote
const textShown = new WeakMap<Text, string>(); // what we put there
const attrOrig = new WeakMap<Element, Record<string, string>>();
const attrShown = new WeakMap<Element, Record<string, string>>();

let current: Lang = 'en';
let observer: MutationObserver | null = null;
const missing = new Set<string>(); // for development: English text with no translation yet

function skip(el: Element | null): boolean {
  if (!el) return true;
  if (el.closest('[data-no-translate], script, style, textarea, code, .leaflet-tile-pane')) return true;
  return el.closest('[contenteditable="true"]') !== null;
}

function doText(node: Text) {
  const val = node.nodeValue ?? '';
  if (textShown.get(node) === val) return; // our own change
  textOrig.set(node, val);
  if (skip(node.parentElement)) return;
  const out = translate(val, current);
  if (out === val && current !== 'en' && !isNumberish(val.trim())) missing.add(val.trim());
  textShown.set(node, out);
  if (out !== val) node.nodeValue = out;
}

function doAttrs(el: Element) {
  if (skip(el)) return;
  for (const a of ATTRS) {
    const val = el.getAttribute(a);
    if (val === null) continue;
    const shown = attrShown.get(el) ?? {};
    if (shown[a] === val) continue;
    const orig = attrOrig.get(el) ?? {};
    orig[a] = val;
    attrOrig.set(el, orig);
    const out = translate(val, current);
    shown[a] = out;
    attrShown.set(el, shown);
    if (out !== val) el.setAttribute(a, out);
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) doAttrs(root as Element);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = tw.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
    else doAttrs(n as Element);
    n = tw.nextNode();
  }
}

/** Put every node back to the English text React wrote, so the next language starts clean. */
function restoreAll() {
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = tw.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n as Text;
      const orig = textOrig.get(t);
      if (orig !== undefined && t.nodeValue !== orig) t.nodeValue = orig;
      textShown.delete(t);
    } else {
      const el = n as Element;
      const orig = attrOrig.get(el);
      if (orig) for (const [a, v] of Object.entries(orig)) if (el.getAttribute(a) !== v) el.setAttribute(a, v);
      attrShown.delete(el);
    }
    n = tw.nextNode();
  }
}

function setPageLanguage(lang: Lang) {
  observer?.disconnect();
  observer = null;
  restoreAll();
  current = lang;
  document.documentElement.lang = lang;
  if (lang === 'en') return;
  walk(document.body);
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') doText(r.target as Text);
      else if (r.type === 'attributes') doAttrs(r.target as Element);
      else r.addedNodes.forEach(walk);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

// For checking coverage in the browser console: __tvMissing()
(window as any).__tvMissing = () => [...missing].sort();

// ---------- React side ----------
interface LangValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (english: string) => string;
}
const LangContext = createContext<LangValue>({ lang: 'en', setLang: () => {}, t: (s) => s });

function readSaved(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'hi' || v === 'kn' || v === 'mr' ? v : 'en';
  } catch {
    return 'en';
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readSaved);

  useEffect(() => {
    setPageLanguage(lang);
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const t = useCallback((s: string) => translate(s, lang), [lang]);
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export const useLanguage = () => useContext(LangContext);

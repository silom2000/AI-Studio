import React, { useState, useRef } from 'react';
import {
  Globe, Video, User, Copy, Check, RefreshCw,
  RotateCw, Zap, Play, Clock, MessageSquare, Users, FileVideo,
  ChevronDown, ChevronRight, Download, Languages
} from 'lucide-react';
import type { DialogueResult, DialogueSegment } from './electron.d';

const LLM_PROVIDERS = [
  { value: 'custom', label: 'Custom Proxy' },
  { value: 'omniroute', label: 'OmniRoute (Claude)' },
  { value: 'pollinations', label: 'Pollinations' },
];

// ── Types ──────────────────────────────────────────────────────────────────
type PipelineState = 'IDLE' | 'PROCESSING' | 'STEP1_DONE' | 'STEP2_DONE' | 'STEP3_DONE' | 'RESULTS';
type LanguageTab = 'german' | 'french' | 'english';
type ResultsMode = 'overview' | 'segments';

// ── Color Palette ──────────────────────────────────────────────────────────
const C = {
  bg: '#0a0a0a',
  surface: '#111827',
  surfaceHover: '#1a2332',
  accent: '#3b82f6',
  accent2: '#8b5cf6',
  success: '#10b981',
  warning: '#f59e0b',
  text: '#e5e7eb',
  subtext: '#9ca3af',
  border: '#1f2937',
};

// ── Style factories ────────────────────────────────────────────────────────
const btn = (overrides?: React.CSSProperties): React.CSSProperties => ({
  padding: '10px 22px', borderRadius: '8px', border: 'none',
  cursor: 'pointer', fontWeight: 700, fontSize: '13px',
  color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '8px',
  transition: 'all 0.2s', ...overrides,
});

const btnSm = (overrides?: React.CSSProperties): React.CSSProperties => ({
  padding: '6px 14px', borderRadius: '6px', border: 'none',
  cursor: 'pointer', fontWeight: 600, fontSize: '11px',
  color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '4px',
  transition: 'all 0.2s', ...overrides,
});

const card: React.CSSProperties = {
  backgroundColor: C.surface, borderRadius: '12px', border: `1px solid ${C.border}`,
  padding: '16px', marginBottom: '16px',
};

const chip = (bg: string, fg: string): React.CSSProperties => ({
  padding: '2px 10px', borderRadius: '12px', fontSize: '11px',
  fontWeight: 600, backgroundColor: bg, color: fg, display: 'inline-block',
  whiteSpace: 'nowrap',
});

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 18px', borderRadius: '8px 8px 0 0', border: 'none',
  cursor: 'pointer', fontWeight: 700, fontSize: '13px',
  backgroundColor: active ? C.accent : 'transparent',
  color: active ? '#fff' : C.subtext,
  transition: 'all 0.2s',
});

// ── Helpers ─────────────────────────────────────────────────────────────────
async function copyToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return false; }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Component ───────────────────────────────────────────────────────────────
const LocalizeTab: React.FC = () => {
  // Pipeline
  const [pipelineState, setPipelineState] = useState<PipelineState>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [expandedSegment, setExpandedSegment] = useState<number | null>(null);
  const [processingMessage, setProcessingMessage] = useState<string>('');

  // Input
  const [videoBase64, setVideoBase64] = useState<string | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Results
  const [projectFolder, setProjectFolder] = useState<string>('');
  const [result, setResult] = useState<DialogueResult | null>(null);

  // Language state
  const [activeLang, setActiveLang] = useState<LanguageTab>('german');
  const [translatedSegmentsDE, setTranslatedSegmentsDE] = useState<DialogueSegment[] | null>(null);
  const [translatedSegmentsFR, setTranslatedSegmentsFR] = useState<DialogueSegment[] | null>(null);
  const [translatedSegmentsEN, setTranslatedSegmentsEN] = useState<DialogueSegment[] | null>(null);
  const [translatingDE, setTranslatingDE] = useState(false);
  const [translatingFR, setTranslatingFR] = useState(false);
  const [translatingEN, setTranslatingEN] = useState(false);

  // SEO Metadata
  const [metadataDE, setMetadataDE] = useState<{title: string, description: string, hashtags: string} | null>(null);
  const [metadataFR, setMetadataFR] = useState<{title: string, description: string, hashtags: string} | null>(null);
  const [metadataEN, setMetadataEN] = useState<{title: string, description: string, hashtags: string} | null>(null);

  // Video generation state
  const [generatingLang, setGeneratingLang] = useState<LanguageTab | null>(null);
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null);
  const [segmentVideosDE, setSegmentVideosDE] = useState<Record<number, string>>({});
  const [segmentVideosFR, setSegmentVideosFR] = useState<Record<number, string>>({});
  const [segmentVideosEN, setSegmentVideosEN] = useState<Record<number, string>>({});
  const [customPromptsEN, setCustomPromptsEN] = useState<Record<number, string>>({});
  const [customPromptsDE, setCustomPromptsDE] = useState<Record<number, string>>({});
  const [customPromptsFR, setCustomPromptsFR] = useState<Record<number, string>>({});
  const [generatingPrompts, setGeneratingPrompts] = useState(false);
  const [isRemerging, setIsRemerging] = useState(false);
  const [isMusicVideoMode, setIsMusicVideoMode] = useState(false);
  const [videoModel, setVideoModel] = useState<'omni_flash' | 'veo3_fast'>('omni_flash');
  const [llmProvider, setLlmProvider] = useState('custom');

  const getCustomPromptsForLang = (lang: LanguageTab): Record<number, string> =>
    lang === 'german' ? customPromptsDE : lang === 'french' ? customPromptsFR : customPromptsEN;

  const setCustomPromptsForLang = (lang: LanguageTab, map: Record<number, string>) => {
    if (lang === 'german') setCustomPromptsDE(map);
    else if (lang === 'french') setCustomPromptsFR(map);
    else setCustomPromptsEN(map);
  };

  // UI state
  const [resultsMode, setResultsMode] = useState<ResultsMode>('overview');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [originalFilename, setOriginalFilename] = useState<string>('');
  const [generatingSEO, setGeneratingSEO] = useState(false);

  const triggerCopy = (id: string, text: string) => {
    copyToClipboard(text).then(ok => { if (ok) { setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); } });
  };

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOriginalFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setVideoBase64(b64);
      setVideoPreviewUrl(URL.createObjectURL(file));
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setOriginalFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setVideoBase64(reader.result as string);
      setVideoPreviewUrl(URL.createObjectURL(file));
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!videoBase64) return;
    setError(null);
    setPipelineState('PROCESSING');
    try {
      setProcessingMessage('Step 1/4: Extracting Audio & Transcribing...');
      const step1Data = await window.electronAPI.localizeStep1STT({ videoBase64 });
      const pf = step1Data.projectFolder;
      setProjectFolder(pf);

      setProcessingMessage('Step 2/4: Running Speaker Diarization...');
      const step2Data = await window.electronAPI.localizeStep2Diarize({
        projectFolder: pf,
        transcriptWords: step1Data.transcriptWords,
        utterances: step1Data.utterances,
        frames: step1Data.frames
      });

      setProcessingMessage('Step 3/4: Analyzing Character Appearances...');
      const step3Data = await window.electronAPI.localizeStep3Characters({
        projectFolder: pf,
        frames: step1Data.frames,
        sceneFrames: step2Data.sceneFrames,
        segments: step2Data.segments,
        speakers: step2Data.speakers
      });

      setProcessingMessage('Step 4/5: Analyzing Voices & Matching...');
      const step4Data = await window.electronAPI.localizeStep4Voices({
        projectFolder: pf,
        segments: step2Data.segments,
        speakers: step2Data.speakers
      });

      setProcessingMessage('Step 5/5: Generating Director Video Prompts with Gemini...');
      const promptsData = await window.electronAPI.localizeGenerateVideoPrompts({
        projectFolder: pf,
        segments: step2Data.segments,
        characters: step3Data.characters,
        sceneDescription: step3Data.sceneDescription || ''
      });
      
      const promptMap: Record<number, string> = {};
      for (const p of promptsData) {
        promptMap[p.segmentIndex] = p.videoPrompt;
      }
      setCustomPromptsEN(promptMap);
      const finalResult = {
        projectFolder: pf,
        transcript: step1Data.transcript,
        transcriptWords: step1Data.transcriptWords,
        sceneDescription: step3Data.sceneDescription,
        speakers: step2Data.speakers,
        segments: step2Data.segments,
        characters: step3Data.characters,
        frames: step1Data.frames.map((f:any) => f.url),
        sceneFrames: step3Data.sceneFrames || step2Data.sceneFrames, // Use cleaned sceneFrames from Step 3
        voiceProfiles: step4Data.voiceProfiles,
        speakerVoices: step4Data.speakerVoices,
        videoUrl: step1Data.videoUrl
      };
      
      setResult(finalResult as any);
      setTranslatedSegmentsDE(null);
      setTranslatedSegmentsFR(null);
      setTranslatedSegmentsEN(null);
      setSegmentVideosDE({});
      setSegmentVideosFR({});
      setSegmentVideosEN({});
      setPipelineState('RESULTS');
      setResultsMode('segments');
    } catch (err: any) {
      setError(err?.message || 'Analysis failed');
      setPipelineState('IDLE');
    }
  };

  const handleTranslate = async (lang: LanguageTab) => {
    if (!result || !projectFolder) return;
    const setTranslating = lang === 'german' ? setTranslatingDE : lang === 'french' ? setTranslatingFR : setTranslatingEN;
    const setTranslated = lang === 'german' ? setTranslatedSegmentsDE : lang === 'french' ? setTranslatedSegmentsFR : setTranslatedSegmentsEN;
    const setMetadata = lang === 'german' ? setMetadataDE : lang === 'french' ? setMetadataFR : setMetadataEN;
    setTranslating(true);
    try {
      const targetLangStr = lang === 'german' ? 'German' : lang === 'french' ? 'French' : 'English';
      const [segments, meta] = await Promise.all([
        window.electronAPI.localizeTranslateSegments(projectFolder, result.segments, targetLangStr, llmProvider),
        window.electronAPI.localizeGenerateMetadata(projectFolder, result.transcript, targetLangStr, originalFilename, llmProvider)
      ]);
      setTranslated(segments);
      setMetadata(meta);

      // Clear old custom prompts for this language so backend auto-generates fresh ones
      // using seg.translatedText (the French/German/English translated text)
      setCustomPromptsForLang(lang, {});
    } catch (err: any) {
      console.error(`Translation to ${lang} failed:`, err);
    } finally { setTranslating(false); }
  };

  const handleGenerateSEO = async () => {
    if (!result || !projectFolder) return;
    setGeneratingSEO(true);
    try {
      const targetLangStr = activeLang === 'german' ? 'German' : activeLang === 'french' ? 'French' : 'English';
      const meta = await window.electronAPI.localizeGenerateMetadata(projectFolder, result.transcript, targetLangStr, originalFilename, llmProvider);
      if (activeLang === 'german') setMetadataDE(meta);
      else if (activeLang === 'french') setMetadataFR(meta);
      else setMetadataEN(meta);
    } catch (err: any) {
      console.error(`SEO generation failed:`, err);
    } finally { setGeneratingSEO(false); }
  };

  const handleGeneratePrompts = async () => {
    if (!result || !projectFolder) return;
    setGeneratingPrompts(true);
    try {
      const activeSegments = (activeLang === 'german' ? translatedSegmentsDE : activeLang === 'french' ? translatedSegmentsFR : translatedSegmentsEN) || result.segments;
      const promptsData = await window.electronAPI.localizeGenerateVideoPrompts({
        projectFolder,
        segments: activeSegments,
        characters: result.characters,
        sceneDescription: result.sceneDescription || ''
      });
      const promptMap: Record<number, string> = {};
      let segmentsUpdated = false;
      const newSegments = activeSegments ? [...activeSegments] : [];
      for (const p of promptsData) {
        promptMap[p.segmentIndex] = p.videoPrompt;
        if (p.translatedText && newSegments[p.segmentIndex]) {
          const currentSeg = newSegments[p.segmentIndex];
          const segText = currentSeg.translatedText || currentSeg.text;
          if (segText !== p.translatedText) {
            newSegments[p.segmentIndex] = {
              ...currentSeg,
              translatedText: p.translatedText
            };
            segmentsUpdated = true;
          }
        }
      }
      setCustomPromptsForLang(activeLang, promptMap);
      if (segmentsUpdated && activeSegments) {
        if (activeLang === 'german') setTranslatedSegmentsDE(newSegments);
        else if (activeLang === 'french') setTranslatedSegmentsFR(newSegments);
        else if (activeLang === 'english') setTranslatedSegmentsEN(newSegments);
        else setResult(prev => prev ? { ...prev, segments: newSegments } : null);
      }
    } catch (err: any) {
      console.error('Failed to generate video prompts:', err);
    } finally {
      setGeneratingPrompts(false);
    }
  };

  const handleRemergeScenes = async () => {
    if (!result || !projectFolder) return;
    setIsRemerging(true);
    try {
      const { segments } = await window.electronAPI.localizeRemergeProject(projectFolder);
      setResult(prev => prev ? { ...prev, segments } : null);
      setTranslatedSegmentsDE(null);
      setTranslatedSegmentsFR(null);
      setTranslatedSegmentsEN(null);
    } catch (err: any) {
      console.error('Failed to remerge scenes:', err);
      alert(`Error merging scenes: ${err.message || err}`);
    } finally {
      setIsRemerging(false);
    }
  };

  const handleGenerateVideo = async (segmentIndex: number, lang: LanguageTab) => {
    if (!result || !projectFolder) return;
    setGeneratingLang(lang);
    setGeneratingIndex(segmentIndex);
    const resolvedSegments = lang === 'german' ? translatedSegmentsDE : lang === 'french' ? translatedSegmentsFR : translatedSegmentsEN;
    const segments = resolvedSegments || result.segments;
    const currentCustomPrompts = getCustomPromptsForLang(lang);
    // Only send customPrompt if the user actually typed something manually (not an empty slot)
    const rawPrompt = currentCustomPrompts[segmentIndex];
    const userEditedPrompt = rawPrompt && rawPrompt.trim().length > 0 ? rawPrompt : undefined;
    const charImages = (result?.characters || []).map((c, i) => ({
      speakerId: i + 1,
      imageBase64: c.generatedImageUrl || ''
    })).filter(ci => ci.imageBase64);
    try {
      const { videoUrl, videoPrompt, translatedText } = await window.electronAPI.localizeGenerateSegmentVideo({
        projectFolder, segmentIndex, segments,
        targetLanguage: lang === 'german' ? 'German' : lang === 'french' ? 'French' : 'English',
        characterImages: charImages,
        sceneFrames: result.sceneFrames || undefined,
        characters: result.characters || undefined,
        sceneDescription: result.sceneDescription || undefined,
        speakerVoices: result.speakerVoices || undefined,
        customPrompt: userEditedPrompt,
        isMusicVideoMode,
        videoModel
      });
      if (lang === 'german') setSegmentVideosDE(p => ({ ...p, [segmentIndex]: videoUrl }));
      else if (lang === 'french') setSegmentVideosFR(p => ({ ...p, [segmentIndex]: videoUrl }));
      else setSegmentVideosEN(p => ({ ...p, [segmentIndex]: videoUrl }));

      if (videoPrompt) {
        const current = getCustomPromptsForLang(lang);
        setCustomPromptsForLang(lang, { ...current, [segmentIndex]: videoPrompt });
      }
      if (translatedText && segments && segments[segmentIndex]) {
        const currentSeg = segments[segmentIndex];
        const segText = currentSeg.translatedText || currentSeg.text;
        if (segText !== translatedText) {
          const updatedSegs = [...segments];
          updatedSegs[segmentIndex] = {
            ...currentSeg,
            translatedText: translatedText
          };
          if (lang === 'german') setTranslatedSegmentsDE(updatedSegs);
          else if (lang === 'french') setTranslatedSegmentsFR(updatedSegs);
          else if (lang === 'english') setTranslatedSegmentsEN(updatedSegs);
          else setResult(p => p ? { ...p, segments: updatedSegs } : null);
        }
      }
    } catch (err: any) {
      console.error(`Video generation failed for segment ${segmentIndex}:`, err);
    } finally { setGeneratingLang(null); setGeneratingIndex(null); }
  };

  const handleBatchGenerate = async (lang: LanguageTab) => {
    if (!result || !projectFolder) return;
    const segments = (lang === 'german' ? translatedSegmentsDE : lang === 'french' ? translatedSegmentsFR : translatedSegmentsEN) || result.segments;
    const setSegmentVideos = lang === 'german' ? setSegmentVideosDE : lang === 'french' ? setSegmentVideosFR : setSegmentVideosEN;
    setGeneratingLang(lang);
    const charImages = (result?.characters || []).map((c, i) => ({
      speakerId: i + 1,
      imageBase64: c.generatedImageUrl || ''
    })).filter(ci => ci.imageBase64);
    const targetLanguage = lang === 'german' ? 'German' : lang === 'french' ? 'French' : 'English';

    for (let i = 0; i < segments.length; i++) {
      setGeneratingIndex(i);
      try {
        const { videoUrl, videoPrompt, translatedText } = await window.electronAPI.localizeGenerateSegmentVideo({
          projectFolder,
          segmentIndex: i,
          segments,
          targetLanguage,
          characterImages: charImages,
          sceneFrames: result.sceneFrames || undefined,
          characters: result.characters || undefined,
          sceneDescription: result.sceneDescription || undefined,
          speakerVoices: result.speakerVoices || undefined,
          isMusicVideoMode,
          videoModel
        });
        // Update UI immediately after each segment completes
        setSegmentVideos(prev => ({ ...prev, [i]: videoUrl }));
        if (videoPrompt) {
          const current = getCustomPromptsForLang(lang);
          setCustomPromptsForLang(lang, { ...current, [i]: videoPrompt });
        }
        if (translatedText && segments && segments[i]) {
          const currentSeg = segments[i];
          const segText = currentSeg.translatedText || currentSeg.text;
          if (segText !== translatedText) {
            segments[i] = {
              ...currentSeg,
              translatedText: translatedText
            };
            if (lang === 'german') setTranslatedSegmentsDE([...segments]);
            else if (lang === 'french') setTranslatedSegmentsFR([...segments]);
            else if (lang === 'english') setTranslatedSegmentsEN([...segments]);
            else setResult(p => p ? { ...p, segments: [...segments] } : null);
          }
        }
      } catch (err: any) {
        console.error(`Batch: segment ${i} failed:`, err);
      }
    }

    setGeneratingLang(null);
    setGeneratingIndex(null);
  };

  const handleRegenerateImage = async (charIndex: number) => {
    if (!result || !projectFolder) return;
    try {
      const newUrl = await window.electronAPI.localizeRegenerateCharacterImage(projectFolder, charIndex);
      const updated = [...result.characters];
      updated[charIndex] = { ...updated[charIndex], generatedImageUrl: newUrl };
      setResult({ ...result, characters: updated });
    } catch (err: any) { console.error('Image regeneration failed:', err); }
  };

  const resetWorkflow = () => {
    setPipelineState('IDLE');
    setVideoBase64(null); setVideoPreviewUrl(null);
    setResult(null); setProjectFolder(''); setError(null);
    setTranslatedSegmentsDE(null); setTranslatedSegmentsFR(null); setTranslatedSegmentsEN(null);
    setSegmentVideosDE({}); setSegmentVideosFR({}); setSegmentVideosEN({});
    setCustomPromptsDE({}); setCustomPromptsFR({}); setCustomPromptsEN({}); setGeneratingPrompts(false);
    setResultsMode('overview');
  };

  // ── Derived ────────────────────────────────────────────────────────────
  const segmentsForLang: DialogueSegment[] = (activeLang === 'german' ? translatedSegmentsDE : activeLang === 'french' ? translatedSegmentsFR : translatedSegmentsEN) || result?.segments || [];
  const segmentVids = activeLang === 'german' ? segmentVideosDE : activeLang === 'french' ? segmentVideosFR : segmentVideosEN;
  const isTranslating = activeLang === 'german' ? translatingDE : activeLang === 'french' ? translatingFR : translatingEN;
  const hasTranslations = !!(activeLang === 'german' ? translatedSegmentsDE : activeLang === 'french' ? translatedSegmentsFR : translatedSegmentsEN);
  const vidCount = Object.keys(segmentVids).length;
  const totalSegs = result?.segments?.length || 0;
  const isBatchGenerating = generatingLang === activeLang && generatingIndex === null;

  // ══════════════════════════════════════════════════════════════════════════
  // IDLE
  // ══════════════════════════════════════════════════════════════════════════
  if (pipelineState === 'IDLE') {
    return (
      <div style={{ width: '100%', height: '100%', overflowY: 'auto', backgroundColor: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif', padding: '20px' }}>
        <div style={{ maxWidth: 700, margin: '40px auto', textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`, margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Globe size={36} color="#fff" />
          </div>

          <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 800 }}>TikTok Video Localizer</h1>
          <p style={{ color: C.subtext, margin: '0 0 32px', fontSize: 14 }}>
            Analyze dialogue videos, identify speakers, translate & generate localized talking-head clips for TikTok
          </p>

          {/* Upload */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            style={{ border: `2px dashed ${C.border}`, borderRadius: 12, padding: '48px 24px', cursor: 'pointer', backgroundColor: C.surface, transition: 'border-color 0.2s', marginBottom: 24 }}
          >
            <Video size={40} color={C.subtext} style={{ marginBottom: 12 }} />
            <p style={{ color: C.subtext, margin: 0, fontSize: 14 }}>
              {videoBase64 ? 'Video loaded ✓ — Click to change' : 'Click or drag & drop a video file (MP4 recommended)'}
            </p>
          </div>
          <input ref={fileInputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleVideoUpload} />

          {/* Preview */}
          {videoPreviewUrl && (
            <div style={{ marginBottom: 24 }}>
              <video src={videoPreviewUrl} controls style={{ width: '100%', maxHeight: 320, borderRadius: 8, backgroundColor: '#000' }} />
            </div>
          )}

          {/* Languages */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 24 }}>
            {[{ flag: '🇩🇪', label: 'German' }, { flag: '🇫🇷', label: 'French' }, { flag: '🇬🇧', label: 'English' }].map(l => (
              <div key={l.label} style={{ backgroundColor: C.surface, borderRadius: 8, padding: '10px 20px', border: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 20, marginRight: 8 }}>{l.flag}</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{l.label}</span>
              </div>
            ))}
          </div>

          {/* Music Video Mode Toggle */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', backgroundColor: C.surface, padding: '12px 20px', borderRadius: 8, border: `1px solid ${isMusicVideoMode ? C.accent : C.border}`, transition: 'all 0.2s' }}>
              <input
                type="checkbox"
                checked={isMusicVideoMode}
                onChange={(e) => setIsMusicVideoMode(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: C.accent, cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: isMusicVideoMode ? C.accent : C.text }}>Music Video Mode (Keep Original Audio)</span>
                <span style={{ fontSize: 11, color: C.subtext }}>No TTS generated. Final video uses the original song.</span>
              </div>
            </label>
          </div>

          {/* Analyze button */}
          <button onClick={handleAnalyze} disabled={!videoBase64}
            style={btn({
              padding: '16px 40px', fontSize: 15,
              background: videoBase64 ? `linear-gradient(135deg, ${C.accent}, ${C.accent2})` : '#374151',
              cursor: videoBase64 ? 'pointer' : 'not-allowed', opacity: videoBase64 ? 1 : 0.5,
            })}>
            <Zap size={18} /> STEP 1: EXTRACT & TRANSCRIBE
          </button>

          {error && (
            <div style={{ marginTop: 16, color: '#ef4444', backgroundColor: '#1f0000', padding: 12, borderRadius: 8 }}>{error}</div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROCESSING
  // ══════════════════════════════════════════════════════════════════════════
  if (pipelineState === 'PROCESSING') {
    return (
      <div style={{ width: '100%', height: '100%', overflowY: 'auto', backgroundColor: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <RefreshCw size={48} color={C.accent} style={{ animation: 'spin 1.5s linear infinite', marginBottom: 20 }} />
          <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>{processingMessage || 'Processing...'}</h2>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RESULTS
  // ══════════════════════════════════════════════════════════════════════════
  const segments = result!.segments;

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', backgroundColor: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif', padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800 }}>🌍 Localization Results</h2>
            <span style={{ color: C.subtext, fontSize: 12 }}>{projectFolder}</span>
          </div>
          <button onClick={resetWorkflow} style={btnSm({ backgroundColor: '#374151', fontSize: 11 })}>🔄 Reset</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setResultsMode('overview')} style={btnSm({ backgroundColor: resultsMode === 'overview' ? C.accent : C.surface, color: resultsMode === 'overview' ? '#fff' : C.subtext, border: `1px solid ${C.border}` })}>📊 Overview</button>
          <button onClick={() => setResultsMode('segments')} style={btnSm({ backgroundColor: resultsMode === 'segments' ? C.accent : C.surface, color: resultsMode === 'segments' ? '#fff' : C.subtext, border: `1px solid ${C.border}` })}>🎬 Segments</button>
        </div>
      </div>

      {/* SEO Metadata Copy Fields */}
      {resultsMode === 'segments' && (() => {
        const activeMeta = activeLang === 'german' ? metadataDE : activeLang === 'french' ? metadataFR : metadataEN;
        
        if (!activeMeta) {
          return (
            <div style={{ ...card, padding: '16px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(59, 130, 246, 0.05)', border: `1px dashed ${C.accent}` }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.accent, marginBottom: 4 }}>📈 SEO Metadata not generated yet</div>
                <div style={{ fontSize: 12, color: C.subtext }}>Click generate to create a viral title, description, and hashtags for TikTok in this language.</div>
              </div>
              <button 
                onClick={handleGenerateSEO} 
                disabled={generatingSEO}
                style={btnSm({ backgroundColor: C.accent, opacity: generatingSEO ? 0.7 : 1 })}
              >
                {generatingSEO ? 'Generating...' : '✨ Generate SEO Metadata'}
              </button>
            </div>
          );
        }

        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            {/* Title */}
            <div style={{ ...card, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: C.subtext, fontWeight: 600 }}>🏷️ Video Title</span>
                <button onClick={() => triggerCopy('meta-title', activeMeta.title)} style={{ ...btnSm({ backgroundColor: 'transparent' }), padding: '2px 6px' }}>
                  {copiedId === 'meta-title' ? <Check size={14} color={C.success} /> : <Copy size={14} color={C.subtext} />}
                </button>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{activeMeta.title}</div>
            </div>
            {/* Description */}
            <div style={{ ...card, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: C.subtext, fontWeight: 600 }}>📝 Description</span>
                <button onClick={() => triggerCopy('meta-desc', activeMeta.description)} style={{ ...btnSm({ backgroundColor: 'transparent' }), padding: '2px 6px' }}>
                  {copiedId === 'meta-desc' ? <Check size={14} color={C.success} /> : <Copy size={14} color={C.subtext} />}
                </button>
              </div>
              <div style={{ fontSize: 13, color: C.subtext, lineHeight: 1.4 }}>{activeMeta.description}</div>
            </div>
            {/* Hashtags */}
            <div style={{ ...card, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: C.subtext, fontWeight: 600 }}>#️⃣ Hashtags</span>
                <button onClick={() => triggerCopy('meta-hash', activeMeta.hashtags)} style={{ ...btnSm({ backgroundColor: 'transparent' }), padding: '2px 6px' }}>
                  {copiedId === 'meta-hash' ? <Check size={14} color={C.success} /> : <Copy size={14} color={C.subtext} />}
                </button>
              </div>
              <div style={{ fontSize: 14, color: C.accent, fontWeight: 500 }}>{activeMeta.hashtags}</div>
            </div>
          </div>
        );
      })()}

      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        {/* Left Side: Video player */}
        <div style={{ flex: '0 0 18%', minWidth: '200px', maxWidth: '280px', position: 'sticky', top: '20px' }}>
          <div style={{ ...card, padding: '8px', marginBottom: 0, display: 'flex', justifyContent: 'center' }}>
            <video src={result!.videoUrl} controls style={{ width: '100%', maxHeight: '65vh', borderRadius: 8, backgroundColor: '#000' }} />
          </div>
        </div>

        {/* Right Side: Settings & Parameters */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Stats + Model Selector */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16, alignItems: 'stretch' }}>
        {[
          { icon: <Users size={18} />, label: 'Speakers', val: result!.speakers?.length || 2 },
          { icon: <FileVideo size={18} />, label: 'Segments', val: totalSegs },
          { icon: <MessageSquare size={18} />, label: 'Words', val: result!.transcriptWords?.length || 0 },
          { icon: <Clock size={18} />, label: 'Duration', val: segments.length > 0 ? formatDuration(segments[segments.length - 1].endTime) : '—' },
        ].map(item => (
          <div key={item.label} style={card}>
            <div style={{ color: C.subtext, fontSize: 11, marginBottom: 4 }}>{item.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: C.accent }}>{item.icon}</span>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{item.val}</span>
            </div>
          </div>
        ))}
        {/* Video Model Selector */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, minWidth: 160 }}>
          <div style={{ color: C.subtext, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>🎥 Video Model</div>
          <select
            value={videoModel}
            onChange={e => setVideoModel(e.target.value as 'omni_flash' | 'veo3_fast')}
            style={{
              backgroundColor: '#1a1a2e',
              color: '#fff',
              border: `1px solid ${videoModel === 'veo3_fast' ? C.accent2 : C.accent}`,
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
              width: '100%',
            }}
          >
            <option value="omni_flash">⚡ Omni Flash</option>
            <option value="veo3_fast">🚀 Veo 3.1 Fast</option>
          </select>
          <div style={{ fontSize: 10, color: C.subtext }}>
            {videoModel === 'omni_flash' ? 'Fast · Audio driver support' : 'High quality · No audio driver'}
          </div>
        </div>
        {/* LLM Provider Selector */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, minWidth: 160 }}>
          <div style={{ color: C.subtext, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>🤖 LLM Provider</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {LLM_PROVIDERS.map(p => (
              <button
                key={p.value}
                onClick={() => setLlmProvider(p.value)}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  backgroundColor: llmProvider === p.value ? C.accent : '#1a1a2e',
                  color: '#fff', transition: 'all 0.2s'
                }}
              >{p.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ OVERVIEW ═══ */}
      {resultsMode === 'overview' && (
        <>
          {/* Speakers */}
          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Users size={18} color={C.accent2} /> Speakers</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {(result!.speakers || []).map((sp, i) => (
                <div key={sp.id} style={{ backgroundColor: '#1a1a2e', borderRadius: 8, padding: 12, borderLeft: `3px solid ${i === 0 ? C.accent : C.accent2}` }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    <span style={{ display: 'inline-block', width: 24, height: 24, borderRadius: '50%', backgroundColor: i === 0 ? C.accent : C.accent2, textAlign: 'center', lineHeight: '24px', fontSize: 12, marginRight: 8 }}>{sp.id}</span>
                    {sp.name}
                  </div>
                  <div style={{ fontSize: 12, color: C.subtext, marginBottom: 6 }}>{sp.description}</div>
                  {(sp.vocalPersona || sp.voiceProfile) && (
                    <div style={{ fontSize: 11, color: C.subtext, borderTop: `1px solid ${C.border}`, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {sp.vocalPersona && <div>🎭 <strong>Persona:</strong> <span style={{ color: '#e0e7ff' }}>{sp.vocalPersona}</span></div>}
                      {sp.voiceProfile && <div>🗣️ <strong>Voice:</strong> {sp.voiceProfile.gender}, {sp.voiceProfile.ageRange}, {sp.voiceProfile.timbre} timbre ({sp.voiceProfile.style})</div>}
                      {sp.voiceName && <div>🎙️ <strong>Matched Voice:</strong> <span style={{ color: C.success }}>{sp.voiceName}</span></div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Scene */}
          {result!.sceneDescription && (
            <div style={card}>
              <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>🎬 Scene</h3>
              <p style={{ margin: 0, color: C.subtext, fontSize: 13, lineHeight: 1.5 }}>{result!.sceneDescription}</p>
            </div>
          )}

          {/* Transcript */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>📝 Original Transcript</h3>
              <button onClick={() => triggerCopy('transcript', result!.transcript)} style={btnSm({ backgroundColor: 'transparent', border: `1px solid ${C.border}` })}>
                {copiedId === 'transcript' ? <Check size={14} color={C.success} /> : <Copy size={14} />}
                {copiedId === 'transcript' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 12, lineHeight: 1.6, color: C.subtext, backgroundColor: '#0d0d1a', borderRadius: 8, padding: 12 }}>
              {result!.transcript}
            </div>
          </div>

          {/* Characters */}
          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}><User size={18} color={C.accent} /> Characters</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
              {(result!.characters || []).map((char, i) => (
                <div key={i} style={{ backgroundColor: '#1a1a2e', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <div style={{ width: 100, height: 140, flexShrink: 0, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000' }}>
                      {char.generatedImageUrl ? (
                        <img src={char.generatedImageUrl} alt={char.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : char.bestFrameUrl ? (
                        <img src={char.bestFrameUrl} alt={char.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={32} color={C.subtext} /></div>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{char.name}</div>
                      <div style={{ fontSize: 11, color: C.subtext, marginBottom: 6 }}>{char.description}</div>
                      <div style={{ fontSize: 11, color: C.subtext, lineHeight: 1.4, marginBottom: 8 }}><strong>Appearance:</strong> {char.appearance}</div>
                      <div style={{ fontSize: 11, color: C.subtext, lineHeight: 1.4, marginBottom: 8 }}><strong>Prompt:</strong> {char.imagePrompt?.substring(0, 120)}...</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => triggerCopy(`prompt-${i}`, char.imagePrompt || '')} style={btnSm({ backgroundColor: 'transparent', border: `1px solid ${C.border}`, fontSize: 10 })}>
                          {copiedId === `prompt-${i}` ? <Check size={12} color={C.success} /> : <Copy size={12} />}
                          {copiedId === `prompt-${i}` ? '✓' : 'Prompt'}
                        </button>
                        <button onClick={() => handleRegenerateImage(i)} style={btnSm({ backgroundColor: C.accent2, fontSize: 10 })}>
                          <RotateCw size={12} /> Regenerate
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Frames strip */}
          <div style={card}>
            <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>🎞️ Key Frames</h3>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
              {(result!.frames || []).map((url, i) => (
                <img key={i} src={url} alt={`Frame ${i + 1}`} style={{ width: 72, height: 128, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: `1px solid ${C.border}` }} />
              ))}
            </div>
          </div>

          {/* Quick segment preview */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>💬 Dialogue Segments ({totalSegs})</h3>
              <button onClick={() => setResultsMode('segments')} style={btnSm({ backgroundColor: C.accent })}>View All →</button>
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {segments.map((seg, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                  <span style={chip(seg.speakerId === 1 ? 'rgba(59,130,246,0.2)' : 'rgba(139,92,246,0.2)', seg.speakerId === 1 ? C.accent : C.accent2)}>S{seg.speakerId}</span>
                  <span style={{ fontWeight: 600, fontSize: 12, minWidth: 80 }}>{seg.speakerName}</span>
                  <span style={{ fontSize: 12, color: C.subtext, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{seg.text}</span>
                  <span style={{ fontSize: 11, color: C.subtext, whiteSpace: 'nowrap' }}>{formatDuration(seg.startTime)} — {formatDuration(seg.endTime)} ({seg.duration}s)</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ═══ SEGMENTS ═══ */}
      {resultsMode === 'segments' && (
        <>
          {/* Language Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 0 }}>
            <button onClick={() => setActiveLang('german')} style={tabBtnStyle(activeLang === 'german')}>🇩🇪 German</button>
            <button onClick={() => setActiveLang('french')} style={tabBtnStyle(activeLang === 'french')}>🇫🇷 French</button>
            <button onClick={() => setActiveLang('english')} style={tabBtnStyle(activeLang === 'english')}>🇬🇧 English</button>
          </div>

          {/* Action bar */}
          <div style={{ backgroundColor: C.surface, borderRadius: '0 12px 12px 12px', border: `1px solid ${C.border}`, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>{activeLang === 'german' ? '🇩🇪' : activeLang === 'french' ? '🇫🇷' : '🇬🇧'}</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{activeLang === 'german' ? 'German' : activeLang === 'french' ? 'French' : 'English'} Localization</span>
              {hasTranslations && <span style={chip('rgba(16,185,129,0.2)', C.success)}>{segmentsForLang.length} translated</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleTranslate(activeLang)} disabled={isTranslating}
                style={btnSm({ backgroundColor: isTranslating ? '#374151' : C.accent2, cursor: isTranslating ? 'not-allowed' : 'pointer' })}>
                {isTranslating ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Translating...</> : <><Languages size={12} /> {hasTranslations ? 'Re-translate All' : 'Translate All'}</>}
              </button>
              <button onClick={handleRemergeScenes} disabled={isRemerging || isTranslating || isBatchGenerating}
                title="Automatically combine short clips (1-3s) into fewer scenes up to 9.0s to minimize generation cost and time"
                style={btnSm({ backgroundColor: isRemerging ? '#374151' : '#10b981', cursor: isRemerging ? 'not-allowed' : 'pointer' })}>
                {isRemerging ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Merging...</> : <><Zap size={12} /> Smart Merge (≤9s)</>}
              </button>
              <button onClick={handleGeneratePrompts} disabled={generatingPrompts}
                title="Regenerate all video prompts from source frames (already done automatically in Step 2)"
                style={btnSm({ backgroundColor: '#374151', cursor: (!generatingPrompts) ? 'pointer' : 'not-allowed', opacity: 0.5, fontSize: 10 })}>
                {generatingPrompts ? <><RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} /> Prompts...</> : <><RefreshCw size={10} /> Regen Prompts</>}
              </button>
              <button onClick={() => handleBatchGenerate(activeLang)} disabled={isBatchGenerating}
                style={btnSm({
                  background: (!isBatchGenerating) ? `linear-gradient(135deg, ${C.accent}, ${C.accent2})` : '#374151',
                  cursor: (!isBatchGenerating) ? 'pointer' : 'not-allowed', opacity: (!isBatchGenerating) ? 1 : 0.5,
                })}>
                {isBatchGenerating ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Generating... ({vidCount}/{totalSegs})</> : <><FileVideo size={12} /> Generate All ({vidCount}/{totalSegs})</>}
              </button>
            </div>
          </div>

          {/* Segments table */}
          <div style={{ ...card, padding: '12px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '40px 60px 100px 1fr 80px 110px', gap: 8, padding: '0 16px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 600, color: C.subtext, textTransform: 'uppercase' }}>
              <span>#</span><span>Frame</span><span>Speaker</span><span>Text</span><span>Duration</span><span>Actions</span>
            </div>

            {segmentsForLang.map((seg, i) => {
              const originalSeg = result!.segments[i];
              const vidUrl = segmentVids[i];
              const isGen = generatingLang === activeLang && (generatingIndex === i || generatingIndex === null);
              const expanded = expandedSegment === i;
              const spId = seg.speakerId || originalSeg?.speakerId || 1;
              const frameUrl = seg.cleanUrl || originalSeg?.cleanUrl || seg.sceneFrameUrl || originalSeg?.sceneFrameUrl || null;

              return (
                <div key={i}>
                  <div onClick={() => setExpandedSegment(expanded ? null : i)}
                    style={{ display: 'grid', gridTemplateColumns: '40px 60px 100px 1fr 80px 110px', gap: 8, padding: '10px 16px', alignItems: 'center', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', backgroundColor: expanded ? C.surfaceHover : 'transparent' }}>
                    <span style={{ fontSize: 12, color: C.subtext }}>{i + 1}</span>
                    <div style={{ width: 45, height: 80, borderRadius: 4, overflow: 'hidden', backgroundColor: '#000', border: `1px solid ${C.border}` }}>
                      {frameUrl ? (
                        <img src={frameUrl} alt={`Scene ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.subtext }}>—</div>
                      )}
                    </div>
                    <span style={chip(spId === 1 ? 'rgba(59,130,246,0.2)' : 'rgba(139,92,246,0.2)', spId === 1 ? C.accent : C.accent2)}>
                      {seg.speakerName || originalSeg?.speakerName || `S${spId}`}
                    </span>
                    <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {seg.translatedText || seg.text}
                    </span>
                    <span style={{ fontSize: 11, color: C.subtext }}>{seg.duration || originalSeg?.duration || '?'}s</span>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleGenerateVideo(i, activeLang)} disabled={isGen} style={btnSm({
                        padding: '4px 8px', fontSize: 10,
                        backgroundColor: vidUrl ? C.success : (isGen ? '#374151' : C.accent),
                        cursor: isGen ? 'not-allowed' : 'pointer',
                      })} title={vidUrl ? 'Regenerate' : 'Generate video'}>
                        {isGen ? <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} /> : vidUrl ? <Check size={10} /> : <Play size={10} />}
                      </button>
                      <button onClick={() => setExpandedSegment(expanded ? null : i)} style={btnSm({ padding: '4px 6px', fontSize: 10, backgroundColor: 'transparent', border: `1px solid ${C.border}` })}>
                        {expanded ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expanded && (
                    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, backgroundColor: C.surfaceHover }}>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {frameUrl && (
                          <div style={{ width: 108, flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: C.subtext, marginBottom: 4, textTransform: 'uppercase' }}>Scene Start Frame</div>
                            <img src={frameUrl} alt="Start frame" style={{ width: '100%', height: 192, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.border}` }} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ fontSize: 10, color: C.subtext, marginBottom: 4, textTransform: 'uppercase' }}>Original ({formatDuration(seg.startTime || 0)}—{formatDuration(seg.endTime || 0)})</div>
                          <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>{seg.text}</div>
                          {seg.translatedText && (
                            <>
                              <div style={{ fontSize: 10, color: C.subtext, marginBottom: 4, textTransform: 'uppercase' }}>{activeLang === 'german' ? 'German' : activeLang === 'french' ? 'French' : 'English'} Translation</div>
                              <div style={{ fontSize: 12, lineHeight: 1.5, color: C.accent2, marginBottom: 8 }}>{seg.translatedText}</div>
                            </>
                          )}
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 10, color: C.subtext, marginBottom: 4, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                              Video Prompt (auto-generated from frames)
                              {seg.sceneType && (
                                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, backgroundColor:
                                  seg.sceneType === 'talking_head' ? 'rgba(59,130,246,0.2)' :
                                  seg.sceneType === 'voiceover_visual' ? 'rgba(16,185,129,0.2)' :
                                  seg.sceneType === 'animated_character' ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.1)',
                                  color:
                                  seg.sceneType === 'talking_head' ? '#60a5fa' :
                                  seg.sceneType === 'voiceover_visual' ? '#34d399' :
                                  seg.sceneType === 'animated_character' ? '#c084fc' : C.subtext,
                                  fontWeight: 600, textTransform: 'uppercase' }}>
                                  {seg.sceneType === 'talking_head' ? '🎤 Talking Head' :
                                   seg.sceneType === 'voiceover_visual' ? '🎬 Voiceover' :
                                   seg.sceneType === 'animated_character' ? '🎭 Animated' : '🎥 Mixed'}
                                </span>
                              )}
                              {seg.emotion && (
                                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, backgroundColor: 'rgba(236,72,153,0.2)', color: '#f472b6', fontWeight: 600, textTransform: 'capitalize' }}>
                                  ✨ {seg.emotion}
                                </span>
                              )}
                              {getCustomPromptsForLang(activeLang)[i] && (
                                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, backgroundColor: 'rgba(245,158,11,0.2)', color: '#fbbf24', fontWeight: 600 }}>✏️ Edited</span>
                              )}
                            </div>
                            <textarea
                              value={getCustomPromptsForLang(activeLang)[i] ?? (seg.videoPrompt || '')}
                              onChange={(e) => {
                                const val = e.target.value;
                                const current = getCustomPromptsForLang(activeLang);
                                setCustomPromptsForLang(activeLang, { ...current, [i]: val });
                              }}
                              placeholder={seg.videoPrompt ? `Scene: ${seg.sceneType || 'auto'} — edit to override` : 'Prompt auto-generated during Step 2 analysis...'}
                              style={{ width: '100%', minHeight: 64, backgroundColor: '#0d0d1a', border: `1px solid ${getCustomPromptsForLang(activeLang)[i] ? '#f59e0b' : C.border}`, borderRadius: 6, padding: 8, color: '#fff', fontSize: 11, fontFamily: 'monospace', resize: 'vertical' }}
                            />
                          </div>
                        </div>
                        {vidUrl && (
                          <div style={{ width: 135, flexShrink: 0 }}>
                            <video src={vidUrl} controls style={{ width: '100%', height: 240, objectFit: 'cover', borderRadius: 8, backgroundColor: '#000' }} />
                            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                              <a href={vidUrl} download style={{ ...btnSm({ backgroundColor: C.success, fontSize: 10 }), textDecoration: 'none', flex: 1, textAlign: 'center' }}><Download size={10} /> Download</a>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {segmentsForLang.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: C.subtext }}>No segments found. Run analysis first.</div>
            )}
          </div>
        </>
      )}
        </div>
      </div>
    </div>
  );
};

export default LocalizeTab;

import React, { useState } from 'react';
import {
    ImageIcon,
    Video,
    RefreshCw,
    Box,
    Zap,
    Lightbulb,
    Brain,
    X,
    AlertTriangle,
    Download,
    FileAudio,
    FileText,
    Copy,
    CheckCircle,
    ClipboardPaste,
    Upload,
    Film
} from 'lucide-react';
import { StudioScript, StudioScene } from './electron.d';
import './StudioTab.css';

interface StudioTabProps {
    mode: 'health' | 'objects' | 'psychology';
}

const LANGUAGES = [
    { label: 'Русский', value: 'Russian' },
    { label: 'English', value: 'English' },
    { label: 'Polski', value: 'Polish' },
    { label: 'Deutsch', value: 'German' },
    { label: 'Français', value: 'French' },
    { label: 'Español', value: 'Spanish' },
];

const LLM_PROVIDERS = [
    { value: 'custom', label: 'Custom Proxy (Local)', desc: 'Ваш локальный/серверный прокси' },
    { value: 'omniroute', label: 'OmniRoute (Claude)', desc: 'Claude Sonnet via OmniRoute' },
    { value: 'pollinations', label: 'Pollinations', desc: 'Free, openai-large model' },
];

type VideoModel = 'veo_31_lite' | 'veo_31_fast' | 'omni_flash' | 'grok';

const VIDEO_MODELS: { value: VideoModel; label: string; desc: string }[] = [
    { value: 'veo_31_lite', label: 'Veo 3.1 Lite', desc: 'Balanced video generation' },
    { value: 'veo_31_fast', label: 'Veo 3.1 Fast', desc: 'Fast video generation' },
    { value: 'omni_flash', label: 'Omni Flash', desc: 'Omni Flash video generation' },
    { value: 'grok', label: 'Grok Generation', desc: '10s 720p Video' },
];

const StudioTab: React.FC<StudioTabProps> = ({ mode }) => {
    const [topic, setTopic] = useState('');
    const [referenceUrl, setReferenceUrl] = useState('');
    const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
    const [videoBase64, setVideoBase64] = useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement | null>(null);
    const [durationMode, setDurationMode] = useState<'30s' | 'full'>('30s');
    const [progressStatus, setProgressStatus] = useState<string>('');
    const [lang, setLang] = useState('Russian');
    const [llmProvider, setLlmProvider] = useState<string>('custom');
    const [imageModel, setImageModel] = useState<string>('freepik-mystic');
    const [videoModel, setVideoModel] = useState<VideoModel>('veo_31_lite');
    const [script, setScript] = useState<StudioScript | null>(null);
    const scriptRef = React.useRef(script);
    scriptRef.current = script;

    const [isLoading, setIsLoading] = useState(false);
    const [isAutoGenerating, setIsAutoGenerating] = useState(false);
    const stopAutoGenerationRef = React.useRef(false);
    const [isIdeasLoading, setIsIdeasLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    // ── Multi-thread G-Labs Concurrency State ──
    const [isMultiThread, setIsMultiThread] = useState<boolean>(true);
    const [concurrency, setConcurrency] = useState<number>(20);

    React.useEffect(() => {
        const fetchMultiThread = async () => {
            try {
                if (window.electronAPI?.glabsGetMultiThread) {
                    const cfg = await window.electronAPI.glabsGetMultiThread();
                    setIsMultiThread(cfg.isMultiThread);
                    setConcurrency(cfg.concurrency);
                }
            } catch (e) {
                console.error('Failed to get multithread config', e);
            }
        };
        fetchMultiThread();
    }, []);

    const handleToggleMultiThread = async (enabled: boolean) => {
        setIsMultiThread(enabled);
        try {
            if (window.electronAPI?.glabsSetMultiThread) {
                const cfg = await window.electronAPI.glabsSetMultiThread(enabled, concurrency);
                setIsMultiThread(cfg.isMultiThread);
                setConcurrency(cfg.concurrency);
            }
        } catch (e) {
            console.error('Failed to set multithread', e);
        }
    };

    const handleConcurrencyChange = async (val: number) => {
        setConcurrency(val);
        try {
            if (window.electronAPI?.glabsSetMultiThread) {
                const cfg = await window.electronAPI.glabsSetMultiThread(isMultiThread, val);
                setIsMultiThread(cfg.isMultiThread);
                setConcurrency(cfg.concurrency);
            }
        } catch (e) {
            console.error('Failed to set concurrency', e);
        }
    };

    React.useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                    const file = items[i].getAsFile();
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = () => {
                            if (typeof reader.result === 'string') {
                                setScreenshotBase64(reader.result);
                                setVideoBase64(null);
                            }
                        };
                        reader.readAsDataURL(file);
                        break;
                    }
                } else if (items[i].type.startsWith('video/')) {
                    const file = items[i].getAsFile();
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = () => {
                            if (typeof reader.result === 'string') {
                                setVideoBase64(reader.result);
                                setScreenshotBase64(null);
                            }
                        };
                        reader.readAsDataURL(file);
                        break;
                    }
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, []);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === 'string') {
                    if (file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi)$/i.test(file.name)) {
                        setVideoBase64(reader.result);
                        setScreenshotBase64(null);
                    } else {
                        setScreenshotBase64(reader.result);
                        setVideoBase64(null);
                    }
                }
            };
            reader.readAsDataURL(file);
        }
    };

    React.useEffect(() => {
        if (window.electronAPI.onStudioProgress) {
            window.electronAPI.onStudioProgress((data) => {
                if (data && data.status) {
                    setProgressStatus(data.status);
                }
            });
        }
        return () => {
            if (window.electronAPI.removeStudioProgressListener) {
                window.electronAPI.removeStudioProgressListener();
            }
        };
    }, []);

    const copyToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const pasteFromClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                setReferenceUrl(text.trim());
            }
        } catch (e) {
            console.error('Clipboard read failed:', e);
        }
    };
    const [viralIdeas, setViralIdeas] = useState<{ original: string; translation: string }[]>([]);

    // Assembly
    const [assembling, setAssembling] = useState(false);
    const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
    const [projectFolder, setProjectFolder] = useState('');

    const IMAGE_MODELS = [
        { value: 'nano_banana_2', label: 'Nano Banana 2', desc: 'Improved Versatility' },
        { value: 'nano_banana_pro', label: 'Nano Banana Pro', desc: 'Professional High Output' },
        { value: 'grok', label: 'Grok Generation', desc: 'Grok Image Model' },
    ];


    const fetchViralIdeas = async () => {
        setIsIdeasLoading(true);
        setError(null);
        try {
            const ideas = await window.electronAPI.studioGenerateIdeas(mode, lang, llmProvider) as any;
            setViralIdeas(ideas.map((idea: { original: string; translation: string }) => ({
                original: idea.original,
                translation: idea.translation,
            })));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsIdeasLoading(false);
        }
    };

    const saveProjectPrompts = React.useCallback(async (currentScript: StudioScript, folderName: string) => {
        if (!folderName || !currentScript) return;
        try {
            await window.electronAPI.studioSaveScript({
                projectFolder: folderName,
                script: currentScript,
                mode,
                topic,
                language: lang
            });
        } catch (e: any) {
            console.warn('[StudioTab] Failed to save prompts to project folder:', e.message);
        }
    }, [mode, topic, lang]);

    const generateScript = async () => {
        const effectiveTopic = topic.trim() || (referenceUrl.trim() ? `Reference: ${referenceUrl.trim()}` : '') || (screenshotBase64 ? 'Screenshot Rules Reference' : '') || (videoBase64 ? 'Video Demonstration Reference' : '');
        if (!effectiveTopic && !referenceUrl.trim() && !screenshotBase64 && !videoBase64) return;
        setIsLoading(true);
        setError(null);
        setProgressStatus('🚀 Запуск генерации сценария...');
        setViralIdeas([] as { original: string; translation: string }[]);
        try {
            const now = new Date();
            const timestamp = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}_${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getFullYear()}`;
            const folder = `Studio_${timestamp}`;
            setProjectFolder(folder);

            const result = await window.electronAPI.studioGenerateScript({
                mode,
                topic: effectiveTopic,
                language: lang,
                provider: llmProvider,
                projectFolder: folder,
                referenceUrl: referenceUrl.trim(),
                screenshotBase64: screenshotBase64 || undefined,
                videoBase64: videoBase64 || undefined,
                durationMode
            });
            const initializedScript: StudioScript = {
                ...result,
                scenes: result.scenes.map(s => ({ ...s, status: 'idle' }))
            };
            setScript(initializedScript);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
            setProgressStatus('');
        }
    };

    const updateScene = (id: number, updates: Partial<StudioScene>) => {
        setScript(prev => {
            if (!prev) return null;
            const updated = {
                ...prev,
                scenes: prev.scenes.map(s => s.id === id ? { ...s, ...updates } : s)
            };
            if (projectFolder) {
                saveProjectPrompts(updated, projectFolder);
            }
            return updated;
        });
    };

    const generateImage = async (sceneIndex: number, sceneId: number): Promise<string | null> => {
        const scene = script?.scenes.find(s => s.id === sceneId);
        if (!scene) return null;
        updateScene(sceneId, { status: 'generating_images' });
        try {
            const imageUrl = await window.electronAPI.skeletonGenerateImage({
                sceneIndex: sceneIndex,
                imagePrompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION. ${scene.imagePrompt}`,
                imageModel: imageModel as any,
                projectFolder,
                mode
            });
            updateScene(sceneId, { status: 'idle', selectedImage: imageUrl, generatedImages: [imageUrl] });
            return imageUrl;
        } catch (err: any) {
            setError(err.message);
            updateScene(sceneId, { status: 'idle' });
            return null;
        }
    };

    const animateScene = async (sceneIndex: number, sceneId: number, overrideImageUrl?: string) => {
        const scene = script?.scenes.find(s => s.id === sceneId);
        const imageUrl = overrideImageUrl || scene?.selectedImage;
        if (!imageUrl) {
            alert('Сначала сгенерируйте изображение!');
            return;
        }

        updateScene(sceneId, { status: 'generating_video' });
        try {
            const videoUrl = await window.electronAPI.skeletonGenerateVideo({
                sceneIndex: sceneIndex,
                videoPrompt: scene?.videoPrompt || '',
                scriptLine: scene?.line || '',
                language: lang,
                videoModel: videoModel as any,
                projectFolder
            });
            updateScene(sceneId, { status: 'ready', generatedVideoUrl: videoUrl });
        } catch (err: any) {
            setError(err.message);
            updateScene(sceneId, { status: 'idle' });
        }
    };

    const handleAssemble = async () => {
        if (!script) return;
        setAssembling(true);
        setFinalVideoUrl(null);
        try {
            const url = await window.electronAPI.studioAssembleVideo({
                useKaraoke: false,
                ideaTitle: script.socialPost?.title || script.intro || 'video',
                language: lang,
                projectFolder: projectFolder
            });
            setFinalVideoUrl(url);
        } catch (e: any) {
            setError('Ошибка сборки: ' + e.message);
        } finally {
            setAssembling(false);
        }
    };

    const resetProject = () => {
        setScript(null);
        setViralIdeas([]);
        setTopic('');
        setReferenceUrl('');
        setScreenshotBase64(null);
        setError(null);
        setFinalVideoUrl(null);
        setProjectFolder('');
        setIsAutoGenerating(false);
        stopAutoGenerationRef.current = false;
    };

    const stopAutoGeneration = () => {
        stopAutoGenerationRef.current = true;
        setIsAutoGenerating(false);
    };

    // ── Batch Image Generation (All Actors in Parallel) ────────────────────────
    const generateAllActors = async () => {
        const currentScript = scriptRef.current;
        if (!currentScript || !currentScript.scenes) return;
        setIsAutoGenerating(true);
        stopAutoGenerationRef.current = false;
        setError(null);

        try {
            const scenesToGenerate = currentScript.scenes.filter(s => !s.selectedImage);
            if (scenesToGenerate.length === 0) {
                alert('У всех сцен уже есть сгенерированные актёры!');
                return;
            }

            if (isMultiThread) {
                // All scenes trigger in parallel across multi-thread pool
                await Promise.all(
                    currentScript.scenes.map(async (s, i) => {
                        if (stopAutoGenerationRef.current) return;
                        if (!s.selectedImage) {
                            try {
                                await generateImage(i, s.id);
                            } catch (err: any) {
                                console.warn(`[BatchActors] Scene ${i + 1} image failed:`, err.message);
                            }
                        }
                    })
                );
            } else {
                // Sequential single-thread fallback
                for (let i = 0; i < currentScript.scenes.length; i++) {
                    if (stopAutoGenerationRef.current) break;
                    const s = currentScript.scenes[i];
                    if (!s.selectedImage) {
                        try {
                            await generateImage(i, s.id);
                        } catch (err: any) {
                            console.warn(`[BatchActors] Scene ${i + 1} image failed:`, err.message);
                        }
                        if (i < currentScript.scenes.length - 1 && !stopAutoGenerationRef.current) {
                            await new Promise(res => setTimeout(res, 5000));
                        }
                    }
                }
            }
        } catch (err: any) {
            console.error("Batch Actors Error:", err);
            setError("Генерация актёров прервана: " + err.message);
        } finally {
            setIsAutoGenerating(false);
            stopAutoGenerationRef.current = false;
        }
    };

    // ── Batch Video Animation (All Videos in Parallel) ─────────────────────────
    const animateAllScenes = async () => {
        const currentScript = scriptRef.current;
        if (!currentScript || !currentScript.scenes) return;
        setIsAutoGenerating(true);
        stopAutoGenerationRef.current = false;
        setError(null);

        try {
            const readyScenes = currentScript.scenes.filter(s => s.selectedImage && !s.generatedVideoUrl);
            if (readyScenes.length === 0) {
                alert('Нет сцен, готовых к анимации (сначала сгенерируйте изображения)!');
                return;
            }

            if (isMultiThread) {
                // All videos animate simultaneously across multi-thread pool
                await Promise.all(
                    currentScript.scenes.map(async (s, i) => {
                        if (stopAutoGenerationRef.current) return;
                        if (s.selectedImage && !s.generatedVideoUrl) {
                            try {
                                await animateScene(i, s.id, s.selectedImage);
                            } catch (err: any) {
                                console.warn(`[BatchVideos] Scene ${i + 1} video failed:`, err.message);
                            }
                        }
                    })
                );
            } else {
                // Sequential single-thread fallback
                for (let i = 0; i < currentScript.scenes.length; i++) {
                    if (stopAutoGenerationRef.current) break;
                    const s = currentScript.scenes[i];
                    if (s.selectedImage && !s.generatedVideoUrl) {
                        try {
                            await animateScene(i, s.id, s.selectedImage);
                        } catch (err: any) {
                            console.warn(`[BatchVideos] Scene ${i + 1} video failed:`, err.message);
                        }
                        if (i < currentScript.scenes.length - 1 && !stopAutoGenerationRef.current) {
                            await new Promise(res => setTimeout(res, 10000));
                        }
                    }
                }
            }
        } catch (err: any) {
            console.error("Batch Videos Error:", err);
            setError("Анимация видео прервана: " + err.message);
        } finally {
            setIsAutoGenerating(false);
            stopAutoGenerationRef.current = false;
        }
    };

    // ── Auto Generate All (Parallel End-to-End Pipeline) ───────────────────────
    const runAutoGeneration = async () => {
        const currentScript = scriptRef.current;
        if (!currentScript || !currentScript.scenes) return;
        setIsAutoGenerating(true);
        stopAutoGenerationRef.current = false;
        setError(null);

        try {
            if (isMultiThread) {
                // Fully parallel pipeline: each scene generates image and immediately animates video
                await Promise.all(
                    currentScript.scenes.map(async (s, i) => {
                        if (stopAutoGenerationRef.current) return;
                        let imageUrl = s.selectedImage || null;

                        if (!imageUrl) {
                            try {
                                imageUrl = await generateImage(i, s.id);
                            } catch (imgErr: any) {
                                console.warn(`[AutoGen] Scene ${i + 1} image failed:`, imgErr.message);
                            }
                        }

                        if (stopAutoGenerationRef.current || !imageUrl) return;

                        const latest = scriptRef.current;
                        const sceneNow = latest?.scenes?.[i];
                        if (sceneNow && !sceneNow.generatedVideoUrl) {
                            try {
                                await animateScene(i, s.id, imageUrl);
                            } catch (vidErr: any) {
                                console.warn(`[AutoGen] Scene ${i + 1} video failed:`, vidErr.message);
                            }
                        }
                    })
                );
            } else {
                // Sequential single-thread fallback
                for (let i = 0; i < currentScript.scenes.length; i++) {
                    if (stopAutoGenerationRef.current) break;
                    const s = currentScript.scenes[i];

                    let imageUrl = s.selectedImage || null;

                    if (!imageUrl) {
                        try {
                            imageUrl = await generateImage(i, s.id);
                        } catch (imgErr: any) {
                            console.warn(`[AutoGen] Scene ${i + 1} image failed, skipping:`, imgErr.message);
                        }
                    }

                    if (stopAutoGenerationRef.current) break;

                    if (imageUrl) {
                        const latest = scriptRef.current;
                        const sceneNow = latest?.scenes?.[i];
                        if (sceneNow && !sceneNow.generatedVideoUrl) {
                            await new Promise(res => setTimeout(res, 10000));
                            if (stopAutoGenerationRef.current) break;
                            try {
                                await animateScene(i, s.id, imageUrl);
                            } catch (vidErr: any) {
                                console.warn(`[AutoGen] Scene ${i + 1} video failed, skipping:`, vidErr.message);
                            }
                        }
                    }

                    if (i < currentScript.scenes.length - 1 && !stopAutoGenerationRef.current) {
                        await new Promise(res => setTimeout(res, 10000));
                    }
                }
            }
        } catch (err: any) {
            console.error("AutoGen Error:", err);
            setError("Autogeneration aborted: " + err.message);
        } finally {
            setIsAutoGenerating(false);
            stopAutoGenerationRef.current = false;
        }
    };

    const exportPrompts = async () => {
        if (!script) return;

        if (projectFolder) {
            saveProjectPrompts(script, projectFolder);
        }

        const imagePrompts = script.scenes.map(s => s.imagePrompt).join('\n\n');
        const videoPrompts = script.scenes.map(s => s.videoPrompt).join('\n\n');

        const safeTopic = script.intro.replace(/[^a-z0-9а-яё]/gi, '_').substring(0, 50);

        const files = [
            { filename: `${safeTopic}_image.txt`, content: imagePrompts },
            { filename: `${safeTopic}_video.txt`, content: videoPrompts }
        ];

        try {
            const result = await window.electronAPI.saveTextFiles(files);
            if (result.success) {
                alert('Промпты успешно экспортированы!');
            } else {
                setError('Ошибка экспорта: ' + result.error);
            }
        } catch (e: any) {
            setError('Ошибка экспорта: ' + e.message);
        }
    };

    return (
        <div className={`studio-container ${mode}-mode`}>
            {/* ── LEFT SIDEBAR ────────────────────────────────── */}
            <aside className="studio-sidebar">
                <div className="sidebar-section">
                    <h3 className="sidebar-title">🖼️ IMAGE MODEL</h3>
                    <div className="selection-list">
                        {IMAGE_MODELS.map(m => (
                            <div
                                key={m.value}
                                className={`selection-chip ${imageModel === m.value ? 'active' : ''}`}
                                onClick={() => setImageModel(m.value)}
                            >
                                <div className="chip-radio" />
                                <div className="chip-info">
                                    <span className="chip-label">{m.label}</span>
                                    <span className="chip-desc">{m.desc}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="sidebar-section">
                    <h3 className="sidebar-title">🎬 VIDEO MODEL</h3>
                    <div className="selection-list">
                        {VIDEO_MODELS.map(m => (
                            <div
                                key={m.value}
                                className={`selection-chip ${videoModel === m.value ? 'active' : ''}`}
                                onClick={() => setVideoModel(m.value)}
                            >
                                <div className="chip-radio" />
                                <div className="chip-info">
                                    <span className="chip-label">{m.label}</span>
                                    <span className="chip-desc">{m.desc}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="sidebar-section" style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <h3 className="sidebar-title" style={{ margin: 0, color: '#60a5fa' }}>⚡ G-LABS РЕЖИМ</h3>
                        <span style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: isMultiThread ? 'rgba(59,130,246,0.2)' : 'rgba(239,68,68,0.2)',
                            color: isMultiThread ? '#93c5fd' : '#fca5a5',
                            fontWeight: 700
                        }}>
                            {isMultiThread ? 'ПАРАЛЛЕЛЬНО' : '1 ПОТОК'}
                        </span>
                    </div>

                    <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: isMultiThread ? '#f8fafc' : '#94a3b8',
                        userSelect: 'none'
                    }}>
                        <input
                            type="checkbox"
                            checked={isMultiThread}
                            onChange={(e) => handleToggleMultiThread(e.target.checked)}
                            style={{
                                width: '16px',
                                height: '16px',
                                accentColor: '#3b82f6',
                                cursor: 'pointer'
                            }}
                        />
                        Многопоток (40 аккаунтов)
                    </label>

                    {isMultiThread && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Параллельных задач:</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input
                                    type="number"
                                    min={1}
                                    max={40}
                                    value={concurrency}
                                    onChange={(e) => handleConcurrencyChange(Math.max(1, Math.min(40, parseInt(e.target.value) || 1)))}
                                    style={{
                                        width: '46px',
                                        padding: '3px 6px',
                                        borderRadius: '4px',
                                        border: '1px solid #3b82f6',
                                        background: '#0f172a',
                                        color: '#fff',
                                        fontSize: '11px',
                                        textAlign: 'center'
                                    }}
                                />
                                <span style={{ fontSize: '10px', color: '#64748b' }}>/ 40</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="sidebar-section">
                    <h3 className="sidebar-title">🌍 LANGUAGE</h3>
                    <div className="selection-list">
                        {LANGUAGES.map(l => (
                            <div
                                key={l.value}
                                className={`selection-chip ${lang === l.value ? 'active' : ''}`}
                                onClick={() => setLang(l.value)}
                            >
                                <div className="chip-radio" />
                                <div className="chip-info">
                                    <span className="chip-label">{l.label}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="sidebar-section">
                    <h3 className="sidebar-title">🤖 LLM PROVIDER</h3>
                    <div className="selection-list">
                        {LLM_PROVIDERS.map(p => (
                            <div
                                key={p.value}
                                className={`selection-chip ${llmProvider === p.value ? 'active' : ''}`}
                                onClick={() => setLlmProvider(p.value)}
                            >
                                <div className="chip-radio" />
                                <div className="chip-info">
                                    <span className="chip-label">{p.label}</span>
                                    <span className="chip-desc">{p.desc}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>



                {script && !finalVideoUrl && (
                    <div className="sidebar-section assembly-section">
                        <button
                            onClick={handleAssemble}
                            disabled={assembling}
                            className={`action-btn primary assemble-btn ${assembling ? 'loading' : ''}`}
                            style={{ width: '100%', height: '50px', fontSize: '1rem' }}
                        >
                            {assembling ? <RefreshCw className="spin" /> : <Zap size={20} />}
                            {assembling ? ' ASSEMBLING...' : ' ASSEMBLE FINAL'}
                        </button>
                    </div>
                )}
            </aside>

            {/* ── MAIN AREA ────────────────────────────────── */}
            <div className="studio-main">
                <header className="studio-header">
                    <div className="studio-header-inner">
                        <div className="studio-logo">
                            <div className="studio-logo-icon">
                                {mode === 'health' ? <Lightbulb color="white" size={24} /> : mode === 'psychology' ? <Brain color="white" size={24} /> : <Box color="white" size={24} />}
                            </div>
                            <h1>
                                AI <span className="mode-text">{mode === 'health' ? 'GenieTalk' : mode === 'psychology' ? 'Psychology' : 'ObjectWars'}</span>
                            </h1>
                        </div>
                        {script && (
                            <div className="project-headline">
                                <span className="input-label">PROJECT:</span>
                                <span className="headline-text">{script.intro}</span>
                            </div>
                        )}
                    </div>
                </header>

                <main className="studio-main-content">
                    <div className="max-width-wrapper">
                        {error && (
                            <div className="error-banner">
                                <div className="error-message">
                                    <AlertTriangle size={20} /> <p>{error}</p>
                                </div>
                                <button onClick={() => setError(null)} className="close-btn"><X size={20} /></button>
                            </div>
                        )}

                        <section className="control-panel">
                            {/* Duration mode selector & Reference URL input */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
                                {/* Duration & Mode Toggle */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>⏱️ Длительность видео:</span>
                                        <div style={{ display: 'inline-flex', background: '#0f172a', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <button
                                                type="button"
                                                onClick={() => setDurationMode('30s')}
                                                style={{
                                                    padding: '5px 12px',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    borderRadius: '6px',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    background: durationMode === '30s' ? '#3b82f6' : 'transparent',
                                                    color: durationMode === '30s' ? '#fff' : '#94a3b8',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                ⚡ 30 сек (4-5 сцен — TikTok)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDurationMode('full')}
                                                style={{
                                                    padding: '5px 12px',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    borderRadius: '6px',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    background: durationMode === 'full' ? '#3b82f6' : 'transparent',
                                                    color: durationMode === 'full' ? '#fff' : '#94a3b8',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                🎬 Полное (8 сцен / ~60с)
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Reference Video URL Input */}
                                <div className="input-group" style={{ margin: 0 }}>
                                    <label className="input-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span>🔗 ССЫЛКА НА РЕФЕРЕНС (TIKTOK / REELS / SHORTS) — НЕОБЯЗАТЕЛЬНО</span>
                                        {referenceUrl && (
                                            <span style={{ color: '#38bdf8', fontSize: '11px', fontWeight: 500 }}>
                                                ✓ Видео будет скачано, транскрибировано и адаптировано под {mode === 'psychology' ? 'Психолога' : 'Вундеркинда'}
                                            </span>
                                        )}
                                    </label>
                                    <div className="topic-inner" style={{ position: 'relative', display: 'flex', gap: '8px' }}>
                                        <input
                                            type="text"
                                            value={referenceUrl}
                                            onChange={(e) => setReferenceUrl(e.target.value)}
                                            placeholder="Вставьте ссылку на TikTok, Instagram Reels или YouTube Shorts..."
                                            className="studio-input"
                                            style={{
                                                borderColor: referenceUrl.trim() ? '#3b82f6' : undefined,
                                                background: referenceUrl.trim() ? 'rgba(59, 130, 246, 0.05)' : undefined,
                                                paddingRight: referenceUrl ? '36px' : undefined
                                            }}
                                        />
                                        {referenceUrl && (
                                            <button
                                                type="button"
                                                onClick={() => setReferenceUrl('')}
                                                style={{
                                                    position: 'absolute',
                                                    right: '115px',
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: '#94a3b8',
                                                    cursor: 'pointer',
                                                    padding: '4px'
                                                }}
                                                title="Очистить ссылку"
                                            >
                                                <X size={16} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={pasteFromClipboard}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '0 14px',
                                                background: 'rgba(255, 255, 255, 0.06)',
                                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                                borderRadius: '8px',
                                                color: '#e2e8f0',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                whiteSpace: 'nowrap',
                                                transition: 'all 0.15s ease'
                                            }}
                                            title="Вставить ссылку из буфера обмена"
                                        >
                                            <ClipboardPaste size={15} /> Вставить
                                        </button>
                                    </div>
                                </div>

                                {/* Screenshot / Video Reference & Multimodal Analysis */}
                                <div className="input-group" style={{ margin: 0 }}>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileUpload}
                                        accept="image/*,video/*,.mp4,.mov,.webm,.avi,.mkv"
                                        style={{ display: 'none' }}
                                    />
                                    <label className="input-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span>🖼️ / 🎬 ФАЙЛ РЕФЕРЕНСА: СКРИНШОТ ИЛИ ЛОКАЛЬНОЕ ВИДЕО (CTRL+V ИЛИ ЗАГРУЗКА)</span>
                                        {(screenshotBase64 || videoBase64) && (
                                            <span style={{ color: '#10b981', fontSize: '11px', fontWeight: 500 }}>
                                                ✓ {videoBase64 ? 'Видеофайл загружен! STT и Vision AI проанализируют демонстрацию и речь' : 'Скриншот загружен! Vision OCR извлечет все правила и факты'}
                                            </span>
                                        )}
                                    </label>

                                    {!screenshotBase64 && !videoBase64 ? (
                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            style={{
                                                border: '2px dashed rgba(255, 255, 255, 0.15)',
                                                borderRadius: '10px',
                                                padding: '14px 18px',
                                                background: 'rgba(255, 255, 255, 0.02)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                transition: 'all 0.2s ease',
                                                color: '#94a3b8'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.borderColor = '#3b82f6';
                                                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.05)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <ImageIcon size={20} color="#38bdf8" />
                                                    <Video size={20} color="#a855f7" />
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
                                                        Нажмите для выбора картинки/видео или нажмите <span style={{ color: '#38bdf8', background: 'rgba(56, 189, 248, 0.15)', padding: '2px 6px', borderRadius: '4px' }}>Ctrl + V</span>
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                        Поддерживаются картинки с правилами (OCR) и видеоролики MP4/MOV (извлечение речи + анализ действий Vision AI)
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    fileInputRef.current?.click();
                                                }}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    padding: '6px 12px',
                                                    background: 'rgba(255, 255, 255, 0.08)',
                                                    border: '1px solid rgba(255, 255, 255, 0.15)',
                                                    borderRadius: '6px',
                                                    color: '#e2e8f0',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <Upload size={14} /> Выбрать файл
                                            </button>
                                        </div>
                                    ) : (
                                        <div
                                            style={{
                                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                                borderRadius: '10px',
                                                padding: '10px 14px',
                                                background: 'rgba(16, 185, 129, 0.05)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '12px'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                {screenshotBase64 ? (
                                                    <img
                                                        src={screenshotBase64}
                                                        alt="Скриншот референса"
                                                        style={{
                                                            width: '56px',
                                                            height: '56px',
                                                            objectFit: 'cover',
                                                            borderRadius: '6px',
                                                            border: '1px solid rgba(255,255,255,0.2)'
                                                        }}
                                                    />
                                                ) : (
                                                    <video
                                                        src={videoBase64!}
                                                        muted
                                                        playsInline
                                                        style={{
                                                            width: '56px',
                                                            height: '56px',
                                                            objectFit: 'cover',
                                                            borderRadius: '6px',
                                                            border: '1px solid rgba(255,255,255,0.2)',
                                                            background: '#000'
                                                        }}
                                                    />
                                                )}
                                                <div>
                                                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#34d399', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <CheckCircle size={15} /> {videoBase64 ? 'Видеофайл референса прикреплен' : 'Скриншот успешно прикреплен'}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                                                        {videoBase64
                                                            ? 'STT распознает голос, а Vision AI проанализирует кадры и перенесет методику в новый сценарий'
                                                            : 'Vision AI распознает текст и структуру списка и перепишет в вирусный сценарий'}
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setScreenshotBase64(null);
                                                    setVideoBase64(null);
                                                }}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '6px 12px',
                                                    background: 'rgba(239, 68, 68, 0.1)',
                                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                                    borderRadius: '6px',
                                                    color: '#f87171',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <X size={14} /> Удалить
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="control-panel-grid">
                                <div className="input-group topic-input-container">
                                    <label className="input-label">
                                        {screenshotBase64
                                            ? "УТОЧНЕНИЕ К СКРИНШОТУ (ОПЦИОНАЛЬНО)"
                                            : (referenceUrl.trim() ? "ДОПОЛНИТЕЛЬНЫЙ КОММЕНТАРИЙ / ТЕМА (ОПЦИОНАЛЬНО)" : "ТЕМА / ИДЕЯ (РУЧНОЙ ВВОД)")}
                                    </label>
                                    <div className="topic-inner">
                                        <input
                                            type="text"
                                            value={topic}
                                            onChange={(e) => setTopic(e.target.value)}
                                            placeholder={
                                                screenshotBase64
                                                    ? "Оставьте пустым, чтобы взять все правила из скриншота, или задайте тон..."
                                                    : (referenceUrl.trim() ? "Оставьте пустым, чтобы взять историю из видео целиком, или уточните фокус..." : (mode === 'health' ? "Например: 5 секретов чистки кухни, Лайфхак для быстрой уборки или Как сложить вещи" : mode === 'psychology' ? "Например: почему люди терпят токсичных людей, как не дать собой манипулировать..." : "История забытой картошки..."))
                                            }
                                            className="studio-input"
                                        />
                                        <button onClick={fetchViralIdeas} disabled={isIdeasLoading} className="idea-bulb-btn" title="Сгенерировать трендовые темы через AI">
                                            {isIdeasLoading ? <RefreshCw className="spin" size={20} /> : <Lightbulb size={20} />}
                                        </button>
                                    </div>
                                </div>

                                {!script && (
                                    <button
                                        onClick={generateScript}
                                        disabled={isLoading || (!topic.trim() && !referenceUrl.trim() && !screenshotBase64 && !videoBase64)}
                                        className="generate-btn"
                                        style={{
                                            background: screenshotBase64 ? 'linear-gradient(135deg, #059669, #0d9488)' : (referenceUrl.trim() ? 'linear-gradient(135deg, #2563eb, #7c3aed)' : undefined),
                                            boxShadow: screenshotBase64 ? '0 4px 14px rgba(16, 185, 129, 0.4)' : (referenceUrl.trim() ? '0 4px 14px rgba(59, 130, 246, 0.4)' : undefined)
                                        }}
                                    >
                                        {isLoading ? <RefreshCw className="spin" size={18} /> : <Zap size={18} />}
                                        {screenshotBase64
                                            ? ' 🔍 РАСПОЗНАТЬ СКРИНШОТ И СОЗДАТЬ СЦЕНАРИЙ'
                                            : (referenceUrl.trim() ? ' ⚡ РАЗОБРАТЬ РЕФЕРЕНС И СОЗДАТЬ СЦЕНАРИЙ' : ' GENERATE SCRIPT')}
                                    </button>
                                )}

                                {script && (
                                    <button onClick={exportPrompts} className="export-prompts-btn">
                                        <FileText size={18} /> EXPORT PROMPTS
                                    </button>
                                )}

                                {script && (
                                    <button onClick={resetProject} className="export-prompts-btn" style={{ background: '#64748b' }}>
                                        <RefreshCw size={18} /> RESET
                                    </button>
                                )}

                                {script && script.scenes.length > 0 && (
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {!isAutoGenerating ? (
                                            <>
                                                <button
                                                    onClick={generateAllActors}
                                                    className="export-prompts-btn"
                                                    style={{ background: '#3b82f6', color: '#fff', fontWeight: 600 }}
                                                    title="Параллельно сгенерировать изображения всех актёров"
                                                >
                                                    <Zap size={16} /> ⚡ ALL ACTORS
                                                </button>
                                                <button
                                                    onClick={animateAllScenes}
                                                    className="export-prompts-btn"
                                                    style={{ background: '#8b5cf6', color: '#fff', fontWeight: 600 }}
                                                    title="Параллельно анимировать видео для всех готовых изображений"
                                                >
                                                    <Film size={16} /> 🎬 ALL VIDEOS
                                                </button>
                                                <button
                                                    onClick={runAutoGeneration}
                                                    className="export-prompts-btn"
                                                    style={{ background: '#10b981', color: '#fff', fontWeight: 700 }}
                                                    title="Полный цикл: генерация всех картинок и мгновенная анимация каждого видео"
                                                >
                                                    <Zap size={16} /> ⚡ AUTO GENERATE ALL
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={stopAutoGeneration}
                                                className="export-prompts-btn"
                                                style={{ background: '#ef4444', color: '#fff', fontWeight: 700 }}
                                            >
                                                <RefreshCw className="spin" size={16} /> STOP
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Progress bar / notification */}
                            {isLoading && progressStatus && (
                                <div style={{ marginTop: '12px', padding: '10px 16px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.25)', display: 'flex', alignItems: 'center', gap: '10px', color: '#93c5fd', fontSize: '13px' }}>
                                    <RefreshCw className="spin" size={16} />
                                    <span>{progressStatus}</span>
                                </div>
                            )}

                            {viralIdeas.length > 0 && (
                                <div className="viral-ideas-container">
                                    {viralIdeas.map((idea, idx) => (
                                        <button key={idx} onClick={() => { setTopic(idea.original); setViralIdeas([]); }} className="viral-idea-chip">
                                            <span className="viral-idea-original">{idea.original}</span>
                                            {idea.translation && (
                                                <span className="viral-idea-translation">🇷🇺 {idea.translation}</span>
                                            )}
                                        </button>
                                    ))}
                                    <button onClick={() => setViralIdeas([])} className="close-ideas-btn"><X size={16} /></button>
                                </div>
                            )}
                        </section>

                        {script && script.socialPost && (
                            <section className="social-post-panel">
                                <h3 className="section-subtitle">📱 SOCIAL POST</h3>
                                <div className="social-post-grid">
                                    <div className="social-field">
                                        <div className="social-field-header">
                                            <span className="social-field-label">TITLE</span>
                                            <button onClick={() => copyToClipboard(script.socialPost!.title, 'title')} className="copy-btn">
                                                {copiedField === 'title' ? <CheckCircle size={16} color="#10b981" /> : <Copy size={16} />}
                                            </button>
                                        </div>
                                        <div className="social-field-content">{script.socialPost.title}</div>
                                    </div>
                                    <div className="social-field">
                                        <div className="social-field-header">
                                            <span className="social-field-label">DESCRIPTION</span>
                                            <button onClick={() => copyToClipboard(script.socialPost!.description, 'desc')} className="copy-btn">
                                                {copiedField === 'desc' ? <CheckCircle size={16} color="#10b981" /> : <Copy size={16} />}
                                            </button>
                                        </div>
                                        <div className="social-field-content">{script.socialPost.description}</div>
                                    </div>
                                    <div className="social-field">
                                        <div className="social-field-header">
                                            <span className="social-field-label">HASHTAGS</span>
                                            <button onClick={() => copyToClipboard(script.socialPost!.hashtags, 'hash')} className="copy-btn">
                                                {copiedField === 'hash' ? <CheckCircle size={16} color="#10b981" /> : <Copy size={16} />}
                                            </button>
                                        </div>
                                        <div className="social-field-content">{script.socialPost.hashtags}</div>
                                    </div>
                                </div>
                            </section>
                        )}

                        {finalVideoUrl && (
                            <section className="final-assembly-preview">
                                <div className="scene-card final-card">
                                    <div className="scene-info">
                                        <div className="scene-header">
                                            <div className="scene-number">★</div>
                                            <div className="status-badge gold">FINAL VIDEO READY</div>
                                        </div>
                                        <div className="line-container">
                                            <p className="line-text" style={{ fontSize: '1.2rem', color: '#fbbf24' }}>{script?.intro}</p>
                                        </div>
                                        <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '1rem' }}>
                                            Your viral short is ready with background music and cinematic flow.
                                        </p>
                                    </div>
                                    <div className="asset-display">
                                        <div className="preview-container">
                                            <video src={finalVideoUrl} controls loop className="preview-9-16" />
                                            <a href={finalVideoUrl} download className="download-floating-btn gold-btn">
                                                <Download size={20} />
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}

                        {script && (
                            <div className="scenes-grid">
                                {script.scenes.map((scene, idx) => (
                                    <div key={scene.id} className="scene-card">
                                        <div className="scene-info">
                                            <div className="scene-header">
                                                <div className="scene-number">{idx + 1}</div>
                                                {scene.audio_url && (
                                                    <div className="status-badge">
                                                        <FileAudio size={14} /> AUDIO READY
                                                    </div>
                                                )}
                                            </div>

                                            <div className="line-container">
                                                <p className="line-text">"{scene.line}"</p>
                                            </div>

                                            <div className="prompt-grid">
                                                <div className="prompt-item">
                                                    <label><ImageIcon size={14} /> Character & Prompt</label>
                                                    <textarea
                                                        value={scene.imagePrompt}
                                                        onChange={(e) => updateScene(scene.id, { imagePrompt: e.target.value })}
                                                        className="studio-textarea"
                                                        spellCheck={false}
                                                    />
                                                </div>

                                                <div className="prompt-item">
                                                    <label><Video size={14} /> Animation & Action</label>
                                                    <textarea
                                                        value={scene.videoPrompt}
                                                        onChange={(e) => updateScene(scene.id, { videoPrompt: e.target.value })}
                                                        className="studio-textarea"
                                                        spellCheck={false}
                                                    />
                                                </div>
                                            </div>

                                            <div className="scene-actions">
                                                <button onClick={() => generateImage(idx, scene.id)} disabled={scene.status !== 'idle'} className="action-btn secondary">
                                                    {scene.status === 'generating_images' ? <RefreshCw className="spin" /> : <ImageIcon size={16} />} GENERATE ACTOR
                                                </button>
                                                <button onClick={() => animateScene(idx, scene.id)} disabled={scene.status !== 'idle'} className="action-btn primary">
                                                    {scene.status === 'generating_video' ? <RefreshCw className="spin" /> : <Zap size={16} />} ANIMATE SCENE
                                                </button>
                                            </div>
                                        </div>

                                        <div className="asset-display">
                                            {scene.status === 'generating_images' || scene.status === 'generating_video' ? (
                                                <div className="loading-overlay">
                                                    <RefreshCw size={48} className="spin text-emerald-500" />
                                                    <p className="loading-text">Rendering...</p>
                                                </div>
                                            ) : scene.generatedVideoUrl ? (
                                                <div className="preview-container">
                                                    <video src={scene.generatedVideoUrl} controls loop className="preview-9-16" />
                                                    <a href={scene.generatedVideoUrl} download className="download-floating-btn">
                                                        <Download size={20} />
                                                    </a>
                                                </div>
                                            ) : scene.selectedImage ? (
                                                <div className="preview-container group">
                                                    <img src={scene.selectedImage} className="preview-9-16" alt="Actor preview" />
                                                    <button onClick={() => animateScene(idx, scene.id)} className="overlay-animate-btn">
                                                        ANIMATE NOW
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="preview-placeholder">
                                                    <ImageIcon size={64} />
                                                    <p>AWAITING ASSETS</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </main>
            </div>

            <style>{`
        .max-width-wrapper { max-width: 1200px; margin: 0 auto; width: 100%; }
        .project-headline { display: flex; flex-direction: column; align-items: flex-end; }
        .headline-text { font-weight: 800; font-size: 0.875rem; color: #10b981; }
        .close-btn { background: none; border: none; color: inherit; cursor: pointer; padding: 0.5rem; }
        .topic-inner { position: relative; display: flex; align-items: center; }
        .close-ideas-btn { background: none; border: none; color: #64748b; cursor: pointer; padding: 0.5rem; }
        .status-badge { display: flex; align-items: center; gap: 0.5rem; font-size: 0.65rem; font-weight: 900; background: rgba(16, 185, 129, 0.1); color: #10b981; padding: 0.5rem 1rem; border-radius: 1rem; border: 1px solid rgba(16, 185, 129, 0.2); }
        .preview-container { position: relative; width: 100%; display: flex; justify-content: center; }
        .download-floating-btn { position: absolute; bottom: 1.5rem; right: 1.5rem; background: #10b981; color: white; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: transform 0.2s; }
        .download-floating-btn:hover { transform: scale(1.1); }
        .overlay-animate-btn { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; color: black; padding: 0.75rem 1.5rem; border-radius: 2rem; font-weight: 900; font-size: 0.75rem; border: none; cursor: pointer; opacity: 0; transition: opacity 0.2s; }
        .preview-container:hover .overlay-animate-btn { opacity: 1; }
        .export-prompts-btn { display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: #6366f1; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.75rem; font-weight: 700; cursor: pointer; transition: background 0.2s; white-space: nowrap; }
        .export-prompts-btn:hover { background: #4f46e5; }
      `}</style>
        </div>
    );
};

export default StudioTab;

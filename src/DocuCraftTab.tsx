import { useState, useEffect } from 'react';
import './DocuCraftTab.css';

export interface DocuCraftShot {
  id: string;
  index: number;
  role: 'cause' | 'action' | 'transform' | 'result' | 'detail';
  roleLabel?: string;
  duration: number;
  prompt: string;
  sourceImage?: string;
  videoUrl?: string;
  status?: 'idle' | 'generating' | 'ready' | 'error';
  error?: string;
  brollMeta?: {
    source: string;
    sourceName: string;
    title: string;
    originalUrl?: string;
  };
}

export interface DocuCraftScene {
  id: string;
  chapterIndex: number;
  sceneIndex: number;
  title: string;
  voiceoverText: string;
  imagePrompt: string;
  videoAnimationPrompt: string;
  isAnimated: boolean;
  annotation?: string;
  videoFitMode?: 'drift' | 'loop' | 'slowmo' | 'pingpong' | 'freeze';
  imageUrl?: string;
  videoUrl?: string;
  extendedVideoUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  shots?: DocuCraftShot[];
  error?: string;
  brollMeta?: {
    source: string;
    sourceName: string;
    title: string;
    license?: string;
    creator?: string;
    sourcePageUrl?: string;
    originalUrl?: string;
  };
}

export interface DocuCraftChapter {
  id: string;
  index: number;
  title: string;
  targetDuration: string;
  objective?: string;
  startTimecode?: string;
  scenes: DocuCraftScene[];
}

export interface DocuCraftYouTubePackage {
  titleVariants: string[];
  description: string;
  tags: string[];
  chapters: string;
  durationSeconds: number;
  formattedDuration: string;
  generatedAt: string;
}

export interface DocuCraftScript {
  title: string;
  synopsis: string;
  stylePreset: string;
  customStyleDesc?: string;
  language: string;
  targetDurationMinutes: number;
  chapters: DocuCraftChapter[];
  projectFolder?: string;
  youtubeChapters?: string;
  youtubePackage?: DocuCraftYouTubePackage;
  finalVideoUrl?: string;
  totalDurationSeconds?: number;
}

export interface DocuCraftProjectSummary {
  folderName: string;
  title: string;
  language: string;
  chaptersCount: number;
  finalVideoUrl?: string | null;
  createdAt: number;
  manifest?: DocuCraftScript;
}

export interface DocuCraftBgmTrack {
  id: string;
  name: string;
  filename: string;
  path: string;
}

const INSPIRATION_PRESETS = [
  { label: '🌿 Permaculture & Living Soil', topic: 'Autonomous permaculture ecosystems: secrets of living soil, mycorrhizal networks, and companion planting guilds' },
  { label: '🏛️ Lost Ancient Builders', topic: 'Lost engineering of ancient civilizations: megalithic lifting systems, acoustic resonance, and self-healing Roman concrete' },
  { label: '🌸 Herbaria & Plant Intelligence', topic: 'Secret memory of plants and 19th-century medicinal botany: from copperplate herbarium engravings to neuro-botanical discoveries' },
  { label: '🌋 Abyssal & Extreme Ecosystems', topic: 'Oases of oceanic trenches: hydrothermal black smokers, chemosynthesis, and primordial origins of life' },
  { label: '⚗️ Alchemy & the Origins of Chemistry', topic: 'From hermetic arts of medieval alchemists to modern chemistry: the magnum opus, alembic distillation, and elemental discoveries' },
];

const STYLE_OPTIONS = [
  { value: 'vintage_botanical', label: 'Vintage Botanical (Pierre-Joseph Redouté copper engraving)' },
  { value: 'historical_manuscript', label: 'Historical Manuscript (Medieval illumination, parchment, antique cartography)' },
  { value: 'science_blueprints', label: 'Technical Blueprints (Cyanotype Da Vinci, exploded anatomical diagrams)' },
  { value: 'dark_mystery', label: 'Dark Archival Mystery (Film noir microfilm, declassified dossier)' },
  { value: 'custom', label: 'Custom Art Style' },
];

const LANGUAGES = ['English', 'French', 'Russian', 'German', 'Spanish'];

const VIDEO_MODELS = [
  { value: 'omni_vids', label: 'Google Vids (1080p Documentary)' },
  { value: 'omni_flash', label: 'Omni Flash (Fast i2v)' },
  { value: 'veo_31_fast', label: 'Veo 3.1 Fast' },
  { value: 'veo_31_lite', label: 'Veo 3.1 Lite' },
];

const IMAGE_MODELS = [
  { value: 'nano_pics', label: 'Google Pics / Nano Pics (Archival plate)' },
  { value: 'nano_banana_2', label: 'Nano Banana 2' },
  { value: 'nano_banana_pro', label: 'Nano Banana Pro' },
];

export function DocuCraftTab() {
  const [topic, setTopic] = useState('');
  const [targetDurationMinutes, setTargetDurationMinutes] = useState(10);
  const [stylePreset, setStylePreset] = useState('vintage_botanical');
  const [customStyleDesc, setCustomStyleDesc] = useState('');
  const [language, setLanguage] = useState('French');
  const [aiModel, setAiModel] = useState<'custom' | 'omniroute' | 'pollinations'>('custom');
  const [ttsService, setTtsService] = useState<'voiceapi' | 'elevenlabs'>('voiceapi');
  const [imageModel, setImageModel] = useState('nano_pics');
  const [videoModel, setVideoModel] = useState('omni_vids');
  const [videoDuration, setVideoDuration] = useState(9);
  const [bgmTrack, setBgmTrack] = useState('');
  const [bgmVolume, setBgmVolume] = useState(0.12);

  // Broadcast & Video Assembly Settings
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showChapterTitles, setShowChapterTitles] = useState(true);
  const [defaultFitMode, setDefaultFitMode] = useState<'drift' | 'loop' | 'slowmo' | 'pingpong' | 'freeze'>('drift');

  const [script, setScript] = useState<DocuCraftScript | null>(null);
  const [projects, setProjects] = useState<DocuCraftProjectSummary[]>([]);
  const [bgmTracks, setBgmTracks] = useState<DocuCraftBgmTrack[]>([]);
  const [collapsedChapters, setCollapsedChapters] = useState<Record<string, boolean>>({});
  const [enlargedMedia, setEnlargedMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [activeShort, setActiveShort] = useState<{ shortUrl: string; title: string } | null>(null);
  const [sceneMediaView, setSceneMediaView] = useState<Record<string, 'video' | 'image'>>({});

  const [progress, setProgress] = useState<{ step: string; status: string; progress: number; sceneId?: string } | null>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [isAssembling, setIsAssembling] = useState(false);
  const [isGeneratingShort, setIsGeneratingShort] = useState(false);
  const [extendingSceneId, setExtendingSceneId] = useState<string | null>(null);
  const [copiedYtChapters, setCopiedYtChapters] = useState(false);
  const [copiedDesc, setCopiedDesc] = useState(false);
  const [copiedTags, setCopiedTags] = useState(false);
  const [copiedTitleIdx, setCopiedTitleIdx] = useState<number | null>(null);
  const [ytPackageTab, setYtPackageTab] = useState<'titles' | 'description' | 'chapters' | 'tags'>('titles');
  const [activeTab, setActiveTab] = useState<'editor' | 'master' | 'history'>('editor');

  // Multi-Shot Narrative Chaining State
  const [decomposingScenes, setDecomposingScenes] = useState<Record<string, boolean>>({});
  const [chainingScenes, setChainingScenes] = useState<Record<string, boolean>>({});
  const [generatingShots, setGeneratingShots] = useState<Record<string, boolean>>({});

  // B-Roll / Stock Archival Retrieval Modal State
  const [stockModalTarget, setStockModalTarget] = useState<{ chapIdx: number; scIdx: number; scene: DocuCraftScene } | null>(null);
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [stockSource, setStockSource] = useState<'all' | 'wikimedia' | 'archive_org' | 'pexels'>('all');
  const [stockMediaType, setStockMediaType] = useState<'all' | 'video' | 'image'>('all');
  const [stockResults, setStockResults] = useState<any[]>([]);
  const [isSearchingStock, setIsSearchingStock] = useState(false);
  const [isSelectingStock, setIsSelectingStock] = useState(false);
  const [stockSelectedItemId, setStockSelectedItemId] = useState<string | null>(null);
  const [pexelsConfigured, setPexelsConfigured] = useState(false);
  const [pexelsApiKey, setPexelsApiKey] = useState('');
  const [showPexelsKeyInput, setShowPexelsKeyInput] = useState(false);

  // YouTube Thumbnail State
  const [thumbnails, setThumbnails] = useState<Array<{id: number; style: string; styleTitle: string; overlayText: string; prompt: string; imageUrl: string; fileName?: string; error?: string}>>([]);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);
  const [regeneratingThumbIdx, setRegeneratingThumbIdx] = useState<number | null>(null);

  // Load projects & BGM tracks on mount
  useEffect(() => {
    loadProjectsList();
    loadBgmList();

    const handleProgress = (data: any) => {
      setProgress(data);
      if (data.progress >= 100) {
        setTimeout(() => setProgress(null), 2500);
      }
    };

    const handleShotUpdated = (data: { sceneId: string; shotIndex: number; shot: DocuCraftShot }) => {
      setScript(prev => {
        if (!prev) return prev;
        const next = { ...prev };
        for (const chap of next.chapters) {
          for (const sc of chap.scenes) {
            if (sc.id === data.sceneId) {
              if (!sc.shots) sc.shots = [];
              sc.shots[data.shotIndex] = { ...sc.shots[data.shotIndex], ...data.shot };
              return { ...next };
            }
          }
        }
        return prev;
      });
    };

    window.electronAPI.onDocuCraftProgress?.(handleProgress);
    window.electronAPI.onDocuCraftShotUpdated?.(handleShotUpdated);
    return () => {
      window.electronAPI.removeDocuCraftProgressListener?.();
      window.electronAPI.removeDocuCraftShotUpdatedListener?.();
    };
  }, []);

  const loadProjectsList = async () => {
    try {
      const list = await window.electronAPI.docucraftLoadProjects();
      setProjects(list || []);
    } catch (_) {}
  };

  const loadBgmList = async () => {
    try {
      const tracks = await window.electronAPI.docucraftGetBgmTracks();
      setBgmTracks(tracks || []);
      if (tracks && tracks.length > 0 && !bgmTrack) {
        setBgmTrack(tracks[0].filename);
      }
    } catch (_) {}
  };

  const toggleChapterCollapse = (chapId: string) => {
    setCollapsedChapters(prev => ({ ...prev, [chapId]: !prev[chapId] }));
  };

  const handleUpdateScene = (chapIndex: number, sceneIndex: number, field: keyof DocuCraftScene, val: any) => {
    if (!script) return;
    const next = { ...script };
    const chap = next.chapters[chapIndex];
    if (chap && chap.scenes[sceneIndex]) {
      (chap.scenes[sceneIndex] as any)[field] = val;
      setScript({ ...next });
    }
  };

  const handleSaveCurrentScript = async () => {
    if (!script || !script.projectFolder) return;
    try {
      await window.electronAPI.docucraftSaveScript({
        projectFolder: script.projectFolder,
        script
      });
      alert('Documentary script saved successfully!');
    } catch (err: any) {
      alert('Failed to save script: ' + err.message);
    }
  };
  const handleGenerateScript = async () => {
    if (!topic.trim()) {
      alert('Please enter or select a documentary topic first');
      return;
    }
    setIsGeneratingScript(true);
    try {
      const res = await window.electronAPI.docucraftGenerateScript({
        topic,
        targetDurationMinutes,
        stylePreset,
        customStyleDesc,
        language,
        aiModel
      });
      setScript(res);
      setActiveTab('editor');
      loadProjectsList();
    } catch (err: any) {
      alert('Failed to generate script: ' + err.message);
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerateAllAudio = async () => {
    if (!script) return;
    setIsGeneratingAudio(true);
    try {
      const updated = await window.electronAPI.docucraftGenerateAudio({
        projectFolder: script.projectFolder,
        script,
        ttsService
      });
      setScript(updated);
    } catch (err: any) {
      alert('Audio generation failed: ' + err.message);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleGenerateAllImages = async () => {
    if (!script) return;
    setIsGeneratingImages(true);
    try {
      const updated = await window.electronAPI.docucraftGenerateImages({
        projectFolder: script.projectFolder,
        script,
        imageModel
      });
      setScript(updated);
    } catch (err: any) {
      alert('Image generation failed: ' + err.message);
    } finally {
      setIsGeneratingImages(false);
    }
  };

  const handleGenerateAllVideos = async () => {
    if (!script) return;
    setIsGeneratingVideos(true);
    try {
      const updated = await window.electronAPI.docucraftGenerateVideos({
        projectFolder: script.projectFolder,
        script,
        videoModel,
        videoDuration
      });
      setScript(updated);
    } catch (err: any) {
      alert('Video generation failed: ' + err.message);
    } finally {
      setIsGeneratingVideos(false);
    }
  };

  const handleAssembleMaster = async () => {
    if (!script) return;
    setIsAssembling(true);
    try {
      const result = await window.electronAPI.docucraftAssemble({
        projectFolder: script.projectFolder,
        script,
        bgmTrack,
        bgmVolume,
        showAnnotations,
        showChapterTitles,
        defaultFitMode
      });
      setScript(result.manifest);
      setActiveTab('master');
      loadProjectsList();
    } catch (err: any) {
      alert('Documentary assembly failed: ' + err.message);
    } finally {
      setIsAssembling(false);
    }
  };

  const handleGenerateShort = async (sceneId?: string) => {
    if (!script) return;
    setIsGeneratingShort(true);
    try {
      const res = await window.electronAPI.docucraftGenerateShort({
        projectFolder: script.projectFolder,
        script,
        sceneId
      });
      setActiveShort(res);
      setActiveTab('master');
    } catch (err: any) {
      alert('Failed to generate vertical short: ' + err.message);
    } finally {
      setIsGeneratingShort(false);
    }
  };

  const handleExtendVideo = async (chapIdx: number, scIdx: number) => {
    if (!script) return;
    const sc = script.chapters[chapIdx].scenes[scIdx];
    if (!sc.videoUrl) return;
    setExtendingSceneId(sc.id);
    try {
      const res = await window.electronAPI.docucraftExtendVideo({
        projectFolder: script.projectFolder,
        sceneId: sc.id,
        prompt: sc.videoAnimationPrompt || sc.imagePrompt,
        existingVideoUrl: sc.videoUrl,
        videoModel
      });
      handleUpdateScene(chapIdx, scIdx, 'videoUrl', res.videoUrl);
      alert('Scene video extended seamlessly with Part 2 motion clip!');
    } catch (err: any) {
      alert('Failed to extend video: ' + err.message);
    } finally {
      setExtendingSceneId(null);
    }
  };

  const handleUploadCustomMedia = async (chapIdx: number, scIdx: number) => {
    if (!script) return;
    const sc = script.chapters[chapIdx].scenes[scIdx];
    try {
      const res = await window.electronAPI.docucraftUploadCustomMedia({
        projectFolder: script.projectFolder,
        sceneId: sc.id
      });
      if (res.canceled || !res.url) return;
      if (res.mediaType === 'video') {
        handleUpdateScene(chapIdx, scIdx, 'videoUrl', res.url);
        handleUpdateScene(chapIdx, scIdx, 'isAnimated', true);
        setSceneMediaView(prev => ({ ...prev, [sc.id]: 'video' }));
      } else {
        handleUpdateScene(chapIdx, scIdx, 'imageUrl', res.url);
        setSceneMediaView(prev => ({ ...prev, [sc.id]: 'image' }));
      }
    } catch (err: any) {
      alert('Failed to upload custom media: ' + err.message);
    }
  };

  const handleOpenStockModal = (chapIdx: number, scIdx: number) => {
    if (!script) return;
    const sc = script.chapters[chapIdx].scenes[scIdx];
    setStockModalTarget({ chapIdx, scIdx, scene: sc });
    const initialQuery = sc.title || sc.imagePrompt || topic;
    setStockSearchQuery(initialQuery);
    setStockResults([]);
    performStockSearch(initialQuery, stockSource, stockMediaType);
  };

  const performStockSearch = async (
    query: string,
    source: 'all' | 'wikimedia' | 'archive_org' | 'pexels',
    mediaType: 'all' | 'video' | 'image'
  ) => {
    if (!query.trim()) return;
    setIsSearchingStock(true);
    try {
      const res = await window.electronAPI.docucraftSearchStock({
        query: query.trim(),
        source,
        mediaType,
        page: 1,
        perPage: 24,
        pexelsApiKey: pexelsApiKey.trim() || undefined
      });
      setStockResults(res.results || []);
      setPexelsConfigured(res.pexelsConfigured);
    } catch (err: any) {
      alert('Stock search error: ' + err.message);
    } finally {
      setIsSearchingStock(false);
    }
  };

  const handleSelectStockItem = async (item: any) => {
    if (!script || !stockModalTarget) return;
    const { chapIdx, scene } = stockModalTarget;
    setIsSelectingStock(true);
    setStockSelectedItemId(item.id);
    try {
      const res = await window.electronAPI.docucraftSelectStockMedia({
        projectFolder: script.projectFolder,
        chapterId: script.chapters[chapIdx].id,
        sceneId: scene.id,
        item,
        script
      });
      if (res.success && res.script) {
        setScript(res.script);
        if (res.mediaType === 'video') {
          setSceneMediaView(prev => ({ ...prev, [scene.id]: 'video' }));
        } else {
          setSceneMediaView(prev => ({ ...prev, [scene.id]: 'image' }));
        }
        setStockModalTarget(null);
      }
    } catch (err: any) {
      alert('Failed to apply B-Roll media: ' + err.message);
    } finally {
      setIsSelectingStock(false);
      setStockSelectedItemId(null);
    }
  };

  const handleAddSceneToChapter = async (chapId: string) => {
    if (!script) return;
    try {
      const res = await window.electronAPI.docucraftAddScene({
        projectFolder: script.projectFolder,
        script,
        chapterId: chapId
      });
      if (res.success && res.script) {
        setScript(res.script);
      }
    } catch (err: any) {
      alert('Failed to add scene: ' + err.message);
    }
  };

  const handleDeleteSceneFromChapter = async (chapId: string, sceneId: string) => {
    if (!script) return;
    if (!window.confirm('Are you sure you want to delete this scene?')) return;
    try {
      const res = await window.electronAPI.docucraftDeleteScene({
        projectFolder: script.projectFolder,
        script,
        chapterId: chapId,
        sceneId
      });
      if (res.success && res.script) {
        setScript(res.script);
      }
    } catch (err: any) {
      alert('Failed to delete scene: ' + err.message);
    }
  };

  const handleCopyTitle = (txt: string, idx: number) => {
    navigator.clipboard.writeText(txt);
    setCopiedTitleIdx(idx);
    setTimeout(() => setCopiedTitleIdx(null), 2000);
  };

  const handleCopyDescription = () => {
    if (!script?.youtubePackage?.description) return;
    navigator.clipboard.writeText(script.youtubePackage.description);
    setCopiedDesc(true);
    setTimeout(() => setCopiedDesc(false), 2000);
  };

  const handleCopyTags = () => {
    if (!script?.youtubePackage?.tags) return;
    navigator.clipboard.writeText(script.youtubePackage.tags.join(', '));
    setCopiedTags(true);
    setTimeout(() => setCopiedTags(false), 2000);
  };

  // YouTube Thumbnail Generation
  const handleGenerateThumbnails = async () => {
    if (!script) return;
    setIsGeneratingThumbnails(true);
    try {
      const results = await window.electronAPI.docucraftGenerateThumbnails({
        projectFolder: script.projectFolder,
        script,
        imageModel,
      });
      setThumbnails(results || []);
    } catch (err: any) {
      console.error('Thumbnail generation failed:', err);
      alert('Thumbnail generation failed: ' + err.message);
    } finally {
      setIsGeneratingThumbnails(false);
    }
  };

  const handleRegenerateThumbnail = async (idx: number) => {
    if (!script || !thumbnails[idx]) return;
    setRegeneratingThumbIdx(idx);
    try {
      const result = await window.electronAPI.docucraftRegenerateThumbnail({
        projectFolder: script.projectFolder,
        thumbIndex: idx,
        prompt: thumbnails[idx].prompt,
        imageModel,
      });
      setThumbnails(prev => prev.map((t, i) => i === idx ? { ...t, imageUrl: result.imageUrl, fileName: result.fileName, error: undefined } : t));
    } catch (err: any) {
      console.error('Thumbnail regen failed:', err);
    } finally {
      setRegeneratingThumbIdx(null);
    }
  };

  const handleRegenerateSingleImage = async (chapIdx: number, scIdx: number) => {
    if (!script) return;
    const sc = script.chapters[chapIdx].scenes[scIdx];
    try {
      const res = await window.electronAPI.docucraftRegenerateImage({
        projectFolder: script.projectFolder,
        sceneId: sc.id,
        prompt: sc.imagePrompt || sc.voiceoverText,
        imageModel
      });
      handleUpdateScene(chapIdx, scIdx, 'imageUrl', res.imageUrl);
    } catch (err: any) {
      alert('Failed to regenerate image: ' + err.message);
    }
  };

  const handleRegenerateSingleVideo = async (chapIdx: number, scIdx: number) => {
    if (!script) return;
    const sc = script.chapters[chapIdx].scenes[scIdx];
    try {
      const res = await window.electronAPI.docucraftRegenerateVideo({
        projectFolder: script.projectFolder,
        sceneId: sc.id,
        prompt: sc.videoAnimationPrompt || sc.imagePrompt,
        imageUrl: sc.imageUrl,
        videoModel
      });
      handleUpdateScene(chapIdx, scIdx, 'videoUrl', res.videoUrl);
    } catch (err: any) {
      alert('Failed to regenerate video: ' + err.message);
    }
  };

  const handleRegenerateSingleAudio = async (chapIdx: number, scIdx: number) => {
    if (!script) return;
    const sc = script.chapters[chapIdx].scenes[scIdx];
    try {
      const updated = await window.electronAPI.docucraftGenerateAudio({
        projectFolder: script.projectFolder,
        script,
        ttsService,
        sceneId: sc.id
      });
      setScript(updated);
    } catch (err: any) {
      alert('Failed to regenerate voiceover: ' + err.message);
    }
  };

  const handleDecomposeShots = async (chapIdx: number, scIdx: number) => {
    if (!script) return;
    const sc = script.chapters[chapIdx].scenes[scIdx];
    setDecomposingScenes(prev => ({...prev, [sc.id]: true}));
    try {
      const shots = await window.electronAPI.docucraftDecomposeShots({
        voiceoverText: sc.voiceoverText,
        duration: sc.audioDuration || (sc.voiceoverText ? Math.round(sc.voiceoverText.split(/\s+/).length / 2.2) : 18),
        imagePrompt: sc.imagePrompt,
        stylePreset: script.stylePreset,
        language: script.language,
        aiModel
      });
      if (shots && Array.isArray(shots)) {
        handleUpdateScene(chapIdx, scIdx, 'shots', shots);
      }
    } catch (err: any) {
      alert('Failed to decompose scene shots: ' + err.message);
    } finally {
      setDecomposingScenes(prev => ({...prev, [sc.id]: false}));
    }
  };

  const handleGenerateShotChain = async (chapIdx: number, scIdx: number) => {
    if (!script) return;
    const sc = script.chapters[chapIdx].scenes[scIdx];
    if (!sc.shots || sc.shots.length === 0) {
      alert('Please decompose this scene into narrative shots first');
      return;
    }
    setChainingScenes(prev => ({...prev, [sc.id]: true}));
    try {
      const updatedShots = await window.electronAPI.docucraftGenerateShotChain({
        projectFolder: script.projectFolder,
        sceneId: sc.id,
        shots: sc.shots,
        videoModel,
        baseImageUrl: sc.imageUrl
      });
      if (updatedShots && Array.isArray(updatedShots)) {
        handleUpdateScene(chapIdx, scIdx, 'shots', updatedShots);
      }
    } catch (err: any) {
      alert('Auto-chain generation failed: ' + err.message);
    } finally {
      setChainingScenes(prev => ({...prev, [sc.id]: false}));
    }
  };

  const handleRegenerateSingleShot = async (chapIdx: number, scIdx: number, shotIndex: number) => {
    if (!script) return;
    const sc = script.chapters[chapIdx].scenes[scIdx];
    if (!sc.shots || !sc.shots[shotIndex]) return;
    const targetShot = sc.shots[shotIndex];
    const shotKey = `${sc.id}_${shotIndex}`;
    setGeneratingShots(prev => ({...prev, [shotKey]: true}));
    try {
      const referenceImageUrl = shotIndex > 0 && sc.shots[shotIndex - 1]?.videoUrl
        ? sc.shots[shotIndex - 1].videoUrl
        : sc.imageUrl;
      const res = await window.electronAPI.docucraftGenerateSingleShot({
        projectFolder: script.projectFolder,
        sceneId: sc.id,
        shotIndex,
        prompt: targetShot.prompt,
        duration: targetShot.duration,
        videoModel,
        referenceImageUrl
      });
      if (res && res.videoUrl) {
        const nextShots = [...sc.shots];
        nextShots[shotIndex] = { ...targetShot, videoUrl: res.videoUrl, status: 'ready' };
        handleUpdateScene(chapIdx, scIdx, 'shots', nextShots);
      }
    } catch (err: any) {
      alert('Single shot generation failed: ' + err.message);
    } finally {
      setGeneratingShots(prev => ({...prev, [shotKey]: false}));
    }
  };

  const handleCopyYtChapters = () => {
    if (!script?.youtubeChapters) return;
    navigator.clipboard.writeText(script.youtubeChapters);
    setCopiedYtChapters(true);
    setTimeout(() => setCopiedYtChapters(false), 2000);
  };

  const handleLoadProject = (proj: DocuCraftProjectSummary) => {
    if (proj.manifest) {
      setScript(proj.manifest);
      setTopic(proj.manifest.title);
      setActiveTab('editor');
    }
  };

  return (
    <div className="docucraft-container">
      {/* ── Left Sidebar / Configuration ────────────────────────────── */}
      <div className="docucraft-sidebar">
        <div className="docucraft-brand">
          <div className="docucraft-brand-icon">📜</div>
          <div>
            <h2 className="docucraft-brand-title">DocuCraft</h2>
            <div className="docucraft-brand-sub">Long-Form Documentary Studio</div>
          </div>
        </div>

        {/* View switcher */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className={`docucraft-pill ${activeTab === 'editor' ? 'active' : ''}`}
            onClick={() => setActiveTab('editor')}
          >
            🖋️ Script & Scenes
          </button>
          <button
            className={`docucraft-pill ${activeTab === 'master' ? 'active' : ''}`}
            onClick={() => setActiveTab('master')}
          >
            🎞️ Master Assembly
          </button>
          <button
            className={`docucraft-pill ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            📂 Archive ({projects.length})
          </button>
        </div>

        {/* Topic & Inspiration */}
        <div className="docucraft-section">
          <label className="docucraft-label">Documentary Subject / Topic</label>
          <textarea
            className="docucraft-textarea"
            placeholder="e.g. Autonomous permaculture ecosystems: secrets of living soil and companion plant guilds..."
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />

          <div style={{ fontSize: '0.7rem', color: '#8898aa', marginTop: '2px' }}>Inspiration Presets:</div>
          <div className="docucraft-pills">
            {INSPIRATION_PRESETS.map((p, i) => (
              <button
                key={i}
                className="docucraft-pill"
                onClick={() => setTopic(p.topic)}
                title={p.topic}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Target Duration & Language */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div className="docucraft-section">
            <label className="docucraft-label">Duration</label>
            <select
              className="docucraft-select"
              value={targetDurationMinutes}
              onChange={(e) => setTargetDurationMinutes(Number(e.target.value))}
            >
              <option value={10}>10 min (4 ch × 4 sc)</option>
              <option value={15}>15 min (5 ch × 5 sc)</option>
              <option value={20}>20 min (6 ch × 5 sc)</option>
              <option value={25}>25 min (7 ch × 5 sc)</option>
              <option value={30}>30 min (7 ch × 6 sc)</option>
              <option value={35}>35 min (8 ch × 6 sc)</option>
            </select>
          </div>

          <div className="docucraft-section">
            <label className="docucraft-label">Language</label>
            <select
              className="docucraft-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Style Preset */}
        <div className="docucraft-section">
          <label className="docucraft-label">Visual Art Preset</label>
          <select
            className="docucraft-select"
            value={stylePreset}
            onChange={(e) => setStylePreset(e.target.value)}
          >
            {STYLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {stylePreset === 'custom' && (
            <textarea
              className="docucraft-textarea"
              style={{ minHeight: '60px', marginTop: '6px' }}
              placeholder="Describe your custom documentary art style..."
              value={customStyleDesc}
              onChange={(e) => setCustomStyleDesc(e.target.value)}
            />
          )}
        </div>

        {/* Engines configuration */}
        <div className="docucraft-section">
          <label className="docucraft-label">AI Generation Engines</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#7a8c9e', marginBottom: '3px' }}>Script LLM</div>
              <select
                className="docucraft-select"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value as any)}
              >
                <option value="custom">Gemini Proxy</option>
                <option value="omniroute">Claude Sonnet</option>
                <option value="pollinations">Pollinations</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#7a8c9e', marginBottom: '3px' }}>Voiceover TTS</div>
              <select
                className="docucraft-select"
                value={ttsService}
                onChange={(e) => setTtsService(e.target.value as any)}
              >
                <option value="voiceapi">VoiceAPI (Lumean)</option>
                <option value="elevenlabs">ElevenLabs</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#7a8c9e', marginBottom: '3px' }}>Illustration AI</div>
              <select
                className="docucraft-select"
                value={imageModel}
                onChange={(e) => setImageModel(e.target.value)}
              >
                {IMAGE_MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#7a8c9e', marginBottom: '3px' }}>Climax Video AI</div>
              <select
                className="docucraft-select"
                value={videoModel}
                onChange={(e) => setVideoModel(e.target.value)}
              >
                {VIDEO_MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#7a8c9e', marginBottom: '3px' }}>Video Length</div>
              <select
                className="docucraft-select"
                value={videoDuration}
                onChange={(e) => setVideoDuration(Number(e.target.value))}
              >
                <option value={5}>5 seconds</option>
                <option value={7}>7 seconds</option>
                <option value={9}>9 seconds</option>
                <option value={10}>10 seconds</option>
              </select>
            </div>
          </div>
        </div>

        {/* Primary Generation Trigger */}
        <button
          className="docucraft-btn-primary"
          onClick={handleGenerateScript}
          disabled={isGeneratingScript || !topic.trim()}
        >
          {isGeneratingScript ? '⏳ Conceiving Documentary...' : '📜 Generate Script Manifest'}
        </button>
      </div>
      {/* ── Main Workspace ─────────────────────────────────────────── */}
      <div className="docucraft-main">
        {/* Progress Banner */}
        {progress && (
          <div className="docucraft-progress-card">
            <div className="docucraft-progress-header">
              <span>{progress.status}</span>
              <span style={{ color: '#d49547' }}>{progress.progress}%</span>
            </div>
            <div className="docucraft-progress-track">
              <div
                className="docucraft-progress-fill"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Empty State when no script */}
        {activeTab === 'editor' && !script && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#64748b',
            gap: '24px',
            background: '#13161c',
            borderRadius: '12px',
            margin: '20px',
            padding: '40px'
          }}>
            <div style={{ fontSize: '3.5rem', opacity: 0.8 }}>🎬</div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: '#f1f5f9', marginBottom: '12px', fontSize: '1.8rem' }}>DocuCraft Studio</h2>
              <p style={{ margin: '0 auto', maxWidth: '500px', lineHeight: 1.6, fontSize: '1.05rem' }}>
                Start a new documentary by configuring the settings on the left and clicking <b>Generate Script Manifest</b>.
              </p>
              <p style={{ margin: '16px auto 0', maxWidth: '500px', lineHeight: 1.6, fontSize: '1.05rem', color: '#d49547' }}>
                System crashed? Lost your work? Don't worry! Every step is automatically saved to your disk.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginTop: '20px' }}>
              {projects.length > 0 && (
                <button
                  className="docucraft-btn-primary"
                  onClick={() => handleLoadProject(projects[0])}
                  style={{ padding: '14px 28px', fontSize: '1.1rem', fontWeight: 'bold' }}
                >
                  🚀 Resume Last Project ({projects[0].title})
                </button>
              )}
              <button
                className="docucraft-btn-secondary"
                onClick={() => setActiveTab('history')}
                style={{ padding: '14px 28px', fontSize: '1.1rem' }}
              >
                📂 Open Project Archive
              </button>
            </div>
          </div>
        )}

        {/* View 1: Editor View */}
        {activeTab === 'editor' && script && (
          <>
            {/* Header / Overview Card */}
            <div className="docucraft-header-card">
              <div className="docucraft-header-meta">
                <span className="docucraft-badge docucraft-badge-accent">
                  {script.language || 'English'}
                </span>
                <span className="docucraft-badge">
                  {script.stylePreset?.replace(/_/g, ' ')}
                </span>
                <span className="docucraft-badge">
                  ⏱️ ~{script.targetDurationMinutes || 10} min ({script.chapters?.length || 0} chapters)
                </span>
                {script.projectFolder && (
                  <span className="docucraft-badge" style={{ color: '#7dd3fc' }}>
                    📁 {script.projectFolder}
                  </span>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                  <button
                    className="docucraft-btn-secondary docucraft-btn-sm"
                    onClick={handleSaveCurrentScript}
                  >
                    💾 Save Manifest
                  </button>
                </div>
              </div>

              <input
                className="docucraft-title-input"
                value={script.title || ''}
                placeholder="Documentary Title"
                onChange={(e) => setScript({ ...script, title: e.target.value })}
              />

              <textarea
                className="docucraft-synopsis-input"
                rows={2}
                value={script.synopsis || ''}
                placeholder="Documentary Synopsis..."
                onChange={(e) => setScript({ ...script, synopsis: e.target.value })}
              />
            </div>

            {/* Batch Action Bar */}
            <div className="docucraft-action-bar">
              <div className="docucraft-action-group">
                <button
                  className="docucraft-btn-secondary"
                  onClick={handleGenerateAllAudio}
                  disabled={isGeneratingAudio}
                >
                  {isGeneratingAudio ? '⏳ Synthesizing Audio...' : '🎙️ Generate Voiceover (All)'}
                </button>
                <button
                  className="docucraft-btn-secondary"
                  onClick={handleGenerateAllImages}
                  disabled={isGeneratingImages}
                >
                  {isGeneratingImages ? '⏳ Illustrating...' : '🎨 Generate Images (All)'}
                </button>
                <button
                  className="docucraft-btn-secondary"
                  onClick={handleGenerateAllVideos}
                  disabled={isGeneratingVideos}
                >
                  {isGeneratingVideos ? '⏳ Animating...' : '✨ Animate Climax Scenes'}
                </button>
              </div>

              <div className="docucraft-action-group">
                <button
                  className="docucraft-btn-primary docucraft-btn-sm"
                  onClick={handleAssembleMaster}
                  disabled={isAssembling}
                >
                  {isAssembling ? '⏳ Assembling Film...' : '🎞️ Assemble Master Video'}
                </button>
                <button
                  className="docucraft-btn-secondary docucraft-btn-sm"
                  onClick={() => handleGenerateShort()}
                  disabled={isGeneratingShort}
                >
                  {isGeneratingShort ? '⏳ Rendering 9:16...' : '📱 Export 9:16 Short'}
                </button>
              </div>
            </div>

            {/* Chapters and Scenes Hierarchy */}
            <div className="docucraft-chapters-container">
              {script.chapters?.map((chap, cIdx) => {
                const isCollapsed = collapsedChapters[chap.id];
                return (
                  <div key={chap.id || cIdx} className="docucraft-chapter-card">
                    <div
                      className="docucraft-chapter-header"
                      onClick={() => toggleChapterCollapse(chap.id)}
                    >
                      <div className="docucraft-chapter-info">
                        <span className="docucraft-chapter-num">Chapter {chap.index || cIdx + 1}</span>
                        <span className="docucraft-chapter-title">{chap.title}</span>
                        <span className="docucraft-chapter-duration">
                          ⏱️ {chap.targetDuration || '02:30'} ({chap.scenes?.length || 0} scenes)
                        </span>
                      </div>
                      <span style={{ color: '#8da0b3', fontSize: '0.85rem' }}>
                        {isCollapsed ? '▼ Expand' : '▲ Collapse'}
                      </span>
                    </div>

                    {!isCollapsed && chap.objective && (
                      <div className="docucraft-chapter-objective">
                        🎯 Objective: {chap.objective}
                      </div>
                    )}

                    {!isCollapsed && (
                      <div className="docucraft-scene-grid">
                        {chap.scenes?.map((scene, sIdx) => {
                          const words = (scene.voiceoverText || '').split(/\s+/).filter(Boolean).length;
                          return (
                            <div
                              key={scene.id || sIdx}
                              className={`docucraft-scene-card ${scene.isAnimated ? 'animated-card' : ''}`}
                            >
                              <div className="docucraft-scene-top">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span className="docucraft-scene-id">
                                    Scene {chap.index || cIdx + 1}.{scene.sceneIndex || sIdx + 1}
                                  </span>
                                  <button
                                    type="button"
                                    className="docucraft-btn-danger-sm"
                                    onClick={() => handleDeleteSceneFromChapter(chap.id, scene.id)}
                                    title="Delete scene"
                                  >
                                    🗑️
                                  </button>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {scene.isAnimated && scene.videoUrl && (
                                    <select
                                      className="docucraft-fit-select"
                                      value={scene.videoFitMode || 'drift'}
                                      onChange={(e) => handleUpdateScene(cIdx, sIdx, 'videoFitMode', e.target.value)}
                                      title="Video motion fit mode"
                                    >
                                      <option value="drift">🌊 Smart Drift (No freeze)</option>
                                      <option value="loop">🔁 Loop Clip</option>
                                      <option value="slowmo">⏳ Slow-Motion</option>
                                      <option value="pingpong">🏓 Ping-Pong</option>
                                      <option value="freeze">❄️ Static Hold</option>
                                    </select>
                                  )}

                                  <div
                                    className="docucraft-anim-toggle"
                                    onClick={() => handleUpdateScene(cIdx, sIdx, 'isAnimated', !scene.isAnimated)}
                                    title="Toggle Ken Burns vs Video clip"
                                  >
                                    {scene.isAnimated ? (
                                      <span className="docucraft-anim-badge badge-animated">✨ Climax Video</span>
                                    ) : (
                                      <span className="docucraft-anim-badge badge-static">🖼️ Ken Burns</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <input
                                className="docucraft-scene-title-input"
                                value={scene.title || ''}
                                placeholder="Scene Title..."
                                onChange={(e) => handleUpdateScene(cIdx, sIdx, 'title', e.target.value)}
                              />

                              <div className="docucraft-narration-box">
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#7e8f9f' }}>
                                  <span>Narration ({words} words)</span>
                                  <span>Est: ~{scene.audioDuration || Math.round(words / 2.2)}s</span>
                                </div>
                                <textarea
                                  className="docucraft-textarea"
                                  style={{ minHeight: '75px', fontSize: '0.8rem' }}
                                  value={scene.voiceoverText || ''}
                                  placeholder="Voiceover narration in chosen language..."
                                  onChange={(e) => handleUpdateScene(cIdx, sIdx, 'voiceoverText', e.target.value)}
                                />
                              </div>

                              {scene.annotation && (
                                <div className="docucraft-annotation-tag">
                                  <span>✒️</span> {scene.annotation}
                                </div>
                              )}

                              {/* Multi-Shot Narrative Chaining Storyboard */}
                              {scene.shots && scene.shots.length > 0 ? (
                                <div className="docucraft-shots-container">
                                  <div className="docucraft-shots-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#f3f4f6' }}>
                                        🎬 Multi-Shot Sequence ({scene.shots.length} cuts)
                                      </span>
                                      <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>
                                        ~{scene.shots.reduce((acc, s) => acc + (s.duration || 4), 0)}s
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <button
                                        type="button"
                                        className="docucraft-btn-secondary docucraft-btn-sm"
                                        style={{ fontSize: '0.66rem', padding: '2px 7px' }}
                                        onClick={() => handleDecomposeShots(cIdx, sIdx)}
                                        disabled={decomposingScenes[scene.id]}
                                        title="Re-analyze voiceover and regenerate shot narrative chain"
                                      >
                                        {decomposingScenes[scene.id] ? '⏳ Analyzing...' : '🔄 Re-decompose'}
                                      </button>
                                      <button
                                        type="button"
                                        className="docucraft-btn-sm"
                                        style={{
                                          background: 'linear-gradient(135deg, #d97706, #b45309)',
                                          border: 'none',
                                          color: '#fff',
                                          fontWeight: 700,
                                          fontSize: '0.66rem',
                                          padding: '3px 9px',
                                          borderRadius: '4px',
                                          cursor: chainingScenes[scene.id] ? 'wait' : 'pointer'
                                        }}
                                        onClick={() => handleGenerateShotChain(cIdx, sIdx)}
                                        disabled={chainingScenes[scene.id]}
                                        title="Sequential Last-to-First Frame Chained Video Generation"
                                      >
                                        {chainingScenes[scene.id] ? '⚡ Chaining Videos...' : '🔗 Auto-Chain All'}
                                      </button>
                                    </div>
                                  </div>

                                  <div className="docucraft-shots-timeline">
                                    {scene.shots.map((shot, shotIdx) => {
                                      const isThisShotGenerating = generatingShots[`${scene.id}_${shot.index}`] || shot.status === 'generating';
                                      const roleClass = `role-${shot.role || 'cause'}`;
                                      return (
                                        <div
                                          key={shot.id || shotIdx}
                                          className={`docucraft-shot-card ${shot.status || 'idle'} ${isThisShotGenerating ? 'generating' : ''}`}
                                        >
                                          <div className="docucraft-shot-badge-row">
                                            <span className={`docucraft-shot-role-badge ${roleClass}`}>
                                              #{shot.index + 1} {shot.role}
                                            </span>
                                            <span className="docucraft-shot-dur">{shot.duration || 4}s</span>
                                          </div>

                                          <div
                                            className="docucraft-shot-preview"
                                            onClick={() => {
                                              if (shot.videoUrl) setEnlargedMedia({ url: shot.videoUrl, type: 'video' });
                                              else if (shot.sourceImage) setEnlargedMedia({ url: shot.sourceImage, type: 'image' });
                                            }}
                                            title={shot.prompt}
                                          >
                                            {shot.videoUrl ? (
                                              <video src={shot.videoUrl} preload="metadata" />
                                            ) : shot.sourceImage ? (
                                              <img src={shot.sourceImage} alt={`Shot ${shot.index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                              <div className="docucraft-shot-placeholder">
                                                <span>{isThisShotGenerating ? '⏳' : '🎬'}</span>
                                                <span>{isThisShotGenerating ? 'Rendering' : 'Pending'}</span>
                                              </div>
                                            )}
                                          </div>

                                          <div className="docucraft-shot-prompt-tooltip" title={shot.prompt}>
                                            {shot.prompt}
                                          </div>

                                          <div className="docucraft-shot-actions">
                                            <button
                                              type="button"
                                              className="docucraft-btn-secondary"
                                              style={{ fontSize: '0.62rem', padding: '1px 5px', minWidth: 'auto' }}
                                              onClick={() => handleRegenerateSingleShot(cIdx, sIdx, shot.index)}
                                              disabled={isThisShotGenerating || chainingScenes[scene.id]}
                                              title="Render / Regenerate this single shot"
                                            >
                                              {isThisShotGenerating ? '⏳' : '▶ Render'}
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'flex-end' }}>
                                  <button
                                    type="button"
                                    className="docucraft-btn-secondary docucraft-btn-sm"
                                    style={{
                                      borderColor: 'rgba(217, 119, 6, 0.4)',
                                      color: '#fbbf24',
                                      fontSize: '0.68rem',
                                      padding: '3px 8px'
                                    }}
                                    onClick={() => handleDecomposeShots(cIdx, sIdx)}
                                    disabled={decomposingScenes[scene.id]}
                                    title="Break scene into 3-5 causal narrative shots (origins → action → transformation → culmination)"
                                  >
                                    {decomposingScenes[scene.id] ? '⏳ Analyzing story chain...' : '⚡ Multi-Shot Storyboard (3-5 Cuts)'}
                                  </button>
                                </div>
                              )}

                              {/* Media Previews */}
                              <div className="docucraft-media-container">
                                {(() => {
                                  const hasVid = !!scene.videoUrl;
                                  const hasImg = !!scene.imageUrl;
                                  const activeView = sceneMediaView[scene.id] || (hasVid ? 'video' : 'image');

                                  return (
                                    <div className="docucraft-preview-stage">
                                      {/* Mode switcher if both video and image are available */}
                                      {hasVid && hasImg && (
                                        <div className="docucraft-preview-switcher" onClick={(e) => e.stopPropagation()}>
                                          <button
                                            type="button"
                                            className={`docucraft-preview-switch-btn ${activeView === 'video' ? 'active' : ''}`}
                                            onClick={() => setSceneMediaView(prev => ({ ...prev, [scene.id]: 'video' }))}
                                          >
                                            🎬 Video
                                          </button>
                                          <button
                                            type="button"
                                            className={`docucraft-preview-switch-btn ${activeView === 'image' ? 'active' : ''}`}
                                            onClick={() => setSceneMediaView(prev => ({ ...prev, [scene.id]: 'image' }))}
                                          >
                                            🖼️ Image
                                          </button>
                                        </div>
                                      )}

                                      {/* Dedicated Enlarge button */}
                                      {(hasVid || hasImg) && (
                                        <button
                                          type="button"
                                          className="docucraft-preview-expand-btn"
                                          title="View enlarged media"
                                          onClick={() => {
                                            if (activeView === 'video' && scene.videoUrl) {
                                              setEnlargedMedia({ url: scene.videoUrl, type: 'video' });
                                            } else if (scene.imageUrl) {
                                              setEnlargedMedia({ url: scene.imageUrl, type: 'image' });
                                            }
                                          }}
                                        >
                                          ⛶
                                        </button>
                                      )}

                                      {/* Display Video, Image, or Empty placeholder */}
                                      {activeView === 'video' && scene.videoUrl ? (
                                        <video
                                          className="docucraft-preview-vid"
                                          src={scene.videoUrl}
                                          poster={scene.imageUrl || undefined}
                                          preload="metadata"
                                          controls
                                          onError={(e) => console.error('[DocuCraft] Video load error:', scene.videoUrl, e)}
                                        />
                                      ) : scene.imageUrl ? (
                                        <img
                                          className="docucraft-preview-img"
                                          src={scene.imageUrl}
                                          alt={scene.title}
                                          loading="lazy"
                                          onClick={() => setEnlargedMedia({ url: scene.imageUrl!, type: 'image' })}
                                          onError={(e) => console.error('[DocuCraft] Image load error:', scene.imageUrl, e)}
                                        />
                                      ) : (
                                        <div className="docucraft-preview-empty">
                                          <span>🖼️</span>
                                          <span>No illustration yet</span>
                                        </div>
                                      )}

                                      {/* B-Roll source badge if applied */}
                                      {scene.brollMeta && (
                                        <div style={{
                                          position: 'absolute',
                                          bottom: '8px',
                                          left: '8px',
                                          background: 'rgba(15, 23, 42, 0.88)',
                                          backdropFilter: 'blur(4px)',
                                          border: '1px solid rgba(52, 211, 153, 0.5)',
                                          color: '#6ee7b7',
                                          borderRadius: '4px',
                                          padding: '2px 7px',
                                          fontSize: '0.68rem',
                                          fontWeight: 600,
                                          zIndex: 5,
                                          pointerEvents: 'none',
                                          maxWidth: '85%',
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis'
                                        }} title={`${scene.brollMeta.title} (${scene.brollMeta.sourceName || scene.brollMeta.source})`}>
                                          🏛️ {scene.brollMeta.sourceName || scene.brollMeta.source}: {scene.brollMeta.title}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}

                                {scene.audioUrl && (
                                  <div className="docucraft-audio-bar">
                                    <audio
                                      className="docucraft-audio-player"
                                      src={scene.audioUrl}
                                      preload="metadata"
                                      controls
                                      onError={(e) => console.error('[DocuCraft] Audio load error:', scene.audioUrl, e)}
                                    />
                                  </div>
                                )}

                                <div className="docucraft-scene-btn-row">
                                  <button
                                    className="docucraft-btn-secondary docucraft-btn-sm"
                                    onClick={() => handleRegenerateSingleAudio(cIdx, sIdx)}
                                    title="Regenerate voiceover audio"
                                  >
                                    🎙️ Voice
                                  </button>
                                  <button
                                    className="docucraft-btn-secondary docucraft-btn-sm"
                                    onClick={() => handleRegenerateSingleImage(cIdx, sIdx)}
                                    title="Regenerate illustration"
                                  >
                                    🎨 Image
                                  </button>
                                  <button
                                    className="docucraft-btn-secondary docucraft-btn-sm"
                                    onClick={() => handleUploadCustomMedia(cIdx, sIdx)}
                                    title="Upload custom archival illustration or video"
                                  >
                                    📁 Upload
                                  </button>
                                  <button
                                    className="docucraft-btn-secondary docucraft-btn-sm"
                                    style={{ borderColor: '#059669', color: '#6ee7b7' }}
                                    onClick={() => handleOpenStockModal(cIdx, sIdx)}
                                    title="Search free archival & stock B-Roll (Wikimedia Commons, Pexels, Archive.org)"
                                  >
                                    🔍 B-Roll
                                  </button>
                                  <button
                                    className="docucraft-btn-secondary docucraft-btn-sm"
                                    style={{ borderColor: '#d97706', color: '#fbbf24' }}
                                    onClick={() => handleDecomposeShots(cIdx, sIdx)}
                                    disabled={decomposingScenes[scene.id]}
                                    title="Decompose scene into 3-5 causal narrative shots (origins → action → transformation → culmination)"
                                  >
                                    {decomposingScenes[scene.id] ? '⏳ Analyzing...' : `🎞️ Shots (${scene.shots?.length || 0})`}
                                  </button>
                                  {scene.isAnimated && (
                                    <button
                                      className="docucraft-btn-secondary docucraft-btn-sm"
                                      onClick={() => handleRegenerateSingleVideo(cIdx, sIdx)}
                                      title="Animate key scene"
                                    >
                                      🎬 Video
                                    </button>
                                  )}
                                  {scene.isAnimated && scene.videoUrl && (
                                    <button
                                      className="docucraft-btn-secondary docucraft-btn-sm"
                                      style={{ borderColor: '#d49547', color: '#f7ca88' }}
                                      onClick={() => handleExtendVideo(cIdx, sIdx)}
                                      disabled={extendingSceneId === scene.id}
                                      title="Extend video with an additional 5-10s motion clip"
                                    >
                                      {extendingSceneId === scene.id ? '⏳ Extending...' : '⏩ Extend (Pt. 2)'}
                                    </button>
                                  )}
                                  <button
                                    className="docucraft-btn-secondary docucraft-btn-sm"
                                    onClick={() => handleGenerateShort(scene.id)}
                                    title="Export this scene as 9:16 short"
                                  >
                                    📱 Short
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!isCollapsed && (
                      <div className="docucraft-add-scene-bar">
                        <button
                          type="button"
                          className="docucraft-add-scene-btn"
                          onClick={() => handleAddSceneToChapter(chap.id)}
                        >
                          ➕ Add Scene to Chapter {chap.index || cIdx + 1}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
        {/* Empty state when no script yet */}
        {!script && activeTab !== 'history' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '380px',
            textAlign: 'center',
            background: '#13161c',
            border: '1px dashed #28313e',
            borderRadius: '12px',
            padding: '30px'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📜</div>
            <h3 style={{ margin: '0 0 8px', color: '#e2e8f0', fontSize: '1.25rem' }}>No Documentary Manifest Loaded</h3>
            <p style={{ margin: 0, color: '#8898aa', maxWidth: '480px', fontSize: '0.85rem', lineHeight: 1.5 }}>
              Choose a topic from the inspiration presets on the left or type your own subject, configure your duration and art style, then click "Generate Script Manifest" to begin crafting your documentary.
            </p>
          </div>
        )}

        {/* View 2: Master Assembly Panel */}
        {activeTab === 'master' && (
          <div className="docucraft-assembly-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: '1.2rem' }}>🎞️ Master Documentary Assembly & Broadcast</h3>
                <div style={{ fontSize: '0.78rem', color: '#8ca0b3', marginTop: '3px' }}>
                  Ken Burns pans, keyframe animations, audio normalization, and YouTube Chapter metadata.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="docucraft-btn-primary"
                  onClick={handleAssembleMaster}
                  disabled={isAssembling || !script}
                >
                  {isAssembling ? '⏳ Assembling Film...' : '🎬 Re-Assemble Documentary'}
                </button>
              </div>
            </div>

            {/* Broadcast Assembly & Audio Settings */}
            <div style={{
              display: 'flex',
              gap: '16px',
              alignItems: 'center',
              flexWrap: 'wrap',
              background: '#11141a',
              padding: '14px 18px',
              borderRadius: '8px',
              border: '1px solid #202733'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>🎵 BGM Track:</span>
                <select
                  className="docucraft-select"
                  style={{ width: '180px' }}
                  value={bgmTrack}
                  onChange={(e) => setBgmTrack(e.target.value)}
                >
                  <option value="">No Background Music</option>
                  {bgmTracks.map(t => (
                    <option key={t.filename} value={t.filename}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>
                  Volume: {Math.round(bgmVolume * 100)}%
                </span>
                <input
                  type="range"
                  min="0.02"
                  max="0.30"
                  step="0.01"
                  value={bgmVolume}
                  onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
                  style={{ width: '90px' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>🌊 Motion Fit:</span>
                <select
                  className="docucraft-select"
                  style={{ width: '160px' }}
                  value={defaultFitMode}
                  onChange={(e) => setDefaultFitMode(e.target.value as any)}
                >
                  <option value="drift">Smart Drift (No Freeze)</option>
                  <option value="loop">Continuous Loop</option>
                  <option value="slowmo">Cinematic Slow-Mo</option>
                  <option value="pingpong">Ping-Pong Bounce</option>
                  <option value="freeze">Static Hold</option>
                </select>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#cbd5e1', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showAnnotations}
                  onChange={(e) => setShowAnnotations(e.target.checked)}
                />
                Archival Plates (Fig. X)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#cbd5e1', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showChapterTitles}
                  onChange={(e) => setShowChapterTitles(e.target.checked)}
                />
                Chapter Title Cards
              </label>
            </div>

            <div className="docucraft-assembly-grid">
              {/* Final Video Player */}
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#cad5e2', marginBottom: '8px' }}>
                  📺 Master Film 1080p Stream
                </div>
                {script?.finalVideoUrl ? (
                  <video
                    className="docucraft-final-player"
                    src={script.finalVideoUrl}
                    controls
                  />
                ) : (
                  <div style={{
                    width: '100%',
                    aspectRatio: '16/9',
                    background: '#090b0e',
                    border: '1px dashed #232b37',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748b',
                    fontSize: '0.85rem',
                    gap: '8px'
                  }}>
                    <span style={{ fontSize: '2rem' }}>📽️</span>
                    <span>Documentary has not been assembled yet</span>
                  </div>
                )}

                {/* Vertical short preview if active */}
                {activeShort && (
                  <div style={{ marginTop: '16px', background: '#12161f', padding: '14px', borderRadius: '8px', border: '1px solid #232b38' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f7ca88', marginBottom: '8px' }}>
                      📱 Vertical Short (9:16) Export Ready: {activeShort.title}
                    </div>
                    <video
                      style={{ maxHeight: '360px', borderRadius: '6px', margin: '0 auto', display: 'block' }}
                      src={activeShort.shortUrl}
                      controls
                    />
                  </div>
                )}
              </div>

              {/* YouTube Broadcast Package Panel */}
              <div className="docucraft-yt-package-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1f2735', paddingBottom: '10px' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc' }}>
                    📦 YouTube Broadcast Package
                  </span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      className={`docucraft-preview-switch-btn ${ytPackageTab === 'titles' ? 'active' : ''}`}
                      onClick={() => setYtPackageTab('titles')}
                    >
                      🎯 Titles (A/B)
                    </button>
                    <button
                      type="button"
                      className={`docucraft-preview-switch-btn ${ytPackageTab === 'description' ? 'active' : ''}`}
                      onClick={() => setYtPackageTab('description')}
                    >
                      📝 Description
                    </button>
                    <button
                      type="button"
                      className={`docucraft-preview-switch-btn ${ytPackageTab === 'chapters' ? 'active' : ''}`}
                      onClick={() => setYtPackageTab('chapters')}
                    >
                      📑 Chapters
                    </button>
                    <button
                      type="button"
                      className={`docucraft-preview-switch-btn ${ytPackageTab === 'tags' ? 'active' : ''}`}
                      onClick={() => setYtPackageTab('tags')}
                    >
                      🏷️ Tags
                    </button>
                  </div>
                </div>

                {/* Tab: Title Variants */}
                {ytPackageTab === 'titles' && (
                  <div className="docucraft-yt-titles-list">
                    <div style={{ fontSize: '0.75rem', color: '#8898aa', marginBottom: '4px' }}>
                      A/B Testing Variants for Maximum YouTube Click-Through Rate (CTR):
                    </div>
                    {(script?.youtubePackage?.titleVariants || [script?.title || 'Documentary Title']).map((tVar: string, idx: number) => (
                      <div key={idx} className="docucraft-yt-title-item">
                        <span style={{ flex: 1 }}>{tVar}</span>
                        <button
                          type="button"
                          className="docucraft-btn-secondary docucraft-btn-sm"
                          onClick={() => handleCopyTitle(tVar, idx)}
                        >
                          {copiedTitleIdx === idx ? '✓ Copied' : '📋 Copy'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tab: Full SEO Description */}
                {ytPackageTab === 'description' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: '#8898aa' }}>Complete Video Description with Timestamps & Disclosure:</span>
                      <button
                        type="button"
                        className="docucraft-btn-secondary docucraft-btn-sm"
                        onClick={handleCopyDescription}
                        disabled={!script?.youtubePackage?.description}
                      >
                        {copiedDesc ? '✓ Copied!' : '📋 Copy Description'}
                      </button>
                    </div>
                    <textarea
                      className="docucraft-yt-chapters-textarea"
                      style={{ height: '220px' }}
                      value={script?.youtubePackage?.description || ''}
                      placeholder="Assemble documentary to generate full SEO description..."
                      readOnly
                    />
                  </div>
                )}

                {/* Tab: Timestamps & Chapters */}
                {ytPackageTab === 'chapters' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: '#8898aa' }}>YouTube Chapters for Scrub Bar:</span>
                      <button
                        type="button"
                        className="docucraft-btn-secondary docucraft-btn-sm"
                        onClick={handleCopyYtChapters}
                        disabled={!script?.youtubeChapters}
                      >
                        {copiedYtChapters ? '✓ Copied!' : '📋 Copy Timestamps'}
                      </button>
                    </div>
                    <textarea
                      className="docucraft-yt-chapters-textarea"
                      style={{ height: '220px' }}
                      value={script?.youtubeChapters || ''}
                      placeholder="00:00 - Introduction&#10;02:30 - Chapter 1..."
                      readOnly
                    />
                  </div>
                )}

                {/* Tab: Tags */}
                {ytPackageTab === 'tags' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: '#8898aa' }}>High-Intent Discovery Tags:</span>
                      <button
                        type="button"
                        className="docucraft-btn-secondary docucraft-btn-sm"
                        onClick={handleCopyTags}
                        disabled={!script?.youtubePackage?.tags}
                      >
                        {copiedTags ? '✓ Copied!' : '📋 Copy All Tags'}
                      </button>
                    </div>
                    <div className="docucraft-yt-tags-container">
                      {(script?.youtubePackage?.tags || []).map((tag: string, idx: number) => (
                        <span key={idx} className="docucraft-yt-tag-pill">
                          #{tag}
                        </span>
                      ))}
                      {(!script?.youtubePackage?.tags || script.youtubePackage.tags.length === 0) && (
                        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Assemble documentary to generate tags.</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── YouTube Publishing: Thumbnails + Description + Hashtags ────── */}
            <div style={{
              marginTop: '20px',
              background: '#11141a',
              border: '1px solid #1f2735',
              borderRadius: '12px',
              padding: '18px 20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#f8fafc' }}>
                  🎨 YouTube Thumbnails & Publishing
                </span>
                <button
                  type="button"
                  className="docucraft-btn-primary docucraft-btn-sm"
                  disabled={isGeneratingThumbnails || !script}
                  onClick={handleGenerateThumbnails}
                >
                  {isGeneratingThumbnails ? '⏳ Generating...' : '🖼️ Generate 4 Thumbnails'}
                </button>
              </div>

              {/* Thumbnail Grid — 4 covers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '18px' }}>
                {[0, 1, 2, 3].map(idx => {
                  const thumb = thumbnails[idx];
                  return (
                    <div key={idx} style={{
                      background: '#0d1017',
                      border: '1px solid #252d3a',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column'
                    }}>
                      {thumb?.imageUrl ? (
                        <div style={{ position: 'relative' }}>
                          <img
                            src={thumb.imageUrl}
                            alt={thumb.styleTitle}
                            style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block', cursor: 'pointer' }}
                            onClick={() => setEnlargedMedia({ url: thumb.imageUrl, type: 'image' })}
                          />
                          {thumb.overlayText && (
                            <div style={{
                              position: 'absolute',
                              bottom: '8px',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              background: 'rgba(0,0,0,0.75)',
                              color: '#fff',
                              padding: '3px 10px',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                              maxWidth: '95%',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {thumb.overlayText}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{
                          width: '100%',
                          aspectRatio: '16/9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#4a5568',
                          fontSize: '0.75rem',
                          background: '#0a0d12'
                        }}>
                          {thumb?.error ? '❌ Error' : `Cover ${idx + 1}`}
                        </div>
                      )}
                      <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.68rem', color: '#8898aa', fontWeight: 600 }}>
                          {thumb?.styleTitle || `Variant ${idx + 1}`}
                        </span>
                        {thumb?.imageUrl && (
                          <button
                            type="button"
                            className="docucraft-btn-secondary"
                            style={{ fontSize: '0.62rem', padding: '2px 6px' }}
                            disabled={regeneratingThumbIdx === idx}
                            onClick={() => handleRegenerateThumbnail(idx)}
                          >
                            {regeneratingThumbIdx === idx ? '⏳' : '🔄'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Description & Hashtags Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '14px' }}>
                {/* Video Description */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#cad5e2' }}>
                      📝 Video Description ({script?.language || 'French'})
                    </span>
                    <button
                      type="button"
                      className="docucraft-btn-secondary docucraft-btn-sm"
                      onClick={handleCopyDescription}
                      disabled={!script?.youtubePackage?.description}
                    >
                      {copiedDesc ? '✓ Copied!' : '📋 Copy'}
                    </button>
                  </div>
                  <textarea
                    className="docucraft-yt-chapters-textarea"
                    style={{ height: '140px', resize: 'vertical', fontSize: '0.78rem' }}
                    value={script?.youtubePackage?.description || ''}
                    placeholder="Assemble documentary to generate description..."
                    readOnly
                  />
                </div>

                {/* Hashtags */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#cad5e2' }}>
                      🏷️ Hashtags
                    </span>
                    <button
                      type="button"
                      className="docucraft-btn-secondary docucraft-btn-sm"
                      onClick={handleCopyTags}
                      disabled={!script?.youtubePackage?.tags}
                    >
                      {copiedTags ? '✓ Copied!' : '📋 Copy'}
                    </button>
                  </div>
                  <div style={{
                    background: '#0d1017',
                    border: '1px solid #232b38',
                    borderRadius: '8px',
                    padding: '10px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    minHeight: '140px',
                    alignContent: 'flex-start'
                  }}>
                    {(script?.youtubePackage?.tags || []).map((tag: string, idx: number) => (
                      <span key={idx} className="docucraft-yt-tag-pill">
                        #{tag}
                      </span>
                    ))}
                    {(!script?.youtubePackage?.tags || script.youtubePackage.tags.length === 0) && (
                      <span style={{ color: '#4a5568', fontSize: '0.75rem' }}>Assemble documentary to generate hashtags.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View 3: Archive / History View */}
        {activeTab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, color: '#f1f5f9' }}>📂 Saved Documentaries & Archives</h3>
              <button
                className="docucraft-btn-secondary docucraft-btn-sm"
                onClick={loadProjectsList}
              >
                🔄 Refresh Archive
              </button>
            </div>

            {projects.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '40px',
                background: '#13161c',
                borderRadius: '8px',
                color: '#64748b',
                fontSize: '0.85rem'
              }}>
                No previously generated documentaries found in DocuCraft/Projects.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                {projects.map((proj) => (
                  <div
                    key={proj.folderName}
                    style={{
                      background: '#161a22',
                      border: '1px solid #252d3a',
                      borderRadius: '10px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}
                  >
                    <div style={{ fontSize: '0.72rem', color: '#d49547', fontWeight: 700, textTransform: 'uppercase' }}>
                      {proj.language} • {proj.chaptersCount} Chapters
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f1f5f9', lineHeight: 1.35 }}>
                      {proj.title}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                      {new Date(proj.createdAt).toLocaleDateString()} {new Date(proj.createdAt).toLocaleTimeString()}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                      <button
                        className="docucraft-btn-primary docucraft-btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => handleLoadProject(proj)}
                      >
                        📂 Open Project
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {enlargedMedia && (
        <div className="docucraft-modal-overlay" onClick={() => setEnlargedMedia(null)}>
          <div className="docucraft-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="docucraft-modal-close" onClick={() => setEnlargedMedia(null)}>
              ✕
            </button>
            {enlargedMedia.type === 'video' ? (
              <video
                src={enlargedMedia.url}
                controls
                autoPlay
                style={{ maxWidth: '90vw', maxHeight: '85vh', display: 'block' }}
              />
            ) : (
              <img
                src={enlargedMedia.url}
                alt="Enlarged"
                style={{ maxWidth: '90vw', maxHeight: '85vh', display: 'block' }}
              />
            )}
          </div>
        </div>
      )}

      {/* Free Archival & Stock B-Roll Retrieval Modal */}
      {stockModalTarget && (
        <div className="docucraft-modal-overlay" onClick={() => !isSelectingStock && setStockModalTarget(null)}>
          <div className="docucraft-stock-modal" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="docucraft-stock-header">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.1rem' }}>🏛️</span>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: '#f8fafc', fontWeight: 700 }}>
                    Archival & Stock B-Roll Footage
                  </h3>
                  <span style={{
                    fontSize: '0.72rem',
                    background: '#064e3b',
                    color: '#6ee7b7',
                    border: '1px solid #059669',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontWeight: 600
                  }}>
                    Scène {stockModalTarget.scene.chapterIndex}.{stockModalTarget.scene.sceneIndex}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  Trouvez des vidéos ou images d'archives libres de droits pour enrichir la scène sans dépenser de tokens Veo/Kling.
                </div>
              </div>
              <button
                className="docucraft-modal-close"
                style={{ position: 'static' }}
                onClick={() => !isSelectingStock && setStockModalTarget(null)}
                disabled={isSelectingStock}
              >
                ✕
              </button>
            </div>

            {/* Search Bar & Filter Controls */}
            <div className="docucraft-stock-searchbar">
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  className="docucraft-input"
                  style={{ flex: 1, fontSize: '0.85rem' }}
                  placeholder="Rechercher des vidéos d'archives (ex: lavande récolte, Roman aqueduct, living soil microorganisms)..."
                  value={stockSearchQuery}
                  onChange={(e) => setStockSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      performStockSearch(stockSearchQuery, stockSource, stockMediaType);
                    }
                  }}
                />
                <button
                  className="docucraft-btn-primary docucraft-btn-sm"
                  style={{ minWidth: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  onClick={() => performStockSearch(stockSearchQuery, stockSource, stockMediaType)}
                  disabled={isSearchingStock}
                >
                  {isSearchingStock ? '⏳ Recherche...' : '🔍 Chercher'}
                </button>
              </div>

              {/* Source & Media Type Filters */}
              <div className="docucraft-stock-filters">
                <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>Source:</span>
                <button
                  type="button"
                  className={`docucraft-filter-pill ${stockSource === 'all' ? 'active' : ''}`}
                  onClick={() => {
                    setStockSource('all');
                    performStockSearch(stockSearchQuery, 'all', stockMediaType);
                  }}
                >
                  🌐 Toutes les sources
                </button>
                <button
                  type="button"
                  className={`docucraft-filter-pill ${stockSource === 'wikimedia' ? 'active' : ''}`}
                  onClick={() => {
                    setStockSource('wikimedia');
                    performStockSearch(stockSearchQuery, 'wikimedia', stockMediaType);
                  }}
                  title="Wikimedia Commons: 100% gratuit, Domaine Public & Creative Commons"
                >
                  🏛️ Wikimedia Commons (Libre)
                </button>
                <button
                  type="button"
                  className={`docucraft-filter-pill ${stockSource === 'archive_org' ? 'active' : ''}`}
                  onClick={() => {
                    setStockSource('archive_org');
                    performStockSearch(stockSearchQuery, 'archive_org', stockMediaType);
                  }}
                  title="Internet Archive: Prelinger Archives & films historiques"
                >
                  📜 Archive.org (Prelinger)
                </button>
                <button
                  type="button"
                  className={`docucraft-filter-pill ${stockSource === 'pexels' ? 'active' : ''}`}
                  onClick={() => {
                    setStockSource('pexels');
                    if (!pexelsConfigured && !pexelsApiKey) {
                      setShowPexelsKeyInput(true);
                    } else {
                      performStockSearch(stockSearchQuery, 'pexels', stockMediaType);
                    }
                  }}
                  title={pexelsConfigured ? "Pexels: Vidéos 4K modernes" : "Pexels: Clé API gratuite requise"}
                >
                  ✨ Pexels {pexelsConfigured ? '(Actif)' : '(Clé requise)'}
                </button>

                <div style={{ width: '1px', height: '16px', background: '#252d3a', margin: '0 4px' }} />

                <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>Format:</span>
                <button
                  type="button"
                  className={`docucraft-filter-pill ${stockMediaType === 'all' ? 'active' : ''}`}
                  onClick={() => {
                    setStockMediaType('all');
                    performStockSearch(stockSearchQuery, stockSource, 'all');
                  }}
                >
                  🎬 Tout
                </button>
                <button
                  type="button"
                  className={`docucraft-filter-pill ${stockMediaType === 'video' ? 'active' : ''}`}
                  onClick={() => {
                    setStockMediaType('video');
                    performStockSearch(stockSearchQuery, stockSource, 'video');
                  }}
                >
                  🎥 Vidéos
                </button>
                <button
                  type="button"
                  className={`docucraft-filter-pill ${stockMediaType === 'image' ? 'active' : ''}`}
                  onClick={() => {
                    setStockMediaType('image');
                    performStockSearch(stockSearchQuery, stockSource, 'image');
                  }}
                >
                  🖼️ Images / Gravures
                </button>
              </div>

              {/* Optional Pexels API Key input bar */}
              {(showPexelsKeyInput || (!pexelsConfigured && stockSource === 'pexels')) && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: '#161e2e',
                  border: '1px solid #1e3a8a',
                  padding: '8px 12px',
                  borderRadius: '6px'
                }}>
                  <span style={{ fontSize: '0.76rem', color: '#93c5fd' }}>
                    🔑 Clé Pexels API (gratuite sur pexels.com/api):
                  </span>
                  <input
                    type="password"
                    className="docucraft-input"
                    style={{ flex: 1, fontSize: '0.76rem', height: '28px' }}
                    placeholder="Collez votre clé Pexels API..."
                    value={pexelsApiKey}
                    onChange={(e) => setPexelsApiKey(e.target.value)}
                  />
                  <button
                    className="docucraft-btn-secondary docucraft-btn-sm"
                    style={{ height: '28px' }}
                    onClick={() => {
                      if (pexelsApiKey.trim()) {
                        performStockSearch(stockSearchQuery, stockSource, stockMediaType);
                      }
                      setShowPexelsKeyInput(false);
                    }}
                  >
                    Valider
                  </button>
                </div>
              )}
            </div>

            {/* Results Grid Body */}
            <div className="docucraft-stock-body">
              {isSearchingStock && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⏳</div>
                  <div style={{ fontWeight: 600, color: '#f1f5f9' }}>Recherche dans les archives publiques mondiales...</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '6px', color: '#64748b' }}>
                    Interrogation de Wikimedia Commons, Archive.org et Pexels
                  </div>
                </div>
              )}

              {!isSearchingStock && stockResults.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔍</div>
                  <div style={{ fontWeight: 600, color: '#94a3b8' }}>Aucun média d'archive trouvé pour cette requête.</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '6px' }}>
                    Essayez des termes plus généraux en français ou en anglais (ex: "permaculture", "agriculture", "ancient architecture", "roman garden").
                  </div>
                </div>
              )}

              {!isSearchingStock && stockResults.length > 0 && (
                <div className="docucraft-stock-grid">
                  {stockResults.map((item) => {
                    const isVid = item.mediaType === 'video';
                    const isCurrentSelecting = isSelectingStock && stockSelectedItemId === item.id;

                    return (
                      <div key={item.id} className="docucraft-stock-card">
                        <div className="docucraft-stock-thumb-wrap">
                          <img
                            src={item.thumbnailUrl}
                            alt={item.title}
                            className="docucraft-stock-thumb"
                            loading="lazy"
                            onError={(e: any) => {
                              e.target.style.opacity = '0.3';
                            }}
                          />
                          <div className="docucraft-stock-badge-type">
                            {isVid ? '🎥 VIDÉO' : '🖼️ IMAGE'}
                          </div>
                          {isVid && item.duration > 0 && (
                            <div className="docucraft-stock-badge-dur">
                              ⏱️ {Math.round(item.duration)}s
                            </div>
                          )}
                        </div>

                        <div className="docucraft-stock-info">
                          <div className="docucraft-stock-title" title={item.title}>
                            {item.title}
                          </div>

                          <div className="docucraft-stock-meta-row">
                            <span className="docucraft-stock-source-tag">
                              {item.sourceName || item.source}
                            </span>
                            <span title={item.license} style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.license || 'Public Domain'}
                            </span>
                          </div>

                          {item.creator && (
                            <div style={{ fontSize: '0.68rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              Auteur : {item.creator}
                            </div>
                          )}

                          <div className="docucraft-stock-actions">
                            <button
                              className="docucraft-btn-primary docucraft-btn-sm"
                              style={{ flex: 1, backgroundColor: isVid ? '#059669' : '#2563eb', borderColor: isVid ? '#10b981' : '#3b82f6' }}
                              onClick={() => handleSelectStockItem(item)}
                              disabled={isSelectingStock}
                            >
                              {isCurrentSelecting ? '⏳ Téléchargement...' : isVid ? '📥 Insérer Clip' : '📥 Insérer Image'}
                            </button>
                            {item.sourcePageUrl && (
                              <button
                                className="docucraft-btn-secondary docucraft-btn-sm"
                                style={{ padding: '0 8px' }}
                                title="Voir la page source originale"
                                onClick={() => window.open(item.sourcePageUrl, '_blank')}
                              >
                                🔗
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}





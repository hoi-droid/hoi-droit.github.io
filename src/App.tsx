import React, { useState, useEffect, useRef } from 'react';
import { 
  Disc, 
  BookOpen, 
  Image as ImageIcon, 
  Layers, 
  Package, 
  Upload, 
  Sparkles, 
  Download, 
  RefreshCw,
  AlertCircle,
  ChevronRight,
  Info,
  Library,
  Trash2,
  FileText,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import { ProductType, MockupConfig, ProductTemplate, SavedMockup } from './types';
import { generateMockup, editMockup } from './gemini';

const PRODUCT_TEMPLATES: ProductTemplate[] = [
  { 
    id: 'vinyl', 
    name: 'Vinyl Record', 
    description: 'Classic 12" LP cover mockup', 
    icon: 'Disc',
    defaultPrompt: 'Minimalist electronic music cover with abstract geometric shapes'
  },
  { 
    id: 'book', 
    name: 'Hardcover Book', 
    description: 'Premium book jacket mockup', 
    icon: 'BookOpen',
    defaultPrompt: 'Modernist typography-based book cover'
  },
  { 
    id: 'poster', 
    name: 'Gallery Poster', 
    description: 'Large format framed poster', 
    icon: 'ImageIcon',
    defaultPrompt: 'Swiss style exhibition poster'
  },
  { 
    id: 'magazine', 
    name: 'Magazine', 
    description: 'Glossy editorial layout', 
    icon: 'Layers',
    defaultPrompt: 'High-fashion magazine cover'
  },
  { 
    id: 'packaging', 
    name: 'Packaging', 
    description: 'Premium box design', 
    icon: 'Package',
    defaultPrompt: 'Luxury skincare packaging'
  }
];

const IconMap: Record<string, any> = {
  Disc, BookOpen, ImageIcon, Layers, Package
};

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [selectedProduct, setSelectedProduct] = useState<ProductType>(() => {
    const saved = localStorage.getItem('mockup_draft_product');
    return (saved as ProductType) || 'vinyl';
  });
  const [prompt, setPrompt] = useState(() => {
    return localStorage.getItem('mockup_draft_prompt') || '';
  });
  const [referenceImage, setReferenceImage] = useState<string | null>(() => {
    return localStorage.getItem('mockup_draft_reference') || null;
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(() => {
    return localStorage.getItem('mockup_current_result') || null;
  });
  const [editPrompt, setEditPrompt] = useState(() => {
    return localStorage.getItem('mockup_current_edit_prompt') || '';
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isKeyConnected, setIsKeyConnected] = useState<boolean | null>(null);
  const [savedMockups, setSavedMockups] = useState<SavedMockup[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("Global Error:", event.error);
      setError(`An unexpected error occurred: ${event.error?.message || 'Unknown error'}`);
    };
    window.addEventListener('error', handleError);
    
    try {
      const saved = localStorage.getItem('mockup_library');
      if (saved) {
        setSavedMockups(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load library from localStorage", e);
    }

    // Check key status on mount
    const checkKey = async () => {
      if (typeof window !== 'undefined' && window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setIsKeyConnected(hasKey);
      }
    };
    checkKey();
    
    return () => window.removeEventListener('error', handleError);
  }, []);

  useEffect(() => {
    if (isKeyConnected && error?.toLowerCase().includes('api key')) {
      setError(null);
    }
  }, [isKeyConnected, error]);

  useEffect(() => {
    localStorage.setItem('mockup_draft_product', selectedProduct);
  }, [selectedProduct]);

  useEffect(() => {
    localStorage.setItem('mockup_draft_prompt', prompt);
  }, [prompt]);

  useEffect(() => {
    if (referenceImage) {
      localStorage.setItem('mockup_draft_reference', referenceImage);
    } else {
      localStorage.removeItem('mockup_draft_reference');
    }
  }, [referenceImage]);

  useEffect(() => {
    if (resultImage) {
      try {
        localStorage.setItem('mockup_current_result', resultImage);
      } catch (e) {
        console.warn("Failed to save result image to localStorage (likely too large)", e);
      }
    } else {
      localStorage.removeItem('mockup_current_result');
    }
  }, [resultImage]);

  useEffect(() => {
    localStorage.setItem('mockup_current_edit_prompt', editPrompt);
  }, [editPrompt]);

  useEffect(() => {
    try {
      // Limit library size to prevent QuotaExceededError
      // Base64 images are large, so we keep only the most recent 5
      const limitedMockups = savedMockups.slice(0, 5);
      if (limitedMockups.length < savedMockups.length) {
        setSavedMockups(limitedMockups);
        return;
      }
      localStorage.setItem('mockup_library', JSON.stringify(limitedMockups));
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        console.error("Storage quota exceeded. Reducing library size.");
        setError("Storage limit reached. We've reduced your library to save space.");
        if (savedMockups.length > 1) {
          setSavedMockups(prev => prev.slice(0, prev.length - 1));
        } else {
          setSavedMockups([]);
        }
      } else {
        console.error("Failed to save to localStorage", e);
      }
    }
  }, [savedMockups]);

  const handleOpenKeyDialog = async () => {
    try {
      if (typeof window !== 'undefined' && window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
        await window.aistudio.openSelectKey();
        setError(null);
        // Assume success as per guidelines to mitigate race conditions
        setIsKeyConnected(true);
      }
    } catch (e) {
      console.error("Failed to open key dialog", e);
      setError("Could not open API key selection dialog.");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.src = reader.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1024;
          const MAX_HEIGHT = 1024;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          setReferenceImage(compressedDataUrl);
        };
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!prompt && !referenceImage) {
      setError("Please provide a prompt or a reference image.");
      return;
    }

    // Check if key is selected for nano banana models
    if (typeof window !== 'undefined' && window.aistudio) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setIsKeyConnected(hasKey);
      if (!hasKey) {
        setError("A paid API key is required for image generation. Please select one to continue.");
        handleOpenKeyDialog();
        return;
      }
    }

    setIsGenerating(true);
    setError(null);
    setResultImage(null);
    setEditPrompt('');
    
    try {
      const config: MockupConfig = {
        productType: selectedProduct,
        prompt: prompt || "Follow the reference image design exactly",
        referenceImage: referenceImage || undefined,
        aspectRatio: "1:1"
      };
      
      const result = await generateMockup(config);
      setResultImage(result);
    } catch (err: any) {
      console.error("Generation Error:", err);
      const msg = err.message || String(err);
      if (msg.includes("API key not valid") || msg.includes("400") || msg.includes("401")) {
        setError("API key error. The connected key may not have permission for image generation.");
        if (!isKeyConnected) {
          handleOpenKeyDialog();
        }
      } else {
        setError(`Generation failed: ${msg}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEdit = async () => {
    if (!editPrompt || !resultImage) return;

    // Check if key is selected for nano banana models
    if (typeof window !== 'undefined' && window.aistudio) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setIsKeyConnected(hasKey);
      if (!hasKey) {
        setError("A paid API key is required for image editing. Please select one to continue.");
        handleOpenKeyDialog();
        return;
      }
    }

    setIsEditing(true);
    setError(null);

    try {
      const result = await editMockup(resultImage, editPrompt);
      setResultImage(result);
      setEditPrompt('');
    } catch (err: any) {
      console.error("Edit Error:", err);
      const msg = err.message || String(err);
      if (msg.includes("API key not valid") || msg.includes("400") || msg.includes("401")) {
        setError("API key error. The connected key may not have permission for image editing.");
        if (!isKeyConnected) {
          handleOpenKeyDialog();
        }
      } else {
        setError(`Edit failed: ${msg}`);
      }
    } finally {
      setIsEditing(false);
    }
  };

  const saveToLibrary = () => {
    if (resultImage) {
      const newMockup: SavedMockup = {
        id: Date.now().toString(),
        url: resultImage,
        productType: selectedProduct,
        prompt: prompt || "Edited mockup",
        timestamp: Date.now()
      };
      setSavedMockups([newMockup, ...savedMockups]);
    }
  };

  const deleteFromLibrary = (id: string) => {
    setSavedMockups(savedMockups.filter(m => m.id !== id));
  };

  const exportToPDF = async () => {
    if (savedMockups.length === 0) return;
    
    try {
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      savedMockups.forEach((mockup, index) => {
        if (index > 0) pdf.addPage();
        
        // Add Title
        pdf.setFontSize(18);
        pdf.text(`Mockup: ${mockup.productType.toUpperCase()}`, 10, 20);
        
        // Add Prompt
        pdf.setFontSize(10);
        const splitPrompt = pdf.splitTextToSize(`Prompt: ${mockup.prompt}`, pageWidth - 20);
        pdf.text(splitPrompt, 10, 30);
        
        // Add Image
        const imgWidth = pageWidth - 20;
        const imgHeight = (imgWidth * 1); 
        
        try {
          pdf.addImage(mockup.url, 'PNG', 10, 45, imgWidth, imgHeight);
        } catch (imgErr) {
          console.error("Failed to add image to PDF", imgErr);
          pdf.text("Failed to render image", 10, 50);
        }
        
        // Add Footer
        pdf.setFontSize(8);
        pdf.text(`Generated on: ${new Date(mockup.timestamp).toLocaleString()}`, 10, pageHeight - 10);
      });
      
      pdf.save('mockup-library.pdf');
    } catch (err) {
      console.error("PDF Export Error:", err);
      setError("Failed to export PDF. Please try again.");
    }
  };

  const handleDownload = () => {
    if (resultImage) {
      const link = document.createElement('a');
      link.href = resultImage;
      link.download = `mockup-${selectedProduct}-${Date.now()}.png`;
      link.click();
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar - Controls */}
      <aside className="w-full md:w-[400px] bg-white border-r border-black/5 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Mockup Studio</h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleOpenKeyDialog}
              title={isKeyConnected ? "API Key Connected" : "Select API Key"}
              className={`p-2 rounded-xl transition-colors relative ${
                isKeyConnected 
                  ? "bg-green-50 text-green-600 hover:bg-green-100" 
                  : "hover:bg-gray-100 text-brand-secondary"
              }`}
            >
              <Key className="w-5 h-5" />
              {isKeyConnected && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-green-500 rounded-full border-2 border-green-50" />
              )}
            </button>
            <button 
              onClick={() => setShowLibrary(true)}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors relative"
            >
              <Library className="w-6 h-6 text-brand-secondary" />
              {savedMockups.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-accent text-brand-primary text-[10px] font-bold rounded-full flex items-center justify-center">
                  {savedMockups.length}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="space-y-8">
          {/* Product Selection */}
          <section>
            <label className="text-xs font-bold uppercase tracking-wider text-brand-secondary mb-4 block">
              Product Type
            </label>
            <div className="grid grid-cols-1 gap-2">
              {PRODUCT_TEMPLATES.map((item) => {
                const Icon = IconMap[item.icon];
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedProduct(item.id)}
                    className={`flex items-center gap-4 p-4 rounded-2xl transition-all text-left border ${
                      selectedProduct === item.id 
                        ? 'bg-brand-primary text-white border-brand-primary shadow-lg' 
                        : 'bg-white text-brand-primary border-black/5 hover:border-black/20'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      selectedProduct === item.id ? 'bg-white/20' : 'bg-gray-100'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{item.name}</div>
                      <div className={`text-xs ${selectedProduct === item.id ? 'text-white/60' : 'text-brand-secondary'}`}>
                        {item.description}
                      </div>
                    </div>
                    {selectedProduct === item.id && <ChevronRight className="ml-auto w-4 h-4 opacity-60" />}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Design Input */}
          <section className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-wider text-brand-secondary block">
              Design Details
            </label>
            
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the design style, colors, and elements..."
              className="input-field min-h-[120px] resize-none text-sm"
            />

            <div className="relative">
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary w-full text-sm"
              >
                {referenceImage ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" /> Change Reference
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Upload className="w-4 h-4" /> Upload Reference Design
                  </span>
                )}
              </button>
            </div>

            {referenceImage && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative aspect-video rounded-xl overflow-hidden border border-black/10"
              >
                <img src={referenceImage} alt="Reference" className="w-full h-full object-cover" />
                <button 
                  onClick={() => setReferenceImage(null)}
                  className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full hover:bg-black/70"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </motion.div>
            )}
          </section>

          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex flex-col gap-3 text-red-600 text-sm">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </div>
              {error.toLowerCase().includes('api key') && (
                <div className="space-y-3">
                  <p className="text-xs opacity-80">
                    Image generation models require an API key from a <strong>paid Google Cloud project</strong>. 
                    <a 
                      href="https://ai.google.dev/gemini-api/docs/billing" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="ml-1 underline hover:text-red-800"
                    >
                      Learn more about billing
                    </a>
                  </p>
                  <button 
                    onClick={handleOpenKeyDialog}
                    className="flex items-center justify-center gap-2 py-2 px-4 bg-red-100 hover:bg-red-200 rounded-lg font-semibold transition-colors w-full"
                  >
                    <Key className="w-4 h-4" />
                    Select Valid API Key
                  </button>
                </div>
              )}
            </div>
          )}

          <button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className="btn-primary w-full py-4 shadow-xl shadow-black/10"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Generating Mockup...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate Realistic Mockup
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main Preview Area */}
      <main className="flex-1 bg-[#F5F5F5] p-6 md:p-12 flex flex-col items-center justify-center relative">
        <AnimatePresence mode="wait">
          {resultImage ? (
            <motion.div 
              key="result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="max-w-3xl w-full"
            >
              <div className="glass-panel rounded-[32px] overflow-hidden p-3 shadow-2xl">
                <img 
                  src={resultImage} 
                  alt="Generated Mockup" 
                  className="w-full h-auto rounded-[24px]"
                  referrerPolicy="no-referrer"
                />
              </div>
              
              <div className="mt-8 flex flex-col items-center gap-6 w-full max-w-xl">
                <div className="w-full space-y-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-brand-secondary block text-center">
                    Refine this mockup
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      placeholder="e.g., 'make it darker', 'add a shadow', 'change the background'..."
                      className="input-field text-sm"
                      onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
                    />
                    <button 
                      onClick={handleEdit}
                      disabled={isEditing || !editPrompt}
                      className="btn-primary whitespace-nowrap"
                    >
                      {isEditing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Apply
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-4">
                  <button onClick={saveToLibrary} className="btn-primary bg-emerald-600 hover:bg-emerald-700">
                    <Library className="w-5 h-5" /> Save to Library
                  </button>
                  <button onClick={handleDownload} className="btn-secondary">
                    <Download className="w-5 h-5" /> Download
                  </button>
                  <button onClick={() => setResultImage(null)} className="btn-secondary">
                    <RefreshCw className="w-5 h-5" /> Start Over
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center max-w-md"
            >
              <div className="w-24 h-24 bg-white rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-sm border border-black/5">
                <ImageIcon className="w-10 h-10 text-brand-secondary/40" />
              </div>
              <h2 className="text-2xl font-bold mb-3">Ready to Visualize</h2>
              <p className="text-brand-secondary">
                Select a product and describe your design to generate a professional, realistic mockup in seconds.
              </p>
              
              <div className="mt-12 grid grid-cols-2 gap-4 opacity-40 grayscale pointer-events-none">
                <div className="aspect-square bg-white rounded-2xl border border-dashed border-black/20" />
                <div className="aspect-square bg-white rounded-2xl border border-dashed border-black/20" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {(isGenerating || isEditing) && (
          <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] flex items-center justify-center z-10">
            <div className="bg-white p-8 rounded-3xl shadow-2xl border border-black/5 flex flex-col items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-brand-primary/10 border-t-brand-primary rounded-full animate-spin" />
                <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-brand-primary" />
              </div>
              <div className="text-center">
                <p className="font-bold">{isEditing ? 'Refining your mockup' : 'Crafting your mockup'}</p>
                <p className="text-xs text-brand-secondary">This usually takes about 10-15 seconds</p>
              </div>
            </div>
          </div>
        )}

        <div className="absolute bottom-6 right-6 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-brand-secondary/50">
          <Info className="w-3 h-3" />
          Powered by Gemini 3.1 Flash Image
        </div>
      </main>

      {/* Library Overlay */}
      <AnimatePresence>
        {showLibrary && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end"
            onClick={() => setShowLibrary(false)}
          >
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Library className="w-6 h-6 text-brand-primary" />
                  <h2 className="text-xl font-bold">Your Library</h2>
                </div>
                <button 
                  onClick={() => setShowLibrary(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <RefreshCw className="w-5 h-5 rotate-45" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {savedMockups.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                    <Library className="w-12 h-12 mb-4" />
                    <p className="text-sm">Your library is empty.<br/>Save some mockups to see them here.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-brand-secondary">
                        {savedMockups.length} Items Saved
                      </span>
                      <button 
                        onClick={exportToPDF}
                        className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                      >
                        <FileText className="w-3 h-3" /> Export to PDF
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                      {savedMockups.map((mockup) => (
                        <div key={mockup.id} className="group relative bg-gray-50 rounded-2xl overflow-hidden border border-black/5">
                          <img src={mockup.url} alt={mockup.prompt} className="w-full aspect-square object-cover" />
                          <div className="p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold uppercase tracking-tighter bg-black/5 px-2 py-0.5 rounded">
                                {mockup.productType}
                              </span>
                              <span className="text-[10px] text-brand-secondary">
                                {new Date(mockup.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-xs text-brand-secondary line-clamp-1 italic">
                              "{mockup.prompt}"
                            </p>
                          </div>
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => deleteFromLibrary(mockup.id)}
                              className="p-2 bg-white/90 hover:bg-red-50 text-red-600 rounded-xl shadow-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => {
                                const link = document.createElement('a');
                                link.href = mockup.url;
                                link.download = `mockup-${mockup.id}.png`;
                                link.click();
                              }}
                              className="p-2 bg-white/90 hover:bg-gray-50 text-brand-primary rounded-xl shadow-lg transition-colors"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {savedMockups.length > 0 && (
                <div className="p-6 border-t border-black/5">
                  <button 
                    onClick={exportToPDF}
                    className="btn-primary w-full bg-emerald-600 hover:bg-emerald-700"
                  >
                    <FileText className="w-5 h-5" /> Download All as PDF
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

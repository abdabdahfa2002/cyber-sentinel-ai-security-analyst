
import React, { useState, useCallback, useEffect } from 'react';
import Header from './components/Header';
import MainMenu, { View } from './components/MainMenu';
import AIAnalyst from './components/AIAnalyst';
import VTScanner from './components/VTScanner';
import UserAgentAnalyzer from './components/UserAgentAnalyzer';
import PSDecoder from './components/PSDecoder';
import Casebook from './components/Casebook';
import CaseDetailView from './components/CaseDetailView';
import { generatePhaseIndex, generateGlobalSummary, generateGlobalIoCs, chatWithCaseAssistant } from './services/geminiService';
import type { Case, InvestigationArtifact, AnalysisResult, KillChainPhase, ChecklistItem, ArtifactContent, NewCaseDetails, ChatMessage } from './types';
import { useLocalization } from './components/contexts/LocalizationContext.tsx';


const App: React.FC = () => {
  const { direction } = useLocalization();
  const [activeView, setActiveView] = useState<View>('casebook');
  
  const [cases, setCases] = useState<Case[]>(() => {
    try {
      const savedCases = localStorage.getItem('cyberSentinelCases');
      if (savedCases) {
        return JSON.parse(savedCases);
      }
    } catch (error) {
      console.error("Failed to parse cases from localStorage:", error);
    }
    return [];
  });
  
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('cyberSentinelCases', JSON.stringify(cases));
    } catch (error) {
      console.error("Failed to save cases to localStorage:", error);
    }
  }, [cases]);

  const selectedCase = cases.find(c => c.id === selectedCaseId) || null;
  
  const triggerGlobalIndexers = useCallback((caseId: string) => {
    setCases(prevCases => {
        const targetCase = prevCases.find(c => c.id === caseId);
        if (!targetCase) return prevCases;

        const allButGlobalArtifacts = targetCase.artifacts.filter(a => a.type !== 'GLOBAL_SUMMARY' && a.type !== 'GLOBAL_IOC_LIST');
        const caseContext = `Case: ${targetCase.name}\nDescription: ${targetCase.description}\nArtifacts:\n${JSON.stringify(allButGlobalArtifacts)}`;

        // Trigger Global Summary
        generateGlobalSummary(caseContext).then(summary => {
            updateGlobalArtifact(caseId, 'GLOBAL_SUMMARY', 'Global Attack Summary', { text: summary });
        });

        // Trigger Global IoC List
        generateGlobalIoCs(allButGlobalArtifacts).then(iocs => {
            updateGlobalArtifact(caseId, 'GLOBAL_IOC_LIST', 'Global IoC Repository', iocs);
        });

        return prevCases;
    });
  }, []);

  const updateGlobalArtifact = (caseId: string, type: 'GLOBAL_SUMMARY' | 'GLOBAL_IOC_LIST', title: string, content: ArtifactContent) => {
      setCases(currentCases => currentCases.map(c => {
          if (c.id === caseId) {
              const existingIndex = c.artifacts.find(a => a.type === type);
              if (existingIndex) {
                  const updatedArtifacts = c.artifacts.map(a => 
                      a.id === existingIndex.id ? { ...a, content: content, createdAt: new Date().toISOString() } : a
                  );
                  return { ...c, artifacts: updatedArtifacts };
              } else {
                  const newIndex: InvestigationArtifact = {
                      id: `gidx-${type}-${Date.now()}`,
                      type: type,
                      title: title,
                      content: content,
                      createdAt: new Date().toISOString(),
                      killChainPhase: 'Uncategorized', // Global artifacts don't belong to a phase
                  };
                  return { ...c, artifacts: [newIndex, ...c.artifacts] };
              }
          }
          return c;
      }));
  };

  const triggerPhaseIndexer = useCallback(async (caseId: string, phase: KillChainPhase) => {
    if (phase === 'Uncategorized') return;

    setCases(prevCases => {
        const targetCase = prevCases.find(c => c.id === caseId);
        if (!targetCase) return prevCases;

        const phaseArtifacts = targetCase.artifacts.filter(a => a.killChainPhase === phase && a.type !== 'CASE_INDEX');
        
        generatePhaseIndex(phaseArtifacts).then(summary => {
            setCases(currentCases => currentCases.map(c => {
                if (c.id === caseId) {
                    const existingIndex = c.artifacts.find(a => a.killChainPhase === phase && a.type === 'CASE_INDEX');
                    if (existingIndex) {
                        const updatedArtifacts = c.artifacts.map(a => 
                            a.id === existingIndex.id ? { ...a, content: { text: summary } } : a
                        );
                        return { ...c, artifacts: updatedArtifacts };
                    } else {
                        const newIndex: InvestigationArtifact = {
                            id: `idx-${phase}-${Date.now()}`,
                            type: 'CASE_INDEX',
                            title: `${phase} Phase Summary`,
                            content: { text: summary },
                            createdAt: new Date().toISOString(),
                            killChainPhase: phase,
                        };
                        return { ...c, artifacts: [newIndex, ...c.artifacts] };
                    }
                }
                return c;
            }));
        });
        return prevCases;
    });
  }, []);

  const handleSetView = (view: View) => {
    if (view !== 'casebook') {
        setSelectedCaseId(null);
    }
    setActiveView(view);
  };

  const handleCreateCase = (details: NewCaseDetails) => {
    const initialArtifacts: Omit<InvestigationArtifact, 'id' | 'createdAt'>[] = [];

    if (details.summary?.trim()) {
      initialArtifacts.push({
        type: 'ANALYST_NOTE',
        title: 'Initial Incident Summary',
        content: { text: details.summary },
        killChainPhase: 'Uncategorized',
      });
    }

    if (details.notes?.trim()) {
      initialArtifacts.push({
        type: 'ANALYST_NOTE',
        title: 'Initial Notes',
        content: { text: details.notes },
        killChainPhase: 'Uncategorized',
      });
    }

    if (details.toolName?.trim()) {
      initialArtifacts.push({
        type: 'TOOL_INFO',
        title: `Tool: ${details.toolName}`,
        content: {
          toolName: details.toolName,
          version: details.toolVersion,
          configuration: details.toolConfig
        },
        killChainPhase: 'Uncategorized',
      });
    }

    const newCase: Case = {
      id: `case-${Date.now()}`,
      name: details.name,
      description: details.description,
      status: 'New',
      createdAt: new Date().toISOString(),
      artifacts: initialArtifacts.map((art, i) => ({
        ...art,
        id: `art-init-${Date.now()}-${i}`,
        createdAt: new Date().toISOString(),
      })),
      investigationChecklist: [],
      chatHistory: [],
    };

    setCases(prev => [newCase, ...prev]);
    setSelectedCaseId(newCase.id);
    triggerGlobalIndexers(newCase.id);
  };

  const handleAddArtifact = useCallback((caseId: string, artifact: Omit<InvestigationArtifact, 'id' | 'createdAt'>) => {
    setCases(prev => prev.map(c => {
      if (c.id === caseId) {
        const newArtifact: InvestigationArtifact = {
          ...artifact,
          id: `art-${Date.now()}`,
          createdAt: new Date().toISOString(),
        };
        const updatedCase = { ...c, artifacts: [...c.artifacts, newArtifact] };
        
        // Use a timeout to allow state to update before triggering indexers on the new data
        setTimeout(() => {
            triggerPhaseIndexer(caseId, newArtifact.killChainPhase);
            triggerGlobalIndexers(caseId);
        }, 0);

        return updatedCase;
      }
      return c;
    }));
  }, [triggerPhaseIndexer, triggerGlobalIndexers]);


  const handleUpdateArtifact = useCallback((caseId: string, artifactId: string, updates: Partial<InvestigationArtifact>) => {
    let originalPhase: KillChainPhase | undefined;
    let newPhase: KillChainPhase | undefined;

    setCases(prev => prev.map(c => {
        if (c.id === caseId) {
            const updatedArtifacts = c.artifacts.map(a => {
                if (a.id === artifactId) {
                    originalPhase = a.killChainPhase;
                    newPhase = updates.killChainPhase || a.killChainPhase;
                    return { ...a, ...updates };
                }
                return a;
            });
            return { ...c, artifacts: updatedArtifacts };
        }
        return c;
    }));
    
    setTimeout(() => {
        if (originalPhase && newPhase && originalPhase !== newPhase) {
            triggerPhaseIndexer(caseId, originalPhase);
            triggerPhaseIndexer(caseId, newPhase);
        }
        triggerGlobalIndexers(caseId);
    }, 0);

  }, [triggerPhaseIndexer, triggerGlobalIndexers]);

  const handleSplitAndOrganizeArtifact = useCallback((caseId: string, originalArtifactId: string, newArtifactsData: { phase: KillChainPhase, title: string, summary: string }[]) => {
      let updatedCase: Case | null = null;
      setCases(prev => prev.map(c => {
          if (c.id === caseId) {
              const artifactsWithoutOriginal = c.artifacts.filter(a => a.id !== originalArtifactId);
              
              const newArtifacts: InvestigationArtifact[] = newArtifactsData.map(data => ({
                  id: `art-split-${Date.now()}-${Math.random()}`,
                  type: 'ANALYST_NOTE',
                  title: data.title,
                  content: { text: data.summary },
                  createdAt: new Date().toISOString(),
                  killChainPhase: data.phase,
              }));
              
              updatedCase = { ...c, artifacts: [...artifactsWithoutOriginal, ...newArtifacts] };
              return updatedCase;
          }
          return c;
      }));
      
      setTimeout(() => {
        if (updatedCase) {
             const affectedPhases = new Set(newArtifactsData.map(d => d.phase));
             affectedPhases.forEach(phase => triggerPhaseIndexer(caseId, phase));
             triggerGlobalIndexers(caseId);
        }
      }, 0);

  }, [triggerPhaseIndexer, triggerGlobalIndexers]);


  const handleUpdateChecklist = (caseId: string, newChecklist: Omit<ChecklistItem, 'completed'>[]) => {
      setCases(prev => prev.map(c => {
          if (c.id === caseId) {
              const updatedChecklist = newChecklist.map(item => ({ ...item, completed: false }));
              return { ...c, investigationChecklist: updatedChecklist };
          }
          return c;
      }));
  };

  const handleToggleChecklistItem = (caseId: string, step: number) => {
      setCases(prev => prev.map(c => {
          if (c.id === caseId) {
              const updatedChecklist = c.investigationChecklist.map(item => 
                  item.step === step ? { ...item, completed: !item.completed } : item
              );
              return { ...c, investigationChecklist: updatedChecklist };
          }
          return c;
      }));
  };

  const handleSendMessage = async (caseId: string, text: string) => {
    const targetCase = cases.find(c => c.id === caseId);
    if (!targetCase) return;

    const userMsg: ChatMessage = {
        id: `msg-user-${Date.now()}`,
        sender: 'user',
        text: text,
        timestamp: new Date().toISOString()
    };

    setCases(prev => prev.map(c => 
        c.id === caseId ? { ...c, chatHistory: [...c.chatHistory, userMsg] } : c
    ));

    setIsChatLoading(true);
    try {
        const caseContext = `
            Case Name: ${targetCase.name}
            Description: ${targetCase.description}
            Artifacts: ${JSON.stringify(targetCase.artifacts)}
            Current Chat History: ${JSON.stringify(targetCase.chatHistory)}
        `;
        const responseText = await chatWithCaseAssistant(caseContext, text);
        
        const aiMsg: ChatMessage = {
            id: `msg-ai-${Date.now()}`,
            sender: 'ai',
            text: responseText,
            timestamp: new Date().toISOString()
        };

        setCases(prev => prev.map(c => 
            c.id === caseId ? { ...c, chatHistory: [...c.chatHistory, aiMsg] } : c
        ));
    } catch (error) {
        console.error("Chat failed:", error);
    } finally {
        setIsChatLoading(false);
    }
  };


  const renderView = () => {
    if (selectedCaseId && selectedCase) {
        return (
            <CaseDetailView 
                caseData={selectedCase} 
                onBack={() => setSelectedCaseId(null)} 
                onAddArtifact={(art) => handleAddArtifact(selectedCaseId, art)}
                onUpdateArtifact={(artId, updates) => handleUpdateArtifact(selectedCaseId, artId, updates)}
                onUpdateChecklist={(steps) => handleUpdateChecklist(selectedCaseId, steps)}
                onToggleChecklistItem={(step) => handleToggleChecklistItem(selectedCaseId, step)}
                onStartNewAnalysis={() => {
                    setSelectedCaseId(null);
                    setActiveView('ai_analyst');
                }}
                onSplitAndOrganizeArtifact={(origId, data) => handleSplitAndOrganizeArtifact(selectedCaseId, origId, data)}
                onSendMessage={(msg) => handleSendMessage(selectedCaseId, msg)}
                isChatLoading={isChatLoading}
            />
        );
    }

    switch (activeView) {
      case 'casebook':
        return (
          <Casebook 
            cases={cases} 
            onCreateCase={handleCreateCase} 
            onSelectCase={setSelectedCaseId}
          />
        );
      case 'ai_analyst':
        return <AIAnalyst onAnalysisComplete={(res) => {
            // This is for a "standalone" analysis that creates a new case
            const newCaseDetails: NewCaseDetails = {
                name: `Analysis: ${res.summary.substring(0, 30)}...`,
                description: res.summary,
                summary: res.summary
            };
            handleCreateCase(newCaseDetails);
            // The initial artifacts will be added by handleCreateCase, but we need the AI analysis specifically
            setCases(prev => prev.map(c => {
                if (c.name === newCaseDetails.name) {
                    const aiArtifact: InvestigationArtifact = {
                        id: `art-ai-${Date.now()}`,
                        type: 'AI_ANALYSIS',
                        title: 'Initial AI Analysis',
                        content: res,
                        createdAt: new Date().toISOString(),
                        killChainPhase: 'Uncategorized'
                    };
                    return { ...c, artifacts: [aiArtifact, ...c.artifacts] };
                }
                return c;
            }));
        }} />;
      case 'vt_scanner':
        return <VTScanner />;
      case 'ua_analyzer':
        return <UserAgentAnalyzer />;
      case 'ps_decoder':
        return <PSDecoder />;
      default:
        return <Casebook cases={cases} onCreateCase={handleCreateCase} onSelectCase={setSelectedCaseId} />;
    }
  };

  return (
    <div className="min-h-screen bg-sentinel-gray-dark text-gray-100 font-sans selection:bg-sentinel-blue/30" dir={direction}>
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <MainMenu activeView={activeView} setActiveView={handleSetView} />
        </div>
        {renderView()}
      </main>
      
      {/* Global Toast / Notification Container could go here */}
    </div>
  );
};

export default App;

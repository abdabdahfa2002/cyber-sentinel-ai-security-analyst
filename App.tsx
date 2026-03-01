import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from './components/contexts/AuthContext';
import { fetchCases, createCase, updateCase } from './services/caseService';
import Login from './components/Login';
import Register from './components/Register';
import Header from './components/Header';
import MainMenu, { View } from './components/MainMenu';
import AIAnalyst from './components/AIAnalyst';
import VTScanner from './components/VTScanner';
import UserAgentAnalyzer from './components/UserAgentAnalyzer';
import Casebook from './components/Casebook';
import CaseDetailView from './components/CaseDetailView';
import PowerShellAnalyzer from './components/PowerShellAnalyzer';
import { generatePhaseIndex, generateGlobalSummary, generateGlobalIoCs, chatWithCaseAssistant } from './services/geminiService';
import type { Case, InvestigationArtifact, AnalysisResult, KillChainPhase, ChecklistItem, ArtifactContent, NewCaseDetails, ChatMessage } from './types';
import { useLocalization } from './components/contexts/LocalizationContext.tsx';


const AppContent: React.FC = () => {
  const { direction } = useLocalization();
  const [activeView, setActiveView] = useState<View>('casebook');
  
  const { token, isAuthenticated } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [isCasesLoading, setIsCasesLoading] = useState(true);
  
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated && token) {
      setIsCasesLoading(true);
      fetchCases(token)
        .then(data => {
          setCases(data);
          setIsCasesLoading(false);
        })
        .catch(error => {
          console.error("Failed to fetch cases:", error);
          setIsCasesLoading(false);
        });
    } else {
      setCases([]);
      setIsCasesLoading(false);
    }
  }, [isAuthenticated, token]);

  const selectedCase = cases.find(c => c.id === selectedCaseId || (c as any)._id === selectedCaseId) || null;
  
  const updateGlobalArtifact = (caseId: string, type: 'GLOBAL_SUMMARY' | 'GLOBAL_IOC_LIST', title: string, content: ArtifactContent) => {
    if (!token) return;
      setCases(currentCases => currentCases.map(c => {
          const cid = (c as any)._id || c.id;
          if (cid === caseId) {
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
                      killChainPhase: 'Uncategorized',
                  };
                  return { ...c, artifacts: [newIndex, ...c.artifacts] };
              }
          }
          return c;
      }));
  };

  const triggerGlobalIndexers = useCallback((caseId: string) => {
    if (!token) return;
    const targetCase = cases.find(c => (c as any)._id === caseId || c.id === caseId);
    if (!targetCase) return;

    const allButGlobalArtifacts = targetCase.artifacts.filter(a => a.type !== 'GLOBAL_SUMMARY' && a.type !== 'GLOBAL_IOC_LIST');
    const caseContext = `Case: ${targetCase.name}\nDescription: ${targetCase.description}\nArtifacts:\n${JSON.stringify(allButGlobalArtifacts)}`;

    generateGlobalSummary(caseContext).then(summary => {
        updateGlobalArtifact(caseId, 'GLOBAL_SUMMARY', 'Global Attack Summary', { text: summary });
    });

    generateGlobalIoCs(allButGlobalArtifacts).then(iocs => {
        updateGlobalArtifact(caseId, 'GLOBAL_IOC_LIST', 'Global IoC Repository', iocs as any);
    });
  }, [token, cases]);

  const triggerPhaseIndexer = useCallback(async (caseId: string, phase: KillChainPhase) => {
    if (phase === 'Uncategorized' || !token) return;

    const targetCase = cases.find(c => (c as any)._id === caseId || c.id === caseId);
    if (!targetCase) return;

    const phaseArtifacts = targetCase.artifacts.filter(a => a.killChainPhase === phase && a.type !== 'CASE_INDEX');
    
    generatePhaseIndex(phaseArtifacts).then(summary => {
        setCases(currentCases => currentCases.map(c => {
            const cid = (c as any)._id || c.id;
            if (cid === caseId) {
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
  }, [token, cases]);

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

    const newCaseData: Omit<Case, '_id' | 'user' | 'createdAt' | 'updatedAt'> = {
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

    createCase(newCaseData, token!)
      .then(newCase => {
        setCases(prev => [newCase, ...prev]);
        const cid = (newCase as any)._id || newCase.id;
        setSelectedCaseId(cid);
        triggerGlobalIndexers(cid);
      })
      .catch(error => console.error("Failed to create case on server:", error));
  };

  const handleAddArtifact = useCallback((caseId: string, artifact: Omit<InvestigationArtifact, 'id' | 'createdAt'>) => {
    if (!selectedCase) return;
    const newArt: InvestigationArtifact = {
        ...artifact,
        id: `art-${Date.now()}`,
        createdAt: new Date().toISOString()
    };
    const updatedArtifacts = [...selectedCase.artifacts, newArt];
    updateCase(caseId, { artifacts: updatedArtifacts }, token!)
      .then(updatedCase => {
        setCases(prev => prev.map(c => ((c as any)._id === caseId || c.id === caseId) ? updatedCase : c));
        setTimeout(() => {
            triggerPhaseIndexer(caseId, newArt.killChainPhase);
            triggerGlobalIndexers(caseId);
        }, 0);
      })
      .catch(error => console.error("Failed to add artifact:", error));
  }, [selectedCase, token, triggerPhaseIndexer, triggerGlobalIndexers]);


  const handleUpdateArtifact = useCallback((caseId: string, artifactId: string, updates: Partial<InvestigationArtifact>) => {
    if (!selectedCase) return;
    let originalPhase: KillChainPhase | undefined;
    let newPhase: KillChainPhase | undefined;

    const updatedArtifacts = selectedCase.artifacts.map(a => {
        if (a.id === artifactId) {
            originalPhase = a.killChainPhase;
            newPhase = updates.killChainPhase || a.killChainPhase;
            return { ...a, ...updates };
        }
        return a;
    });

    updateCase(caseId, { artifacts: updatedArtifacts }, token!)
      .then(updatedCase => {
        setCases(prev => prev.map(c => ((c as any)._id === caseId || c.id === caseId) ? updatedCase : c));
        setTimeout(() => {
            if (originalPhase && newPhase && originalPhase !== newPhase) {
                triggerPhaseIndexer(caseId, originalPhase);
                triggerPhaseIndexer(caseId, newPhase);
            }
            triggerGlobalIndexers(caseId);
        }, 0);
      })
      .catch(error => console.error("Failed to update artifact:", error));
  }, [selectedCase, token, triggerPhaseIndexer, triggerGlobalIndexers]);

  const handleSplitAndOrganizeArtifact = useCallback((caseId: string, originalArtifactId: string, newArtifactsData: { phase: KillChainPhase, title: string, summary: string }[]) => {
    if (!selectedCase) return;
    const artifactsWithoutOriginal = selectedCase.artifacts.filter(a => a.id !== originalArtifactId);
    const newArtifacts: InvestigationArtifact[] = newArtifactsData.map(data => ({
        id: `art-split-${Date.now()}-${Math.random()}`,
        type: 'ANALYST_NOTE',
        title: data.title,
        content: { text: data.summary },
        createdAt: new Date().toISOString(),
        killChainPhase: data.phase,
    }));
    const updatedArtifacts = [...artifactsWithoutOriginal, ...newArtifacts];

    updateCase(caseId, { artifacts: updatedArtifacts }, token!)
      .then(updatedCase => {
        setCases(prev => prev.map(c => ((c as any)._id === caseId || c.id === caseId) ? updatedCase : c));
        const affectedPhases = new Set(newArtifactsData.map(d => d.phase));
        affectedPhases.forEach(phase => triggerPhaseIndexer(caseId, phase));
        triggerGlobalIndexers(caseId);
      })
      .catch(error => console.error("Failed to split and organize artifact:", error));
  }, [selectedCase, token, triggerPhaseIndexer, triggerGlobalIndexers]);


  const handleUpdateChecklist = (caseId: string, newChecklist: Omit<ChecklistItem, 'completed'>[]) => {
    const updatedChecklist = newChecklist.map(item => ({ ...item, completed: false }));
    updateCase(caseId, { investigationChecklist: updatedChecklist }, token!)
      .then(updatedCase => {
        setCases(prev => prev.map(c => ((c as any)._id === caseId || c.id === caseId) ? updatedCase : c));
      })
      .catch(error => console.error("Failed to update checklist:", error));
  };

  const handleToggleChecklistItem = (caseId: string, step: number) => {
    if (!selectedCase) return;
    const updatedChecklist = selectedCase.investigationChecklist.map(item => 
        item.step === step ? { ...item, completed: !item.completed } : item
    );
    updateCase(caseId, { investigationChecklist: updatedChecklist }, token!)
      .then(updatedCase => {
        setCases(prev => prev.map(c => ((c as any)._id === caseId || c.id === caseId) ? updatedCase : c));
      })
      .catch(error => console.error("Failed to toggle checklist item:", error));
  };

  const handleAnalysisComplete = useCallback((caseId: string | null, analysis: AnalysisResult) => {
    const newArtifact: Omit<InvestigationArtifact, 'id' | 'createdAt'> = {
        type: 'AI_ANALYSIS',
        title: 'AI Initial Analysis',
        content: analysis,
        killChainPhase: 'Reconnaissance',
    };

    const newCaseName = `Untitled Analysis - ${new Date().toLocaleDateString()}`;
    const newCaseData: Omit<Case, '_id' | 'user' | 'createdAt' | 'updatedAt'> = {
        name: newCaseName,
        description: 'Case automatically created from a new investigation.',
        status: 'New',
        artifacts: [{
            ...newArtifact,
            id: `art-${Date.now()}`,
            createdAt: new Date().toISOString(),
        }],
        investigationChecklist: [],
        chatHistory: [],
    };

    createCase(newCaseData, token!)
      .then(newCase => {
        setCases(prev => [newCase, ...prev]);
        const cid = (newCase as any)._id || newCase.id;
        setSelectedCaseId(cid);
        setActiveView('casebook');
        setTimeout(() => {
            triggerPhaseIndexer(cid, 'Reconnaissance');
            triggerGlobalIndexers(cid);
        }, 0);
      })
      .catch(error => console.error("Failed to create case from analysis:", error));
  }, [token, triggerPhaseIndexer, triggerGlobalIndexers]);
  
  const handleSendMessage = async (caseId: string, userMessage: string) => {
    if (!selectedCase) return;
    const newUserMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: userMessage,
      timestamp: new Date().toISOString(),
    };

    const updatedChatHistory = [...selectedCase.chatHistory, newUserMessage];
    setCases(prev => prev.map(c => ((c as any)._id === caseId || c.id === caseId) ? { ...c, chatHistory: updatedChatHistory } : c));
    setIsChatLoading(true);

    try {
      const caseContext = JSON.stringify(selectedCase);
      const aiResponseText = await chatWithCaseAssistant(userMessage, caseContext);

      const newAiMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'ai',
        text: aiResponseText,
        timestamp: new Date().toISOString(),
      };
      
      const finalChatHistory = [...updatedChatHistory, newAiMessage];
      
      updateCase(caseId, { chatHistory: finalChatHistory }, token!)
        .then(updatedCase => {
          setCases(prev => prev.map(c => ((c as any)._id === caseId || c.id === caseId) ? updatedCase : c));
        })
        .catch(error => console.error("Failed to save chat history:", error));

    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: ChatMessage = {
        id: `msg-err-${Date.now()}`,
        sender: 'ai',
        text: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setCases(prev => prev.map(c => ((c as any)._id === caseId || c.id === caseId) ? { ...c, chatHistory: [...updatedChatHistory, errorMessage] } : c));
    } finally {
      setIsChatLoading(false);
    }
  };


  const renderContent = () => {
    if (!isAuthenticated) {
        if (activeView === 'register') {
            return <Register onSwitchToLogin={() => setActiveView('login')} />;
        }
        return <Login onSwitchToRegister={() => setActiveView('register')} />;
    }

    if (isCasesLoading) {
        return <div className="text-center py-10 text-xl text-blue-400">Loading your cases...</div>;
    }
    if (activeView === 'vt_scanner') return <VTScanner />;
    if (activeView === 'ua_analyzer') return <UserAgentAnalyzer />;
    if (activeView === 'ps_analyzer') return <PowerShellAnalyzer />;
    
    if (activeView === 'ai_analyst') {
      return <AIAnalyst activeCase={selectedCase} onAnalysisComplete={handleAnalysisComplete} setActiveView={setActiveView} />;
    }

    if (selectedCase) {
        const cid = (selectedCase as any)._id || selectedCase.id;
        return <CaseDetailView 
                  caseData={selectedCase} 
                  onBack={() => setSelectedCaseId(null)}
                  onAddArtifact={(artifact) => handleAddArtifact(cid, artifact)}
                  onUpdateArtifact={(artifactId, updates) => handleUpdateArtifact(cid, artifactId, updates)}
                  onUpdateChecklist={(checklist) => handleUpdateChecklist(cid, checklist)}
                  onToggleChecklistItem={(step) => handleToggleChecklistItem(cid, step)}
                  onStartNewAnalysis={() => {
                      setSelectedCaseId(cid);
                      setActiveView('ai_analyst');
                  }}
                  onSplitAndOrganizeArtifact={(originalArtifactId, newArtifactsData) => handleSplitAndOrganizeArtifact(cid, originalArtifactId, newArtifactsData)}
                  onSendMessage={(message) => handleSendMessage(cid, message)}
                  isChatLoading={isChatLoading}
               />;
    }
    return <Casebook 
            cases={cases} 
            onSelectCase={setSelectedCaseId} 
            onCreateCase={handleCreateCase} 
          />;
  };

  return (
    <div dir={direction} className="min-h-screen bg-sentinel-gray-dark text-gray-200 font-sans">
      <Header />
      <main className="container mx-auto p-4 md:p-8">
        {isAuthenticated && <MainMenu activeView={activeView} setActiveView={handleSetView} />}
        <div className="mt-8">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

const App: React.FC = () => (
    <AppContent />
);

export default App;

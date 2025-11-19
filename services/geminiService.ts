import type { AnalysisResult, ChecklistItem, KillChainPhase, InvestigationArtifact, IndicatorOfCompromise, ArtifactContent, UserAgentSecurityAnalysis } from '../types.ts';

const API_BASE_URL = '/api'; // Will be proxied by Vite in development

const postData = async (endpoint: string, data: any): Promise<any> => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API call failed to ${endpoint}: ${response.status} - ${errorText}`);
    }

    // Handle text response for summary/index endpoints
    if (response.headers.get('content-type')?.includes('text/plain')) {
        return response.text();
    }

    return response.json();
};

export const analyzeEvent = async (eventLog: string): Promise<AnalysisResult> => {
    return postData('/analyze-event', { eventLog });
};


export const suggestNextSteps = async (caseContext: string): Promise<Omit<ChecklistItem, 'completed'>[]> => {
    return postData('/suggest-next-steps', { caseContext });
};


export const generatePhaseIndex = async (artifacts: InvestigationArtifact[]): Promise<string> => {
    return postData('/generate-phase-index', { artifacts });
};


export type SplitArtifactResult = {
    phase: KillChainPhase;
    title: string;
    summary: string;
};

export const splitAndClassifyArtifact = async (content: string): Promise<SplitArtifactResult[]> => {
    return postData('/split-and-classify-artifact', { content });
};


export const generateGlobalSummary = async (caseContext: string): Promise<string> => {
    return postData('/generate-global-summary', { caseContext });
};


export const generateGlobalIoCs = async (artifacts: InvestigationArtifact[]): Promise<{ iocsByPhase: Partial<Record<KillChainPhase, IndicatorOfCompromise[]>> }> => {
    return postData('/generate-global-iocs', { artifacts });
};

export const chatWithCaseAssistant = async (userMessage: string, caseContext: string): Promise<string> => {
    return postData('/chat-with-assistant', { userMessage, caseContext });
};


export const analyzeUserAgentsSecurity = async (userAgentsWithParsedData: { userAgent: string, parsedData: any }[]): Promise<(UserAgentSecurityAnalysis & { userAgent: string })[]> => {
    return postData('/analyze-user-agents', { userAgentsWithParsedData });
};

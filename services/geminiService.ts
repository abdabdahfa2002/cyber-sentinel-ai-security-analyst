


import { GoogleGenAI, Type } from "@google/genai";
import type { AnalysisResult, ChecklistItem, KillChainPhase, InvestigationArtifact, IndicatorOfCompromise, ArtifactContent, UserAgentSecurityAnalysis } from '../types.ts';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: "A concise, easy-to-understand summary of what happened." },
    estimated_severity: {
      type: Type.STRING,
      enum: ["Informational", "Low", "Medium", "High", "Critical"],
      description: "Assessment of the event's severity."
    },
    attack_tactic: {
      type: Type.OBJECT,
      description: "The most likely MITRE ATT&CK Tactic.",
      properties: {
        id: { type: Type.STRING },
        name: { type: Type.STRING },
        description: { type: Type.STRING }
      },
      required: ["id", "name", "description"]
    },
    attack_technique: {
      type: Type.OBJECT,
      description: "The most likely MITRE ATT&CK Technique that corresponds to the Tactic.",
      properties: {
        id: { type: Type.STRING },
        name: { type: Type.STRING },
        description: { type: Type.STRING }
      },
      required: ["id", "name", "description"]
    },
    indicators_of_compromise: {
      type: Type.ARRAY,
      description: "A list of all indicators of compromise (IoCs) found in the event.",
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ['IP Address', 'File Hash', 'Domain', 'URL', 'Email', 'Other'] },
          value: { type: Type.STRING }
        },
        required: ["type", "value"]
      }
    },
    investigation_checklist: {
      type: Type.ARRAY,
      description: "A checklist of recommended next steps for a junior analyst.",
      items: {
        type: Type.OBJECT,
        properties: {
          step: { type: Type.INTEGER },
          action: { type: Type.STRING, description: "A short, actionable title for the step." },
          details: { type: Type.STRING, description: "A more detailed explanation of what to do." }
        },
        required: ["step", "action", "details"]
      }
    },
    timeline_events: {
        type: Type.ARRAY,
        description: "A chronological list of key events that occurred.",
        items: {
            type: Type.OBJECT,
            properties: {
                timestamp: { type: Type.STRING, description: "The timestamp of the event (e.g., YYYY-MM-DD HH:MM:SS UTC). Use the original if available, otherwise estimate." },
                event: { type: Type.STRING, description: "A description of the event." }
            },
            required: ["timestamp", "event"]
        }
    }
  },
  required: ["summary", "estimated_severity", "attack_tactic", "attack_technique", "indicators_of_compromise", "investigation_checklist", "timeline_events"]
};

export const analyzeEvent = async (eventLog: string): Promise<AnalysisResult> => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Analyze the following security event log and provide a structured analysis. The user is a junior security analyst, so be clear and concise. Event Log: \n\n${eventLog}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: analysisSchema,
    }
  });
  
  const jsonText = response.text.trim();
  return JSON.parse(jsonText) as AnalysisResult;
};


export const suggestNextSteps = async (caseContext: string): Promise<Omit<ChecklistItem, 'completed'>[]> => {
    const checklistSchema = {
        type: Type.OBJECT,
        properties: {
            steps: {
                type: Type.ARRAY,
                description: "A checklist of recommended next steps.",
                items: {
                    type: Type.OBJECT,
                    properties: {
                        step: { type: Type.INTEGER },
                        action: { type: Type.STRING, description: "A short, actionable title for the step." },
                        details: { type: Type.STRING, description: "A more detailed explanation of what to do." }
                    },
                    required: ["step", "action", "details"]
                }
            }
        },
        required: ["steps"]
    };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Based on the following security investigation case context, suggest a short list of 3-5 high-level, actionable next steps for a security analyst.
IMPORTANT: The analyst's role is INVESTIGATION and ANALYSIS only. DO NOT suggest operational tasks like "contain the host," "block the IP," or "reset passwords."
Focus exclusively on analytical actions like "Correlate IP addresses with firewall logs," "Research the file hash on threat intel platforms," or "Analyze the PowerShell script for obfuscation techniques." Frame your suggestions as recommendations.

Case Context:
${caseContext}`,
        config: {
            responseMimeType: 'application/json',
            responseSchema: checklistSchema,
        }
    });

    const jsonText = response.text.trim();
    const result = JSON.parse(jsonText) as { steps: Omit<ChecklistItem, 'completed'>[] };
    return result.steps;
};


export const generatePhaseIndex = async (artifacts: InvestigationArtifact[]): Promise<string> => {
    if (artifacts.length === 0) {
        return "No activity recorded for this phase yet.";
    }
    const context = artifacts.map(a => `Title: ${a.title}\nContent: ${JSON.stringify(a.content)}`).join('\n\n');
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Summarize the key findings from the following investigation artifacts for a specific phase of an attack. Provide a concise, bulleted list of the most important points.

Artifacts:
${context}`,
    });

    return response.text;
};

export type SplitArtifactResult = {
    phase: KillChainPhase;
    title: string;
    summary: string;
};

export const splitAndClassifyArtifact = async (content: string): Promise<SplitArtifactResult[]> => {
    const splitSchema = {
        type: Type.OBJECT,
        properties: {
            chunks: {
                type: Type.ARRAY,
                description: "An array of classified chunks from the original text.",
                items: {
                    type: Type.OBJECT,
                    properties: {
                        phase: { type: Type.STRING, enum: ['Reconnaissance', 'Weaponization', 'Delivery', 'Exploitation', 'Installation', 'Command and Control', 'Actions on Objectives'] },
                        title: { type: Type.STRING, description: "A concise, descriptive title for this specific chunk of information." },
                        summary: { type: Type.STRING, description: "The relevant text content for this chunk." }
                    },
                    required: ["phase", "title", "summary"]
                }
            }
        },
        required: ["chunks"]
    };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are an expert security analyst tasked with organizing raw investigation notes. Analyze the following text blob. Identify distinct topics or findings within it. For each distinct finding, create a new artifact with a clear title, a summary of the finding, and classify it into the most appropriate Cyber Kill Chain phase. If the text contains multiple distinct topics, split it into multiple artifacts. If all the text belongs to a single topic, create one artifact for it.

Raw Text:
${content}`,
        config: {
            responseMimeType: 'application/json',
            responseSchema: splitSchema,
        }
    });

    const jsonText = response.text.trim();
    const result = JSON.parse(jsonText) as { chunks: SplitArtifactResult[] };
    return result.chunks;
};


export const generateGlobalSummary = async (caseContext: string): Promise<string> => {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are an expert security analyst. Based on the entire case context provided, write a high-level executive summary of the investigation so far. Describe the likely attack narrative, what is known, and what is still unknown.

Case Context:
${caseContext}`,
    });

    return response.text;
};

const iocSchema = {
    type: Type.OBJECT,
    properties: {
        iocs: {
            type: Type.ARRAY,
            description: "A list of all indicators of compromise (IoCs) found in the text.",
            items: {
                type: Type.OBJECT,
                properties: {
                    type: { type: Type.STRING, enum: ['IP Address', 'File Hash', 'Domain', 'URL', 'Email', 'Other'] },
                    value: { type: Type.STRING },
                    killChainPhase: { type: Type.STRING, enum: ['Reconnaissance', 'Weaponization', 'Delivery', 'Exploitation', 'Installation', 'Command and Control', 'Actions on Objectives', 'Uncategorized'] }
                },
                required: ["type", "value", "killChainPhase"]
            }
        }
    },
    required: ["iocs"]
};

const stringifyArtifactContent = (content: ArtifactContent): string => {
    if ('summary' in content) return `AI Analysis Summary: ${content.summary}`;
    if ('text' in content) return content.text;
    if ('output' in content) return `Tool: ${content.toolName}\nCommand: ${content.command || 'N/A'}\nOutput:\n${content.output}`;
    if ('fileName' in content) return `File: ${content.fileName}\nContent:\n${content.content}`;
    return JSON.stringify(content);
}

export const generateGlobalIoCs = async (artifacts: InvestigationArtifact[]): Promise<{ iocsByPhase: Partial<Record<KillChainPhase, IndicatorOfCompromise[]>> }> => {
    const context = artifacts
        .filter(a => a.type !== 'CASE_INDEX' && a.type !== 'TOOL_INFO' && a.type !== 'GLOBAL_SUMMARY' && a.type !== 'GLOBAL_IOC_LIST')
        .map(a => `--- Artifact (Phase: ${a.killChainPhase}) ---\n${stringifyArtifactContent(a.content)}`)
        .join('\n\n');

    if (!context.trim()) {
        return { iocsByPhase: {} };
    }
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are an expert security analyst specializing in Indicator of Compromise (IoC) extraction. Read through all the following artifacts from an investigation. Extract every single IoC you can find, even if it's buried in unstructured text. For each IoC, classify its type and associate it with the Kill Chain Phase of the artifact where it was found.

Investigation Artifacts:
${context}`,
        config: {
            responseMimeType: 'application/json',
            responseSchema: iocSchema,
        }
    });

    const jsonText = response.text.trim();
    const result = JSON.parse(jsonText) as { iocs: (IndicatorOfCompromise & { killChainPhase: KillChainPhase })[] };

    const iocsByPhase: Partial<Record<KillChainPhase, IndicatorOfCompromise[]>> = {};

    for (const ioc of result.iocs) {
        const phase = ioc.killChainPhase;
        if (!iocsByPhase[phase]) {
            iocsByPhase[phase] = [];
        }
        // Avoid duplicates within the same phase
        if (!iocsByPhase[phase]!.some(existing => existing.value === ioc.value)) {
            iocsByPhase[phase]!.push({ type: ioc.type, value: ioc.value });
        }
    }

    return { iocsByPhase };
};

export const chatWithCaseAssistant = async (caseContext: string, userMessage: string): Promise<string> => {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are the Cyber Sentinel Case Assistant, an AI designed to help security analysts with their investigations.
You have access to the full context of the current case, including all artifacts and notes.
Your goal is to answer questions, provide insights, and help the analyst connect the dots.
Be professional, analytical, and concise.

Case Context:
${caseContext}

User Message:
${userMessage}`,
    });

    return response.text;
};

export interface PowerShellDecodeResult {
    original: string;
    decoded: string;
    explanation: string;
}

export const decodePowerShell = async (commands: string[]): Promise<PowerShellDecodeResult[]> => {
    const decodeSchema = {
        type: Type.OBJECT,
        properties: {
            results: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        original: { type: Type.STRING },
                        decoded: { type: Type.STRING },
                        explanation: { type: Type.STRING }
                    },
                    required: ["original", "decoded", "explanation"]
                }
            }
        },
        required: ["results"]
    };

    // Batch processing to avoid timeout and handle large amounts of data
    const batchSize = 5;
    const allResults: PowerShellDecodeResult[] = [];

    for (let i = 0; i < commands.length; i += batchSize) {
        const batch = commands.slice(i, i + batchSize);
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `You are a security expert. I will provide a list of PowerShell commands, some of which may contain Base64 encoded payloads (often after -EncodedCommand or -e). 
                Your task is to:
                1. Identify the encoded part.
                2. Decode it to plain text.
                3. Provide a brief explanation of what the command does from a security perspective.
                If a command is not encoded, still return it with its original text as 'decoded' and explain its purpose.

                Commands:
                ${batch.join('\n')}`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: decodeSchema,
                }
            });

            const jsonText = response.text.trim();
            const result = JSON.parse(jsonText) as { results: PowerShellDecodeResult[] };
            allResults.push(...result.results);
        } catch (error) {
            console.error(`Error processing batch ${i / batchSize}:`, error);
            // Push error placeholders if batch fails
            batch.forEach(cmd => allResults.push({
                original: cmd,
                decoded: "ERROR: Decoding failed for this batch",
                explanation: "Could not process this command due to an AI model error or timeout."
            }));
        }
    }

    return allResults;
};

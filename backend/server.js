const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenAI, Type } = require("@google/genai");

// Load environment variables from .env.local in the root directory
dotenv.config({ path: '../.env.local' });

const app = express();
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const caseRoutes = require('./routes/caseRoutes');
const { protect } = require('./middleware/auth');

// Connect to Database
connectDB();
const PORT = process.env.PORT || 3001;

// Middleware
app.use('/api/auth', authRoutes);
app.use('/api/cases', caseRoutes);
app.use(cors());
app.use(express.json());

// VirusTotal Proxy Endpoint
app.get('/api/vt/:type/:id', protect, async (req, res) => {
    try {
        const { type, id } = req.params;
        const vtApiKey = req.headers['x-vt-apikey'];
        
        if (!vtApiKey) {
            return res.status(400).json({ error: "Missing VirusTotal API Key" });
        }

        const vtUrl = `https://www.virustotal.com/api/v3/${type}/${id}`;
        const response = await fetch(vtUrl, {
            method: 'GET',
            headers: {
                'x-apikey': vtApiKey
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return res.status(response.status).json(errorData);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error("VT Proxy Error:", error);
        res.status(500).json({ error: "Internal Server Error in VT Proxy" });
    }
});

app.get('/api/vt/:type/:id/:relationship', protect, async (req, res) => {
    try {
        const { type, id, relationship } = req.params;
        const { limit } = req.query;
        const vtApiKey = req.headers['x-vt-apikey'];
        
        if (!vtApiKey) {
            return res.status(400).json({ error: "Missing VirusTotal API Key" });
        }

        const vtUrl = `https://www.virustotal.com/api/v3/${type}/${id}/${relationship}${limit ? `?limit=${limit}` : ''}`;
        const response = await fetch(vtUrl, {
            method: 'GET',
            headers: {
                'x-apikey': vtApiKey
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return res.status(response.status).json(errorData);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error("VT Relationship Proxy Error:", error);
        res.status(500).json({ error: "Internal Server Error in VT Proxy" });
    }
});

// PowerShell Deobfuscation Endpoint
app.post('/api/analyze-powershell', protect, async (req, res) => {
    try {
        const { commands } = req.body;
        if (!commands || !Array.isArray(commands)) {
            return res.status(400).json({ error: "Missing commands array" });
        }

        const results = [];
        for (const cmd of commands) {
            if (!cmd || cmd.trim() === "") {
                results.push({ original: cmd, decoded: "Empty command", error: null });
                continue;
            }

            try {
                const prompt = `You are a malware analyst. Deobfuscate and explain the following PowerShell command. If it's Base64 encoded, decode it first. Provide the decoded script and a brief summary of what it does.
                
                Command: ${cmd}
                
                Respond in JSON format:
                {
                    "decoded_script": "the full decoded script here",
                    "summary": "brief explanation of the script's purpose",
                    "is_malicious": true/false
                }`;

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                    config: {
                        responseMimeType: 'application/json',
                    }
                });

                const analysis = JSON.parse(response.text.trim());
                results.push({
                    original: cmd,
                    decoded: analysis.decoded_script,
                    summary: analysis.summary,
                    is_malicious: analysis.is_malicious,
                    error: null
                });
            } catch (err) {
                console.error("Error analyzing command:", err);
                results.push({
                    original: cmd,
                    decoded: null,
                    summary: null,
                    error: "Failed to analyze this command"
                });
            }
        }

        res.json({ results });
    } catch (error) {
        console.error("PowerShell Analysis Error:", error);
        res.status(500).json({ error: "Internal Server Error during analysis" });
    }
});

// Initialize Gemini AI
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const JWT_SECRET = process.env.JWT_SECRET;
if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY environment variable not set.");
    process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// --- Gemini API Logic (Copied from geminiService.ts) ---

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

const userAgentAnalysesSchema = {
    type: Type.OBJECT,
    properties: {
        analyses: {
            type: Type.ARRAY,
            description: "An array of security analyses for the provided User-Agent strings.",
            items: {
                type: Type.OBJECT,
                properties: {
                    userAgent: { type: Type.STRING, description: "The original User-Agent string being analyzed." },
                    summary: { type: Type.STRING, description: "A concise summary of potential security risks associated with the User-Agent string. Note if it appears to be a common browser, a bot, a scanner, or indicates an outdated/vulnerable software version." },
                    risk_level: {
                        type: Type.STRING,
                        enum: ["Informational", "Low", "Medium", "High", "Critical"],
                        description: "Assessment of the security risk level."
                    },
                },
                required: ["userAgent", "summary", "risk_level"]
            }
        }
    },
    required: ["analyses"]
};

// --- API Endpoints ---

// POST /api/analyze-event
// All Gemini API routes now require authentication
app.post('/api/analyze-event', protect, async (req, res) => {
    try {
        const { eventLog } = req.body;
        if (!eventLog) {
            return res.status(400).json({ error: "Missing eventLog in request body" });
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Analyze the following security event log and provide a structured analysis. The user is a junior security analyst, so be clear and concise. Event Log: \n\n${eventLog}`,
            config: {
                responseMimeType: 'application/json',
                responseSchema: analysisSchema,
            }
        });

        const jsonText = response.text.trim();
        res.json(JSON.parse(jsonText));

    } catch (error) {
        console.error("Error in /api/analyze-event:", error);
        res.status(500).json({ error: "Failed to analyze event log" });
    }
});

// POST /api/suggest-next-steps
app.post('/api/suggest-next-steps', protect, async (req, res) => {
    try {
        const { caseContext } = req.body;
        if (!caseContext) {
            return res.status(400).json({ error: "Missing caseContext in request body" });
        }

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
        const result = JSON.parse(jsonText);
        res.json(result.steps);

    } catch (error) {
        console.error("Error in /api/suggest-next-steps:", error);
        res.status(500).json({ error: "Failed to suggest next steps" });
    }
});

// POST /api/generate-phase-index
app.post('/api/generate-phase-index', protect, async (req, res) => {
    try {
        const { artifacts } = req.body;
        if (!artifacts) {
            return res.status(400).json({ error: "Missing artifacts in request body" });
        }

        if (artifacts.length === 0) {
            return res.json("No activity recorded for this phase yet.");
        }

        const context = artifacts.map(a => `Title: ${a.title}\nContent: ${JSON.stringify(a.content)}`).join('\n\n');

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Summarize the key findings from the following investigation artifacts for a specific phase of an attack. Provide a concise, bulleted list of the most important points.

Artifacts:
${context}`,
        });

        res.send(response.text);

    } catch (error) {
        console.error("Error in /api/generate-phase-index:", error);
        res.status(500).json({ error: "Failed to generate phase index" });
    }
});

// POST /api/split-and-classify-artifact
app.post('/api/split-and-classify-artifact', protect, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) {
            return res.status(400).json({ error: "Missing content in request body" });
        }

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
        const result = JSON.parse(jsonText);
        res.json(result.chunks);

    } catch (error) {
        console.error("Error in /api/split-and-classify-artifact:", error);
        res.status(500).json({ error: "Failed to split and classify artifact" });
    }
});

// POST /api/generate-global-summary
app.post('/api/generate-global-summary', protect, async (req, res) => {
    try {
        const { caseContext } = req.body;
        if (!caseContext) {
            return res.status(400).json({ error: "Missing caseContext in request body" });
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are an expert security analyst. Based on the entire case context provided, write a high-level executive summary of the investigation so far. Describe the likely attack narrative, what is known, and what is still unknown.

Case Context:
${caseContext}`,
        });

        res.send(response.text);

    } catch (error) {
        console.error("Error in /api/generate-global-summary:", error);
        res.status(500).json({ error: "Failed to generate global summary" });
    }
});

// Helper function to stringify artifact content
const stringifyArtifactContent = (content) => {
    if (content && 'summary' in content) return `AI Analysis Summary: ${content.summary}`;
    if (content && 'text' in content) return content.text;
    if (content && 'output' in content) return `Tool: ${content.toolName}\nCommand: ${content.command || 'N/A'}\nOutput:\n${content.output}`;
    if (content && 'fileName' in content) return `File: ${content.fileName}\nContent:\n${content.content}`;
    return JSON.stringify(content);
}

// POST /api/generate-global-iocs
app.post('/api/generate-global-iocs', protect, async (req, res) => {
    try {
        const { artifacts } = req.body;
        if (!artifacts) {
            return res.status(400).json({ error: "Missing artifacts in request body" });
        }

        // Helper function to stringify content (copied from geminiService.ts)


        const context = artifacts
            .filter(a => a.type !== 'CASE_INDEX' && a.type !== 'TOOL_INFO' && a.type !== 'GLOBAL_SUMMARY' && a.type !== 'GLOBAL_IOC_LIST')
            .map(a => `--- Artifact (Phase: ${a.killChainPhase}) ---\n${stringifyArtifactContent(a.content)}`)
            .join('\n\n');



        if (!context.trim()) {
            return res.json({ iocsByPhase: {} });
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
        const result = JSON.parse(jsonText);
        
        const iocsByPhase = {};
        for (const ioc of result.iocs) {
            const phase = ioc.killChainPhase;
            if (!iocsByPhase[phase]) {
                iocsByPhase[phase] = [];
            }
            // Simple deduplication
            if (!iocsByPhase[phase].some(existing => existing.value === ioc.value)) {
                iocsByPhase[phase].push({ type: ioc.type, value: ioc.value });
            }
        }

        res.json({ iocsByPhase });

    } catch (error) {
        console.error("Error in /api/generate-global-iocs:", error);
        res.status(500).json({ error: "Failed to generate global IoCs" });
    }
});

// POST /api/chat-with-assistant
app.post('/api/chat-with-assistant', protect, async (req, res) => {
    try {
        const { userMessage, caseContext } = req.body;
        if (!userMessage || !caseContext) {
            return res.status(400).json({ error: "Missing userMessage or caseContext in request body" });
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are a world-class senior security analyst AI assistant, named Cyber Sentinel. The user is currently investigating a case. Below is the full context of the case, followed by the user's latest message. Your task is to analyze their message in the context of the case and provide a helpful, concise, and accurate response. You can answer questions, summarize artifacts, suggest investigation steps, and even formulate search queries for the tools mentioned in the 'Investigation Context' artifacts.

--- CASE CONTEXT ---
${caseContext}
--- END CASE CONTEXT ---

User Message: "${userMessage}"`,
        });

        res.send(response.text);

    } catch (error) {
        console.error("Error in /api/chat-with-assistant:", error);
        res.status(500).json({ error: "Failed to chat with assistant" });
    }
});

// POST /api/analyze-user-agents
app.post('/api/analyze-user-agents', protect, async (req, res) => {
    try {
        const { userAgentsWithParsedData } = req.body;
        if (!userAgentsWithParsedData) {
            return res.status(400).json({ error: "Missing userAgentsWithParsedData in request body" });
        }

        const formattedData = userAgentsWithParsedData.map(item => 
            `User-Agent: "${item.userAgent}"\nParsed Data: ${JSON.stringify(item.parsedData, null, 2)}`
        ).join('\n---\n');
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are a security analyst. I have parsed several User-Agent strings and have some preliminary data, including some security flags. Please analyze each one and provide a concise security summary and risk level. Pay attention to outdated versions, anomalies, and any security flags that are true.

List of User-Agents and their parsed data:
${formattedData}`,
            config: {
                responseMimeType: 'application/json',
                responseSchema: userAgentAnalysesSchema,
            }
        });

        const jsonText = response.text.trim();
        const result = JSON.parse(jsonText);
        res.json(result.analyses);

    } catch (error) {
        console.error("Error in /api/analyze-user-agents:", error);
        res.status(500).json({ error: "Failed to analyze user agents" });
    }
});


// Start the server
app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
});




import { GoogleGenAI, Type } from "@google/genai";
import type { TimelineEvent } from '../types.ts';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const timelineEventSchema = {
  type: Type.OBJECT,
  properties: {
    events: {
      type: Type.ARRAY,
      description: "Array of extracted timeline events from the provided data.",
      items: {
        type: Type.OBJECT,
        properties: {
          timestamp: { 
            type: Type.STRING, 
            description: "ISO 8601 formatted timestamp of the event (YYYY-MM-DDTHH:MM:SS)" 
          },
          event: { 
            type: Type.STRING, 
            description: "Brief title/summary of the event" 
          },
          description: { 
            type: Type.STRING, 
            description: "Detailed description of what happened" 
          },
          host: { 
            type: Type.STRING, 
            description: "Host, system, or IP address affected" 
          },
          severity: { 
            type: Type.STRING, 
            enum: ["Low", "Medium", "High", "Critical"],
            description: "Severity level of the event" 
          },
          category: { 
            type: Type.STRING, 
            description: "Event category (e.g., Login, File Access, Network, Process, Registry)" 
          },
          source: { 
            type: Type.STRING, 
            description: "Source of the event (e.g., Windows Event Log, Firewall, IDS)" 
          }
        },
        required: ["timestamp", "event", "severity"]
      }
    }
  },
  required: ["events"]
};

/**
 * Analyzes raw event data and extracts structured timeline events using AI.
 * @param eventData - Raw event log or description
 * @returns Array of structured TimelineEvent objects
 */
export const analyzeAndExtractTimelineEvents = async (eventData: string): Promise<TimelineEvent[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a security analyst expert at parsing event logs and extracting timeline information. 
      
Analyze the following event data and extract all significant security events. For each event:
1. Extract or infer the timestamp (use ISO 8601 format)
2. Create a brief, clear event title
3. Provide detailed description of what happened
4. Identify the affected host/system
5. Assess severity level
6. Categorize the event type
7. Identify the source/log type

Be thorough and extract ALL important events, even if timestamps are approximate.

Event Data:
${eventData}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: timelineEventSchema,
      }
    });

    const jsonText = response.text.trim();
    const result = JSON.parse(jsonText) as { events: TimelineEvent[] };
    
    // Add IDs to events
    return result.events.map((event, index) => ({
      ...event,
      id: `event-${Date.now()}-${index}`,
    }));
  } catch (error) {
    console.error("Error analyzing timeline events:", error);
    throw new Error("Failed to analyze event data and extract timeline events");
  }
};

/**
 * Enriches existing timeline events with additional details.
 * @param event - TimelineEvent to enrich
 * @param additionalContext - Additional context or raw data about the event
 * @returns Enriched TimelineEvent
 */
export const enrichTimelineEvent = async (
  event: TimelineEvent,
  additionalContext: string
): Promise<TimelineEvent> => {
  try {
    const enrichmentSchema = {
      type: Type.OBJECT,
      properties: {
        description: { type: Type.STRING },
        severity: { type: Type.STRING, enum: ["Low", "Medium", "High", "Critical"] },
        category: { type: Type.STRING },
        source: { type: Type.STRING },
        details: {
          type: Type.OBJECT,
          additionalProperties: { type: Type.STRING },
          description: "Additional key-value pairs for custom fields"
        }
      }
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a security analyst. Given the following timeline event and additional context, enrich the event with more detailed information.

Current Event:
Title: ${event.event}
Timestamp: ${event.timestamp}
${event.description ? `Description: ${event.description}` : ''}
${event.host ? `Host: ${event.host}` : ''}
${event.severity ? `Severity: ${event.severity}` : ''}

Additional Context:
${additionalContext}

Provide enriched information including:
1. Enhanced description with more details
2. Reassess severity if needed
3. Provide or confirm category
4. Identify the source
5. Extract any other important details as custom fields`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: enrichmentSchema,
      }
    });

    const jsonText = response.text.trim();
    const enriched = JSON.parse(jsonText);

    return {
      ...event,
      description: enriched.description || event.description,
      severity: enriched.severity || event.severity,
      category: enriched.category || event.category,
      source: enriched.source || event.source,
      details: enriched.details || event.details,
    };
  } catch (error) {
    console.error("Error enriching timeline event:", error);
    return event; // Return original event if enrichment fails
  }
};

/**
 * Correlates multiple timeline events to identify patterns and relationships.
 * @param events - Array of TimelineEvent objects
 * @returns Analysis of correlations and patterns
 */
export const correlateTimelineEvents = async (
  events: TimelineEvent[]
): Promise<{
  patterns: string[];
  correlations: Array<{ events: number[]; description: string }>;
  timeline_summary: string;
}> => {
  try {
    if (events.length === 0) {
      return { patterns: [], correlations: [], timeline_summary: "No events to analyze." };
    }

    const eventsSummary = events
      .map((e, i) => `${i}. [${e.timestamp}] ${e.event} (${e.severity || 'Unknown'}) - ${e.description || ''}`)
      .join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a security analyst expert at identifying attack patterns and correlating events.

Analyze the following timeline of security events and:
1. Identify any attack patterns or suspicious sequences
2. Correlate related events that might indicate a coordinated attack
3. Provide a summary of the overall timeline narrative

Timeline Events:
${eventsSummary}

Provide your analysis in a structured format.`,
    });

    const analysisText = response.text;

    // Parse the response to extract patterns and correlations
    // This is a simplified parsing - in production you'd want structured output
    const patterns: string[] = [];
    const correlations: Array<{ events: number[]; description: string }> = [];

    // Simple heuristic: look for lines that mention patterns
    const lines = analysisText.split('\n');
    let currentSection = '';
    
    for (const line of lines) {
      if (line.toLowerCase().includes('pattern')) {
        currentSection = 'patterns';
      } else if (line.toLowerCase().includes('correlation')) {
        currentSection = 'correlations';
      }

      if (currentSection === 'patterns' && line.trim().startsWith('-')) {
        patterns.push(line.trim().substring(1).trim());
      }
    }

    return {
      patterns,
      correlations,
      timeline_summary: analysisText,
    };
  } catch (error) {
    console.error("Error correlating timeline events:", error);
    throw new Error("Failed to correlate timeline events");
  }
};

/**
 * Generates a summary of the timeline for reporting purposes.
 * @param events - Array of TimelineEvent objects
 * @returns Formatted timeline summary
 */
export const generateTimelineSummary = async (events: TimelineEvent[]): Promise<string> => {
  try {
    if (events.length === 0) {
      return "No events in timeline.";
    }

    const sortedEvents = [...events].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const eventsSummary = sortedEvents
      .map(e => `[${e.timestamp}] ${e.event} (${e.severity || 'Unknown'}) on ${e.host || 'Unknown Host'}\n  ${e.description || 'No description'}`)
      .join('\n\n');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a security analyst creating an executive summary of a security incident timeline.

Based on the following chronological events, create a clear, concise narrative summary suitable for a security report:

${eventsSummary}

Provide a professional summary that:
1. Describes the overall incident narrative
2. Highlights key turning points
3. Identifies the likely attack progression
4. Notes any gaps or unknowns`,
    });

    return response.text;
  } catch (error) {
    console.error("Error generating timeline summary:", error);
    throw new Error("Failed to generate timeline summary");
  }
};

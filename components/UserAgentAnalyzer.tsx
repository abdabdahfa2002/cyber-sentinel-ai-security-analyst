

import React, { useState } from 'react';
import { useLocalization } from './contexts/LocalizationContext.tsx';
import { BrainIcon, FingerPrintIcon, AlertTriangleIcon, DocumentTextIcon, UploadIcon } from './icons';
import { parseUserAgent } from '../services/userAgentService.ts';
import { analyzeUserAgentsSecurity } from '../services/geminiService.ts';
import type { UserAgentAnalysisResult, UserAgentSecurityAnalysis } from '../types.ts';

const riskConfig = {
    Informational: { color: 'text-blue-400', bgColor: 'bg-blue-900/50', borderColor: 'border-blue-700' },
    Low: { color: 'text-green-400', bgColor: 'bg-green-900/50', borderColor: 'border-green-700' },
    Medium: { color: 'text-yellow-400', bgColor: 'bg-yellow-900/50', borderColor: 'border-yellow-700' },
    High: { color: 'text-orange-400', bgColor: 'bg-orange-900/50', borderColor: 'border-orange-700' },
    Critical: { color: 'text-red-400', bgColor: 'bg-red-900/50', borderColor: 'border-red-700' },
};

const UserAgentResultCard: React.FC<{ result: UserAgentAnalysisResult }> = ({ result }) => {
    const { t } = useLocalization();
    const security = result.security;
    const config = security ? riskConfig[security.risk_level] : riskConfig.Informational;
    const parsed = result.parsed;

    // FIX: Explicitly type securityFlags as string[] to help with type inference.
    const securityFlags: string[] = parsed ? Object.entries(parsed)
        .filter(([key, value]) => key.startsWith('is_') && value === true && !['is_mobile', 'is_tablet', 'is_desktop'].includes(key))
        .map(([key]) => key.replace('is_', '')) : [];

    const DetailItem: React.FC<{ label: string; value?: string }> = ({ label, value }) =>
        value ? <div className="text-sm"><strong className="text-gray-400">{label}:</strong> <span className="text-gray-200">{value}</span></div> : null;

    return (
        <div className="bg-sentinel-gray-medium rounded-lg shadow-lg border border-sentinel-gray-light animate-fade-in">
            <div className="p-3 bg-sentinel-gray-dark/50 border-b border-sentinel-gray-light">
                <code className="text-xs text-cyan-300 break-all">{result.userAgentString}</code>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-sentinel-gray-light">
                <div className="bg-sentinel-gray-medium p-4">
                    <h3 className="font-semibold text-gray-100 mb-3 flex items-center"><FingerPrintIcon className="h-5 w-5 me-2 text-sentinel-blue" />{t('parsedInformation')}</h3>
                    {result.parseError && <p className="text-sm text-red-400">{result.parseError}</p>}
                    {result.parsed && (
                        <div className="space-y-2">
                            <DetailItem label={t('browser')} value={`${result.parsed.browser_name || 'N/A'} ${result.parsed.browser_version || ''}`} />
                            <DetailItem label={t('os')} value={`${result.parsed.os_name || 'N/A'} ${result.parsed.os_version || ''}`} />
                            <DetailItem label={t('platform')} value={`${result.parsed.platform_type || 'N/A'} (${result.parsed.platform_name || 'N/A'})`} />
                            <DetailItem label={t('engine')} value={`${result.parsed.engine_name || 'N/A'} ${result.parsed.engine_version || ''}`} />
                             {securityFlags.length > 0 && (
                                <div className="pt-2">
                                    <strong className="text-gray-400 text-sm">{t('securityFlags')}:</strong>
                                    <div className="flex flex-wrap gap-2 mt-1">
                                        {securityFlags.map(flagKey => (
                                            <span key={flagKey} className="px-2 py-1 text-xs font-medium bg-yellow-900/70 text-yellow-300 rounded-full">
                                                {t(flagKey)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                 <div className="bg-sentinel-gray-medium p-4">
                    <h3 className="font-semibold text-gray-100 mb-3 flex items-center"><BrainIcon className="h-5 w-5 me-2 text-sentinel-blue" />{t('aiSecurityAnalysis')}</h3>
                     {result.securityError && <p className="text-sm text-red-400">{result.securityError}</p>}
                     {security && (
                        <div className="space-y-3">
                            <div className={`flex items-center px-3 py-1 rounded-full text-sm font-semibold ${config.bgColor} ${config.color} border ${config.borderColor} w-fit`}>
                                <AlertTriangleIcon className="h-4 w-4 me-2" />
                                {t('riskLevel')}: {security.risk_level}
                            </div>
                            <p className="text-sm text-gray-300 leading-relaxed">{security.summary}</p>
                        </div>
                     )}
                </div>
            </div>
        </div>
    );
};


const UserAgentAnalyzer: React.FC = () => {
    const { t } = useLocalization();
    const [input, setInput] = useState('');
    const [results, setResults] = useState<UserAgentAnalysisResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeInputTab, setActiveInputTab] = useState<'text' | 'file'>('text');
    const [fileName, setFileName] = useState<string | null>(null);

    const handleFileChange = (files: FileList | null) => {
        const file = files?.[0];
        if (!file) return;

        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            setInput(text);
            setActiveInputTab('text');
        };
        reader.onerror = () => {
            console.error("Error reading file");
            setFileName(null);
        };
        reader.readAsText(file);
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        handleFileChange(event.dataTransfer.files);
    };

    // FIX: Refactor handleAnalyze to be robust against 'unknown' error types from catch blocks, ensuring type safety.
    const handleAnalyze = async () => {
        const userAgents = [...new Set(input.split('\n').map(ua => ua.trim()).filter(Boolean))];
        if (userAgents.length === 0) return;

        setIsLoading(true);
        setResults([]);

        // Step 1: Parse all user agents in parallel, safely handling potential errors.
        const parseResults = await Promise.all(userAgents.map(async (ua) => {
            try {
                const parsedData = await parseUserAgent(ua);
                return { userAgent: ua, parsedData, error: null };
            } catch (error) {
                // Ensure caught error is converted to an Error object.
                return { userAgent: ua, parsedData: null, error: error instanceof Error ? error : new Error(String(error)) };
            }
        }));

        // Step 2: Batch analyze for security with successfully parsed data as context.
        const successfulParses = parseResults.filter(p => p.parsedData);
        let securityAnalyses: (UserAgentSecurityAnalysis & { userAgent: string })[] | null = null;
        let securityBatchError: Error | null = null;
        
        if (successfulParses.length > 0) {
            try {
                securityAnalyses = await analyzeUserAgentsSecurity(successfulParses.map(p => ({ userAgent: p.userAgent, parsedData: p.parsedData })));
            } catch (err) {
                console.error("Batch Security Analysis Error:", err);
                // Ensure caught error is converted to an Error object.
                securityBatchError = err instanceof Error ? err : new Error(String(err));
            }
        }
        
        // Step 3: Combine all results into a final structure for rendering.
        const finalResults = userAgents.map(ua => {
            const parseResult = parseResults.find(p => p.userAgent === ua);
            const securityAnalysis = securityAnalyses?.find(s => s.userAgent === ua);
            
            const result: UserAgentAnalysisResult = {
                userAgentString: ua,
                parsed: parseResult?.parsedData || null,
                parseError: parseResult?.error ? t('error_uaParse') : undefined,
                security: securityAnalysis ? { summary: securityAnalysis.summary, risk_level: securityAnalysis.risk_level } : null,
            };

            if (!result.security) {
                if (securityBatchError) {
                    result.securityError = t('error_uaSecurity');
                } else if (successfulParses.some(p => p.userAgent === ua) && !securityAnalyses?.some(s => s.userAgent === ua)) {
                    // This case handles if a single analysis is missing without a batch error.
                    result.securityError = t('error_uaSecurity');
                }
            }

            return result;
        });

        setResults(finalResults);
        setIsLoading(false);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <p className="text-center text-gray-400">{t('uaAnalyzer_desc')}</p>
            <div className="bg-sentinel-gray-medium rounded-lg shadow-xl border border-sentinel-gray-light p-6">
                 <div className="flex border-b border-sentinel-gray-light mb-4">
                    <button
                        onClick={() => setActiveInputTab('text')}
                        className={`flex-1 p-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeInputTab === 'text' ? 'text-sentinel-blue border-b-2 border-sentinel-blue' : 'text-gray-400 hover:bg-sentinel-gray-light/50'}`}
                        disabled={isLoading}
                    >
                        <DocumentTextIcon className="h-5 w-5" />
                        {t('pasteList')}
                    </button>
                    <button
                        onClick={() => setActiveInputTab('file')}
                        className={`flex-1 p-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeInputTab === 'file' ? 'text-sentinel-blue border-b-2 border-sentinel-blue' : 'text-gray-400 hover:bg-sentinel-gray-light/50'}`}
                        disabled={isLoading}
                    >
                        <UploadIcon className="h-5 w-5" />
                        {t('uploadFile')}
                    </button>
                </div>

                {activeInputTab === 'text' ? (
                    <textarea
                        rows={6}
                        className="w-full bg-sentinel-gray-dark border border-sentinel-gray-light rounded-md p-3 text-gray-200 focus:ring-2 focus:ring-sentinel-blue placeholder-gray-500 font-mono text-sm"
                        placeholder={t('pasteUA_placeholder')}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={isLoading}
                    />
                ) : (
                    <div
                        className="flex justify-center items-center w-full"
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                    >
                        <label htmlFor="ua-file-upload" className="flex flex-col justify-center items-center w-full h-32 bg-sentinel-gray-dark rounded-lg border-2 border-sentinel-gray-light border-dashed cursor-pointer hover:bg-sentinel-gray-light">
                            <UploadIcon className="w-10 h-10 mb-3 text-gray-400" />
                            {fileName ? (
                                <p className="text-sm text-sentinel-green">{fileName}</p>
                            ) : (
                                <>
                                    <p className="mb-2 text-sm text-gray-400"><span className="font-semibold">{t('clickToUpload')}</span> {t('orDragAndDrop')}</p>
                                    <p className="text-xs text-gray-500">{t('textBasedFiles')}</p>
                                </>
                            )}
                            <input id="ua-file-upload" type="file" className="hidden" accept=".txt,.log" onChange={(e) => handleFileChange(e.target.files)} disabled={isLoading} />
                        </label>
                    </div>
                )}
                <div className="mt-4 flex justify-end">
                    <button
                        onClick={handleAnalyze}
                        disabled={isLoading || !input.trim()}
                        className="flex items-center justify-center px-6 py-2 border border-transparent text-base font-medium rounded-md text-white bg-sentinel-blue hover:bg-cyan-600 disabled:opacity-50"
                    >
                         {isLoading ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                {t('analyzing')}...
                            </>
                        ) : t('analyze')}
                    </button>
                </div>
            </div>

            {results.length > 0 && (
                <div className="space-y-4">
                    {results.map((result, index) => (
                        <UserAgentResultCard key={index} result={result} />
                    ))}
                </div>
            )}
            <style>{`
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in {
                    animation: fade-in 0.3s ease-out forwards;
                }
            `}</style>
        </div>
    );
};

export default UserAgentAnalyzer;
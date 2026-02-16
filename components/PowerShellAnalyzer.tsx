import React, { useState } from 'react';
import { UploadIcon, DownloadIcon, DocumentTextIcon, InfoIcon, XCircleIcon } from './icons';
import { useLocalization } from './contexts/LocalizationContext.tsx';

interface PSAnalysisResult {
    original: string;
    decoded: string | null;
    summary: string | null;
    is_malicious?: boolean;
    error: string | null;
}

const PowerShellAnalyzer: React.FC = () => {
    const { t } = useLocalization();
    const [results, setResults] = useState<PSAnalysisResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            const lines = text.split('\n');
            const headers = lines[0].split(',');
            const cmdIndex = headers.findIndex(h => h.trim().toLowerCase() === 'commandline');

            if (cmdIndex === -1) {
                setError('Could not find "CommandLine" column in CSV.');
                return;
            }

            const commands = lines.slice(1)
                .map(line => {
                    const parts = line.split(',');
                    return parts[cmdIndex]?.trim();
                })
                .filter(cmd => cmd && cmd.toLowerCase().includes('powershell'));

            if (commands.length === 0) {
                setError('No PowerShell commands found in the file.');
                return;
            }

            await analyzeCommands(commands);
        };
        reader.readAsText(file);
    };

    const analyzeCommands = async (commands: string[]) => {
        setIsLoading(true);
        setError(null);
        setStatus('Analyzing commands with Gemini AI...');

        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/analyze-powershell', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ commands })
            });

            if (!response.ok) throw new Error('Failed to analyze commands');

            const data = await response.json();
            setResults(data.results);
            setStatus(`Analysis complete. Processed ${data.results.length} commands.`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const downloadResults = () => {
        const headers = ['Original Command', 'Decoded Script', 'Summary', 'Is Malicious'];
        const csvRows = [headers.join(',')];

        results.forEach(res => {
            const row = [
                `"${res.original.replace(/"/g, '""')}"`,
                `"${(res.decoded || '').replace(/"/g, '""')}"`,
                `"${(res.summary || '').replace(/"/g, '""')}"`,
                res.is_malicious ? 'Yes' : 'No'
            ];
            csvRows.push(row.join(','));
        });

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'powershell_analysis.csv';
        a.click();
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="bg-sentinel-gray-medium rounded-lg shadow-lg border border-sentinel-gray-light p-6">
                <h2 className="text-2xl font-bold text-gray-100 mb-4 flex items-center">
                    <DocumentTextIcon className="h-8 w-8 mr-3 text-sentinel-blue" />
                    PowerShell Log Analyzer
                </h2>
                <p className="text-gray-400 mb-6">
                    Upload a CSV file containing process logs. This tool will extract PowerShell commands, 
                    deobfuscate them using Gemini AI, and provide a security summary.
                </p>

                <div className="flex flex-col items-center justify-center border-2 border-dashed border-sentinel-gray-light rounded-xl p-12 bg-sentinel-gray-dark/50 hover:bg-sentinel-gray-dark transition-colors">
                    <UploadIcon className="h-12 w-12 text-sentinel-blue mb-4" />
                    <label className="cursor-pointer bg-sentinel-blue hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                        Upload CSV File
                        <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={isLoading} />
                    </label>
                    <p className="text-xs text-gray-500 mt-4">Expected column: "CommandLine"</p>
                </div>

                {isLoading && (
                    <div className="mt-6 flex items-center justify-center space-x-3 text-sentinel-blue">
                        <div className="w-5 h-5 border-2 border-dashed rounded-full animate-spin border-current"></div>
                        <span>{status}</span>
                    </div>
                )}

                {error && (
                    <div className="mt-6 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-400 flex items-center">
                        <XCircleIcon className="h-5 w-5 mr-3" />
                        {error}
                    </div>
                )}
            </div>

            {results.length > 0 && (
                <div className="bg-sentinel-gray-medium rounded-lg shadow-lg border border-sentinel-gray-light overflow-hidden">
                    <div className="p-4 border-b border-sentinel-gray-light flex justify-between items-center bg-sentinel-gray-dark/30">
                        <h3 className="font-bold text-gray-200">Analysis Results ({results.length})</h3>
                        <button 
                            onClick={downloadResults}
                            className="flex items-center text-sm bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-md transition-colors"
                        >
                            <DownloadIcon className="h-4 w-4 mr-2" />
                            Download CSV
                        </button>
                    </div>
                    <div className="divide-y divide-sentinel-gray-light">
                        {results.map((res, idx) => (
                            <div key={idx} className="p-6 hover:bg-sentinel-gray-dark/20 transition-colors">
                                <div className="flex justify-between items-start mb-4">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${res.is_malicious ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'}`}>
                                        {res.is_malicious ? 'POTENTIALLY MALICIOUS' : 'LIKELY BENIGN'}
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Original Command</h4>
                                        <pre className="bg-black/40 p-3 rounded text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                                            {res.original}
                                        </pre>
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Decoded Script</h4>
                                        <pre className="bg-sentinel-gray-dark p-3 rounded text-xs text-cyan-300 overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                                            {res.decoded || 'Analysis failed'}
                                        </pre>
                                    </div>
                                </div>
                                <div className="mt-4 p-3 bg-blue-900/20 border border-blue-800/30 rounded-lg">
                                    <div className="flex items-start">
                                        <InfoIcon className="h-5 w-5 text-blue-400 mr-3 mt-0.5" />
                                        <p className="text-sm text-blue-200">{res.summary || 'No summary available'}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PowerShellAnalyzer;

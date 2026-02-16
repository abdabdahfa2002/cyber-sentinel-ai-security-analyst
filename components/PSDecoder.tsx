
import React, { useState } from 'react';
import { useLocalization } from './contexts/LocalizationContext.tsx';
import { decodePowerShell, PowerShellDecodeResult } from '../services/geminiService.ts';
import { CommandLineIcon, ArrowDownTrayIcon, DocumentArrowUpIcon, XMarkIcon } from './icons.tsx';

// Simple CSV parser function to avoid external dependency issues in this environment
// but with better handling of quotes and commas
const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentCell += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentCell.trim());
            currentCell = '';
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (currentCell !== '' || currentRow.length > 0) {
                currentRow.push(currentCell.trim());
                rows.push(currentRow);
                currentRow = [];
                currentCell = '';
            }
            if (char === '\r' && nextChar === '\n') i++;
        } else {
            currentCell += char;
        }
    }
    
    if (currentCell !== '' || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
    }
    
    return rows;
};

const PSDecoder: React.FC = () => {
    const { t } = useLocalization();
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState<PowerShellDecodeResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
    const [csvRows, setCsvRows] = useState<string[][]>([]);

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Reset state
        setResults([]);
        setError(null);
        setProgress(0);

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            if (!text) return;

            try {
                const allRows = parseCSV(text);
                if (allRows.length < 2) {
                    setError(t('error_csvParse'));
                    return;
                }

                const headers = allRows[0];
                const rows = allRows.slice(1);
                
                setCsvHeaders(headers);
                setCsvRows(rows);

                // Find PowerShell commands (usually in columns named 'command', 'process', 'arguments', etc.)
                const commandColIndex = headers.findIndex(h => 
                    /command|process|args|argument|line/i.test(h)
                );

                if (commandColIndex === -1) {
                    setError(t('error_noPowerShellFound'));
                    return;
                }

                const commandsToProcess = rows
                    .map(row => row[commandColIndex])
                    .filter(cmd => cmd && cmd.length > 5);
                
                if (commandsToProcess.length === 0) {
                    setError(t('error_noPowerShellFound'));
                    return;
                }

                setIsLoading(true);
                
                // Process in smaller batches manually here to update progress bar
                const batchSize = 5;
                const finalResults: PowerShellDecodeResult[] = [];
                
                for (let i = 0; i < commandsToProcess.length; i += batchSize) {
                    const batch = commandsToProcess.slice(i, i + batchSize);
                    const batchResults = await decodePowerShell(batch);
                    finalResults.push(...batchResults);
                    setProgress(Math.min(Math.round(((i + batch.length) / commandsToProcess.length) * 100), 100));
                }
                
                setResults(finalResults);
            } catch (err) {
                console.error("CSV Processing Error:", err);
                setError(t('error_csvParse'));
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsText(file);
    };

    const downloadDecodedCsv = () => {
        if (results.length === 0) return;

        // Create new CSV content
        const newHeaders = [...csvHeaders, 'Decoded_Command', 'AI_Explanation'];
        
        const commandColIndex = csvHeaders.findIndex(h => 
            /command|process|args|argument|line/i.test(h)
        );

        const escapeCSV = (val: string) => `"${val.replace(/"/g, '""')}"`;

        const newRows = csvRows.map(row => {
            const originalCmd = row[commandColIndex];
            const decodeResult = results.find(r => r.original === originalCmd);
            
            const escapedRow = row.map(cell => escapeCSV(cell));
            
            return [
                ...escapedRow,
                decodeResult ? escapeCSV(decodeResult.decoded) : '""',
                decodeResult ? escapeCSV(decodeResult.explanation) : '""'
            ];
        });

        const csvContent = [
            newHeaders.join(','),
            ...newRows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'decoded_powershell_logs.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-sentinel-gray-medium rounded-xl p-6 border border-sentinel-gray-light shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                    <CommandLineIcon className="h-8 w-8 text-sentinel-blue" />
                    <div>
                        <h2 className="text-2xl font-bold text-gray-100">{t('psDecoder')}</h2>
                        <p className="text-gray-400 text-sm">{t('psDecoder_desc')}</p>
                    </div>
                </div>

                <div className="mt-6">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-sentinel-gray-light rounded-lg cursor-pointer hover:bg-sentinel-gray-light/30 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <DocumentArrowUpIcon className="w-10 h-10 mb-3 text-gray-400" />
                            <p className="mb-2 text-sm text-gray-400">
                                <span className="font-semibold">{t('uploadCsv')}</span>
                            </p>
                        </div>
                        <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} disabled={isLoading} />
                    </label>
                </div>

                {error && (
                    <div className="mt-4 p-4 bg-red-900/30 border border-red-500/50 rounded-lg flex items-center gap-3 text-red-200">
                        <XMarkIcon className="h-5 w-5" />
                        <span>{error}</span>
                    </div>
                )}

                {isLoading && (
                    <div className="mt-8 space-y-4">
                        <div className="w-full bg-sentinel-gray-dark rounded-full h-4 overflow-hidden">
                            <div 
                                className="bg-sentinel-blue h-full transition-all duration-500 ease-out"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                        <div className="text-center">
                            <p className="text-gray-300 font-medium">{t('decoding')} ({progress}%)</p>
                        </div>
                    </div>
                )}

                {results.length > 0 && !isLoading && (
                    <div className="mt-8 space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-semibold text-gray-200">{t('decodeResults')}</h3>
                            <button 
                                onClick={downloadDecodedCsv}
                                className="flex items-center gap-2 bg-sentinel-blue hover:bg-cyan-500 text-white px-4 py-2 rounded-lg transition shadow-lg"
                            >
                                <ArrowDownTrayIcon className="h-5 w-5" />
                                {t('downloadDecodedCsv')}
                            </button>
                        </div>

                        <div className="overflow-x-auto rounded-lg border border-sentinel-gray-light">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-sentinel-gray-dark text-gray-300 uppercase font-medium">
                                    <tr>
                                        <th className="px-4 py-3">{t('originalCommand')}</th>
                                        <th className="px-4 py-3">{t('decodedCommand')}</th>
                                        <th className="px-4 py-3">{t('aiExplanation')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-sentinel-gray-light">
                                    {results.map((res, idx) => (
                                        <tr key={idx} className="hover:bg-sentinel-gray-light/20 transition-colors">
                                            <td className="px-4 py-4 text-gray-400 font-mono break-all max-w-xs">{res.original}</td>
                                            <td className="px-4 py-4 text-sentinel-green font-mono break-all max-w-xs">{res.decoded}</td>
                                            <td className="px-4 py-4 text-gray-300">{res.explanation}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
            <style>{` @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } } .animate-fade-in { animation: fade-in 0.3s ease-out forwards; } `}</style>
        </div>
    );
};

export default PSDecoder;

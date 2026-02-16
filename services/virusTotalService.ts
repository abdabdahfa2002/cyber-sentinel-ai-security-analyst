import type { VTDomainReport, VTFileReport, VTRelationship, VTIPAddressReport, VTURLReport } from '../types.ts';

// Using our local backend proxy instead of a public CORS proxy
const API_BASE_URL = '/api/vt';

const fetchFromVT = async (apiKey: string, endpoint: string) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
        method: 'GET',
        headers: {
            'x-vt-apikey': apiKey,
            'Authorization': `Bearer ${token}`
        },
    });

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('Item not found in VirusTotal.');
        }
        if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait.');
        }
        if (response.status === 401) {
            throw new Error('Authentication failed. Check your API key or login session.');
        }
        
        try {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `API Error: ${response.statusText}`);
        } catch (e) {
            throw new Error(`API returned status ${response.status}. Please check the item and your key.`);
        }
    }

    const data = await response.json();
    return data.data;
}

export const getDomainReport = async (apiKey: string, domain: string): Promise<VTDomainReport> => {
  const data = await fetchFromVT(apiKey, `domains/${domain}`);
  return { ...data, type: 'domain' };
};

export const getFileReport = async (apiKey: string, hash: string): Promise<VTFileReport> => {
    const data = await fetchFromVT(apiKey, `files/${hash}`);
    return { ...data, type: 'file' };
};

export const getIPReport = async (apiKey: string, ip: string): Promise<VTIPAddressReport> => {
    const data = await fetchFromVT(apiKey, `ip_addresses/${ip}`);
    return { ...data, type: 'ip_address' };
};

const getURLIdentifier = (url: string): string => {
    return btoa(url).replace(/=/g, '');
};

export const getURLReport = async (apiKey: string, url: string): Promise<VTURLReport> => {
    const identifier = getURLIdentifier(url);
    const data = await fetchFromVT(apiKey, `urls/${identifier}`);
    return { ...data, type: 'url' };
};

export const getRelationship = async (apiKey: string, iocType: 'domains' | 'files' | 'ip_addresses' | 'urls', iocId: string, relationship: string): Promise<VTRelationship[]> => {
    let endpoint = `${iocType}/${iocId}/${relationship}?limit=10`;
    if (iocType === 'urls') {
        const urlIdentifier = getURLIdentifier(iocId);
        endpoint = `urls/${urlIdentifier}/${relationship}?limit=10`;
    }

    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
        method: 'GET',
        headers: {
            'x-vt-apikey': apiKey,
            'Authorization': `Bearer ${token}`
        },
    });

    if (!response.ok) {
        if (response.status === 403) {
            throw new Error(`Access denied. This feature may require a premium VirusTotal API key.`);
        }
        throw new Error(`Failed to fetch relationship data. Status: ${response.status}`);
    }

    const data = await response.json();
    return data.data as VTRelationship[];
};

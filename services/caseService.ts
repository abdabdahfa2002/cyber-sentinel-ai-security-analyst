export const fetchCases = async (token: string) => [];
export const createCase = async (caseData: any, token: string) => ({ ...caseData, _id: 'mock-id' });
export const updateCase = async (caseId: string, updates: any, token: string) => ({ _id: caseId, ...updates });

export type AccessResult = 'granted' | 'denied';

export interface AccessLogItem {
    id: string;
    nfcUid: string;
    userName: string;
    result: AccessResult;
    createdAt: string;
}

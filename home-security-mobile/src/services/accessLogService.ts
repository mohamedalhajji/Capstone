import { api } from '../api/client';
import { AccessLogItem } from '../types/accessLog';

type BackendAccessLog = {
    id: number;
    nfc_uid: string;
    user_name: string;
    access_result: AccessLogItem['result'];
    created_at: string;
};

function mapAccessLog(row: BackendAccessLog): AccessLogItem {
    return {
        id: String(row.id),
        nfcUid: row.nfc_uid,
        userName: row.user_name,
        result: row.access_result,
        createdAt: row.created_at,
    };
}

export const accessLogService = {
    async getAccessLogs(): Promise<AccessLogItem[]> {
        const { data } = await api.get<BackendAccessLog[]>('/access-logs');
        return data.map(mapAccessLog);
    },
};

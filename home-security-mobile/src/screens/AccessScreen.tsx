import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAccessLogs } from '../hooks/useAccessLogs';
import { AccessLogItem } from '../types/accessLog';
import { Card, ScreenState, StatusBadge } from '../ui/components';
import { FadeInView } from '../ui/FadeInView';
import { colors, spacing } from '../ui/theme';

const resultColors: Record<AccessLogItem['result'], string> = {
    granted: colors.success,
    denied: colors.danger,
};

function AccessLogRow({ item }: { item: AccessLogItem }) {
    const color = resultColors[item.result] ?? colors.muted;

    return (
        <Card accentColor={item.result === 'denied' ? colors.danger : undefined}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <View
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        backgroundColor: `${color}22`,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <MaterialCommunityIcons
                        name={item.result === 'granted' ? 'account-check-outline' : 'account-cancel-outline'}
                        size={24}
                        color={color}
                    />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>{item.userName}</Text>
                    <Text style={{ color: colors.muted }}>UID: {item.nfcUid}</Text>
                    <Text style={{ color: colors.subtle, fontSize: 12 }}>{item.createdAt}</Text>
                </View>
                <StatusBadge label={item.result.toUpperCase()} color={color} />
            </View>
        </Card>
    );
}

export default function AccessScreen() {
    const { data: accessLogs, isLoading, isError } = useAccessLogs();

    if (isLoading) {
        return <ScreenState title="Loading access logs" loading />;
    }

    if (isError) {
        return <ScreenState title="Access logs unavailable" message="The app could not read NFC attempts from the backend." />;
    }

    return (
        <FadeInView>
        <ScrollView contentContainerStyle={{ padding: spacing.page, gap: spacing.gap, backgroundColor: colors.background }}>
            <Card>
                <Text style={{ color: colors.text, fontSize: 20, fontWeight: '900' }}>NFC Attempts</Text>
                <Text style={{ color: colors.muted }}>
                    Successful and denied card reads are recorded here for auditing.
                </Text>
            </Card>

            {accessLogs?.length ? (
                accessLogs.map((item) => <AccessLogRow key={item.id} item={item} />)
            ) : (
                <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 24 }}>
                    No NFC attempts recorded yet.
                </Text>
            )}
        </ScrollView>
        </FadeInView>
    );
}

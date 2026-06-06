import React, { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAccessLogs } from '../hooks/useAccessLogs';
import { useEvents } from '../hooks/useEvents';
import { useSensors } from '../hooks/useSensors';
import { useSystemState } from '../hooks/useSystemState';
import { useAuth } from '../auth/AuthContext';
import { useSensorAliases } from '../hooks/useSensorAliases';
import { AccessLogItem } from '../types/accessLog';
import { EventItem } from '../types/event';
import { SensorItem } from '../types/sensor';
import { Card, CommandButton, ScreenState, SegmentedControl, StatusBadge } from '../ui/components';
import { FadeInView } from '../ui/FadeInView';
import { colors, radii, spacing } from '../ui/theme';

type ActivityMode = 'sensors' | 'events' | 'access';

const severityColors: Record<EventItem['severity'], string> = {
    info: colors.primary,
    low: colors.primary,
    warning: colors.warning,
    high: colors.critical,
    critical: colors.critical,
};

const resultColors: Record<AccessLogItem['result'], string> = {
    granted: colors.success,
    denied: colors.danger,
};

const statusColors: Record<SensorItem['status'], string> = {
    idle: colors.success,
    safe: colors.success,
    warning: colors.warning,
    triggered: colors.danger,
    critical: colors.critical,
};

const sensorIcons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
    motion: 'motion-sensor',
    gas: 'smoke-detector-outline',
    smoke: 'smoke-detector-outline',
    flame: 'fire',
    door: 'door',
    vibration: 'vibrate',
    window_vibration: 'vibrate',
    nfc: 'nfc',
};

function eventIcon(event: EventItem): keyof typeof MaterialCommunityIcons.glyphMap {
    if (event.type.includes('flame')) return 'fire-alert';
    if (event.type.includes('gas')) return 'smoke-detector-alert-outline';
    if (event.type.includes('access')) return 'badge-account-horizontal-outline';
    if (event.type.includes('motion')) return 'motion-sensor';
    if (event.type.includes('door')) return 'door-open';
    if (event.type.includes('vibration')) return 'vibrate';
    return 'alert-circle-outline';
}

function RowIcon({
    icon,
    color,
}: {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    color: string;
}) {
    return (
        <View
            style={{
                width: 38,
                height: 38,
                borderRadius: radii.md,
                backgroundColor: `${color}22`,
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <MaterialCommunityIcons name={icon} size={22} color={color} />
        </View>
    );
}

function formatDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function SensorRow({ sensor }: { sensor: SensorItem }) {
    const color = statusColors[sensor.status] ?? colors.muted;
    const isTriggered = sensor.status === 'triggered' || sensor.status === 'warning' || sensor.status === 'critical';
    const hasTriggerRecord = isTriggered || sensor.value !== undefined;

    return (
        <Card accentColor={sensor.status === 'triggered' || sensor.status === 'critical' ? color : undefined}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <RowIcon icon={sensorIcons[sensor.type] ?? 'chip'} color={color} />
                <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '900' }}>{sensor.label}</Text>
                    <Text style={{ color: colors.muted, marginTop: 2 }}>{sensor.location} / {sensor.type}</Text>
                </View>
                <StatusBadge label={sensor.status.toUpperCase()} color={color} />
            </View>
            {hasTriggerRecord && <Text style={{ color: colors.muted }}>Triggered: {formatDateTime(sensor.lastUpdated)}</Text>}
        </Card>
    );
}

function EventRow({ event }: { event: EventItem }) {
    const color = severityColors[event.severity] ?? colors.muted;

    return (
        <Card accentColor={event.severity === 'critical' ? colors.critical : undefined}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <RowIcon icon={eventIcon(event)} color={color} />
                <View style={{ flex: 1, gap: 5 }}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '900', flexShrink: 1 }}>
                            {event.title}
                        </Text>
                        <StatusBadge label={event.severity.toUpperCase()} color={color} />
                    </View>
                    <Text style={{ color: colors.muted, lineHeight: 19 }}>{event.message}</Text>
                    <Text style={{ color: colors.subtle, fontSize: 12 }}>{formatDateTime(event.createdAt)}</Text>
                </View>
            </View>
        </Card>
    );
}

function AccessRow({ item }: { item: AccessLogItem }) {
    const color = resultColors[item.result] ?? colors.muted;

    return (
        <Card accentColor={item.result === 'denied' ? colors.danger : undefined}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <RowIcon
                    icon={item.result === 'granted' ? 'account-check-outline' : 'account-cancel-outline'}
                    color={color}
                />
                <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '900' }}>{item.userName}</Text>
                    <Text style={{ color: colors.muted }}>UID: {item.nfcUid}</Text>
                    <Text style={{ color: colors.subtle, fontSize: 12 }}>{formatDateTime(item.createdAt)}</Text>
                </View>
                <StatusBadge label={item.result.toUpperCase()} color={color} />
            </View>
        </Card>
    );
}

export default function ActivityScreen() {
    const [mode, setMode] = useState<ActivityMode>('sensors');
    const { user } = useAuth();
    const sensors = useSensors();
    const { aliases } = useSensorAliases(user?.id);
    const events = useEvents();
    const accessLogs = useAccessLogs();
    const { resetSensors, resettingSensors } = useSystemState();

    const loading =
        mode === 'sensors' ? sensors.isLoading : mode === 'events' ? events.isLoading : accessLogs.isLoading;
    const error =
        mode === 'sensors' ? sensors.isError : mode === 'events' ? events.isError : accessLogs.isError;

    const sensorsWithAliases = sensors.data?.map((sensor) => ({ ...sensor, label: aliases[sensor.id] || sensor.label })) ?? [];
    const triggeredCount =
        sensorsWithAliases.filter((sensor) => sensor.status === 'triggered' || sensor.status === 'critical').length;

    const confirmResetSensors = () => {
        Alert.alert(
            'Reset sensors?',
            'This disarms the system, clears active sensor alerts, and turns off buzzer/sprinkler outputs. It does not delete history.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: () => {
                        resetSensors().catch((err) => {
                            Alert.alert('Reset failed', err instanceof Error ? err.message : 'Unknown error');
                        });
                    },
                },
            ]
        );
    };

    if (loading) {
        return <ScreenState title="Loading activity" loading />;
    }

    if (error) {
        return <ScreenState title="Activity unavailable" message="The app could not read records from the backend." />;
    }

    return (
        <FadeInView>
            <ScrollView contentContainerStyle={{ padding: spacing.page, gap: spacing.gap, backgroundColor: colors.background }}>
                <SegmentedControl
                    value={mode}
                    onChange={setMode}
                    options={[
                        { value: 'sensors', label: 'Sensors', icon: 'radar' },
                        { value: 'events', label: 'Events', icon: 'timeline-alert-outline' },
                        { value: 'access', label: 'Access', icon: 'badge-account-horizontal-outline' },
                    ]}
                />

                {mode === 'sensors' && (
                    <>
                        <Card accentColor={triggeredCount > 0 ? colors.danger : colors.success}>
                            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900', flex: 1 }}>
                                    {triggeredCount > 0
                                        ? `${triggeredCount} sensor alert${triggeredCount > 1 ? 's' : ''}`
                                        : 'All sensors idle'}
                                </Text>
                                <CommandButton
                                    label="Reset"
                                    icon="restore"
                                    tone={triggeredCount > 0 ? 'danger' : 'default'}
                                    disabled={resettingSensors}
                                    onPress={confirmResetSensors}
                                />
                            </View>
                        </Card>
                        {sensorsWithAliases.map((sensor) => <SensorRow key={sensor.id} sensor={sensor} />)}
                    </>
                )}

                {mode === 'events' && (
                    events.data?.length ? (
                        events.data.map((event) => <EventRow key={event.id} event={event} />)
                    ) : (
                        <Card>
                            <Text style={{ color: colors.muted, textAlign: 'center' }}>No events yet.</Text>
                        </Card>
                    )
                )}

                {mode === 'access' && (
                    accessLogs.data?.length ? (
                        accessLogs.data.map((item) => <AccessRow key={item.id} item={item} />)
                    ) : (
                        <Card>
                            <Text style={{ color: colors.muted, textAlign: 'center' }}>No NFC attempts yet.</Text>
                        </Card>
                    )
                )}
            </ScrollView>
        </FadeInView>
    );
}

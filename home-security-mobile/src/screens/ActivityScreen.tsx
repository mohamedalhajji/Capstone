import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAccessLogs } from '../hooks/useAccessLogs';
import { useEvents } from '../hooks/useEvents';
import { useSensors } from '../hooks/useSensors';
import { useSystemState } from '../hooks/useSystemState';
import { useAuth } from '../auth/AuthContext';
import { useSensorAliases } from '../hooks/useSensorAliases';
import { useHouseMap } from '../hooks/useHouseMap';
import { AccessLogItem } from '../types/accessLog';
import { EventItem } from '../types/event';
import { SensorItem } from '../types/sensor';
import { ensureDefaultSensorItems } from '../services/sensorService';
import { Card, CommandButton, ScreenState, SegmentedControl, StatusBadge } from '../ui/components';
import { FadeInView } from '../ui/FadeInView';
import { colors, radii, spacing } from '../ui/theme';

type ActivityMode = 'sensors' | 'events' | 'access';
type SensorFilter = 'all' | 'smoke' | 'fire' | 'motion' | 'reed' | 'vibration' | 'nfc';

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
    door: 'window-closed-variant',
    vibration: 'vibrate',
    window_vibration: 'vibrate',
    nfc: 'nfc-search-variant',
};

const sensorTypeOrder: Record<SensorFilter, number> = {
    all: 0,
    smoke: 1,
    fire: 2,
    motion: 3,
    reed: 4,
    vibration: 5,
    nfc: 6,
};

const locationOrder: Record<string, number> = {
    Kitchen: 1,
    Hallway: 2,
    'Living Room': 3,
    'Room 1': 4,
    'Room 2': 5,
    Garage: 6,
    'Window 1': 7,
    'Window 2': 8,
    'Window 3': 9,
    'Garage Door': 10,
    'Main Door': 11,
};

const sensorFilterLabels: Record<SensorFilter, string> = {
    all: 'All',
    smoke: 'Smoke',
    fire: 'Fire',
    motion: 'Motion',
    reed: 'Reed',
    vibration: 'Vibration',
    nfc: 'NFC',
};

function sensorFilterForType(type: SensorItem['type']): SensorFilter {
    if (type === 'smoke' || type === 'gas') return 'smoke';
    if (type === 'flame') return 'fire';
    if (type === 'door') return 'reed';
    if (type === 'vibration' || type === 'window_vibration') return 'vibration';
    if (type === 'nfc') return 'nfc';
    return 'motion';
}

function compareSensors(a: SensorItem, b: SensorItem) {
    const typeDelta = sensorTypeOrder[sensorFilterForType(a.type)] - sensorTypeOrder[sensorFilterForType(b.type)];
    if (typeDelta !== 0) return typeDelta;

    const locationDelta = (locationOrder[a.location] ?? 99) - (locationOrder[b.location] ?? 99);
    if (locationDelta !== 0) return locationDelta;

    return a.label.localeCompare(b.label);
}

function mappedLocationForSensor(sensorId: string | undefined, roomBySensorId: Map<string, string>) {
    if (!sensorId) return '';
    return roomBySensorId.get(sensorId) ?? '';
}

function eventIcon(event: EventItem): keyof typeof MaterialCommunityIcons.glyphMap {
    if (event.type.includes('flame')) return 'fire';
    if (event.type.includes('smoke')) return 'smoke-detector-alert-outline';
    if (event.type.includes('gas')) return 'smoke-detector-alert-outline';
    if (event.type.includes('access')) return 'badge-account-horizontal-outline';
    if (event.type.includes('motion')) return 'motion-sensor';
    if (event.type.includes('window') || event.type.includes('door_breach')) return 'window-open-variant';
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
                    {!!sensor.location && <Text style={{ color: colors.muted, marginTop: 2 }}>{sensor.location}</Text>}
                </View>
                <StatusBadge label={sensor.status.toUpperCase()} color={color} />
            </View>
            {hasTriggerRecord && <Text style={{ color: colors.muted }}>Triggered: {formatDateTime(sensor.lastUpdated)}</Text>}
        </Card>
    );
}

function SensorFilterBar({
    value,
    options,
    onChange,
}: {
    value: SensorFilter;
    options: SensorFilter[];
    onChange: (value: SensorFilter) => void;
}) {
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {options.map((option) => {
                const active = option === value;
                return (
                    <Pressable
                        key={option}
                        onPress={() => onChange(option)}
                        style={{
                            minHeight: 38,
                            paddingHorizontal: 14,
                            borderRadius: radii.md,
                            borderWidth: 1,
                            borderColor: active ? colors.primary : colors.border,
                            backgroundColor: active ? colors.primary : colors.surfaceAlt,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Text style={{ color: active ? colors.background : colors.text, fontWeight: '900' }}>
                            {sensorFilterLabels[option]}
                        </Text>
                    </Pressable>
                );
            })}
        </ScrollView>
    );
}

function EventRow({ event, roomBySensorId }: { event: EventItem; roomBySensorId: Map<string, string> }) {
    const color = severityColors[event.severity] ?? colors.muted;
    const mappedLocation = mappedLocationForSensor(event.sensorId, roomBySensorId);

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
                    {!!mappedLocation && <Text style={{ color: colors.muted, lineHeight: 19 }}>{mappedLocation}</Text>}
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
    const [sensorFilter, setSensorFilter] = useState<SensorFilter>('all');
    const { user } = useAuth();
    const sensors = useSensors();
    const { aliases } = useSensorAliases(user?.id);
    const { layout: houseMap } = useHouseMap(user?.id);
    const events = useEvents();
    const accessLogs = useAccessLogs();
    const { resetSensors, resettingSensors } = useSystemState();

    const loading =
        mode === 'sensors' ? sensors.isLoading : mode === 'events' ? events.isLoading : accessLogs.isLoading;
    const error =
        mode === 'sensors' ? sensors.isError : mode === 'events' ? events.isError : accessLogs.isError;

    const roomBySensorId = React.useMemo(() => {
        const lookup = new Map<string, string>();
        houseMap.rooms.forEach((room) => {
            room.deviceIds.forEach((deviceId) => lookup.set(deviceId, room.label));
        });
        return lookup;
    }, [houseMap.rooms]);

    const normalizedSensors = ensureDefaultSensorItems(sensors.data ?? []);
    const sensorsWithAliases = normalizedSensors.map((sensor) => ({
        ...sensor,
        label: aliases[sensor.id] || sensor.label,
        location: mappedLocationForSensor(sensor.id, roomBySensorId),
    }));
    const sortedSensors = [...sensorsWithAliases].sort(compareSensors);
    const sensorFilterOptions = [
        'all',
        ...Array.from(new Set(sortedSensors.map((sensor) => sensorFilterForType(sensor.type)))).sort(
            (a, b) => (sensorTypeOrder[a] ?? 99) - (sensorTypeOrder[b] ?? 99)
        ),
    ] as SensorFilter[];
    const visibleSensors = sortedSensors.filter((sensor) => sensorFilter === 'all' || sensorFilterForType(sensor.type) === sensorFilter);
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
                                    tone="danger"
                                    disabled={resettingSensors}
                                    onPress={confirmResetSensors}
                                />
                            </View>
                        </Card>
                        <SensorFilterBar value={sensorFilter} options={sensorFilterOptions} onChange={setSensorFilter} />
                        {visibleSensors.map((sensor) => <SensorRow key={sensor.id} sensor={sensor} />)}
                    </>
                )}

                {mode === 'events' && (
                    events.data?.length ? (
                        events.data.map((event) => <EventRow key={event.id} event={event} roomBySensorId={roomBySensorId} />)
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

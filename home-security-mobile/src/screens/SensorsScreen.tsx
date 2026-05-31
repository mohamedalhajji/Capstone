import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSensors } from '../hooks/useSensors';
import { SensorItem } from '../types/sensor';
import { Card, ScreenState, StatusBadge } from '../ui/components';
import { colors, spacing } from '../ui/theme';

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

function SensorRow({ sensor }: { sensor: SensorItem }) {
    const color = statusColors[sensor.status] ?? colors.muted;

    return (
        <Card accentColor={sensor.status === 'triggered' || sensor.status === 'critical' ? color : undefined}>
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
                    <MaterialCommunityIcons name={sensorIcons[sensor.type] ?? 'chip'} size={24} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>{sensor.label}</Text>
                    <Text style={{ color: colors.muted, marginTop: 2 }}>{sensor.location}</Text>
                </View>
                <StatusBadge label={sensor.status.toUpperCase()} color={color} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <Text style={{ color: colors.muted }}>Type: {sensor.type}</Text>
                <Text style={{ color: colors.muted }}>
                    Value: {sensor.value === undefined ? 'none' : String(sensor.value)}
                </Text>
            </View>
        </Card>
    );
}

export default function SensorsScreen() {
    const { data: sensors, isLoading, isError } = useSensors();

    if (isLoading) {
        return <ScreenState title="Loading sensors" loading />;
    }

    if (isError) {
        return <ScreenState title="Sensors unavailable" message="The app could not read sensor records from the backend." />;
    }

    const triggeredCount = sensors?.filter((sensor) => sensor.status === 'triggered' || sensor.status === 'critical').length ?? 0;

    return (
        <ScrollView contentContainerStyle={{ padding: spacing.page, gap: spacing.gap, backgroundColor: colors.background }}>
            <Card accentColor={triggeredCount > 0 ? colors.danger : colors.success}>
                <Text style={{ color: colors.text, fontSize: 20, fontWeight: '900' }}>
                    {triggeredCount > 0 ? `${triggeredCount} sensor alert${triggeredCount > 1 ? 's' : ''}` : 'All sensors idle'}
                </Text>
                <Text style={{ color: colors.muted }}>
                    Live status from the database, refreshed automatically every few seconds.
                </Text>
            </Card>

            {sensors?.map((sensor) => (
                <SensorRow key={sensor.id} sensor={sensor} />
            ))}
        </ScrollView>
    );
}

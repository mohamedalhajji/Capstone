import React from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSystemState } from '../hooks/useSystemState';
import { useEvents } from '../hooks/useEvents';
import { useBackendHealth } from '../hooks/useBackendHealth';
import { SystemMode } from '../types/system';
import { EventItem } from '../types/event';
import { Card, CommandButton, IconMetric, ScreenState, SectionHeader, StatusBadge } from '../ui/components';
import { colors, spacing } from '../ui/theme';

function getEmergencyStatus(events: EventItem[] = []) {
    const criticalEvent = events.find((event) => event.severity === 'critical');

    if (criticalEvent) {
        return {
            label: 'Critical Alert',
            icon: 'fire-alert' as const,
            color: colors.critical,
            message: criticalEvent.message,
        };
    }

    const warningEvent = events.find((event) =>
        ['high', 'warning'].includes(event.severity)
    );

    if (warningEvent) {
        return {
            label: 'Security Alert',
            icon: 'shield-alert-outline' as const,
            color: colors.warning,
            message: warningEvent.message,
        };
    }

    return {
        label: 'Normal',
        icon: 'shield-check-outline' as const,
        color: colors.success,
        message: 'No recent alerts. The system is monitoring normally.',
    };
}

function modeIcon(mode: SystemMode) {
    if (mode === 'away') return 'shield-lock-outline';
    if (mode === 'home') return 'home-lock';
    return 'shield-off-outline';
}

export default function DashboardScreen() {
    const {
        data: systemState,
        isLoading,
        isError,
        setMode,
        settingMode,
        resetSystem,
        resettingSystem,
        fullReset,
        fullResetting,
    } = useSystemState();
    const { data: events } = useEvents();
    const { data: health, isError: healthError, isFetching: checkingHealth } = useBackendHealth();

    if (isLoading) {
        return <ScreenState title="Loading system" message="Getting the latest home security state." loading />;
    }

    if (isError || !systemState) {
        return (
            <ScreenState
                title="Dashboard unavailable"
                message="Check that the backend is running and that the phone is on the same Wi-Fi network."
            />
        );
    }

    const recentEvents = events?.slice(0, 3) ?? [];
    const emergencyStatus = getEmergencyStatus(events?.slice(0, 10) ?? []);
    const connected = !!health?.ok && !healthError;
    const resetting = resettingSystem || fullResetting;

    const changeMode = (mode: SystemMode) => {
        setMode(mode).catch((error) => {
            Alert.alert('Mode change failed', error instanceof Error ? error.message : 'Unknown error');
        });
    };

    const confirmFullReset = () => {
        Alert.alert(
            'Clear all history?',
            'This removes events, notifications, and access logs from the database.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () => {
                        fullReset().catch((error) => {
                            Alert.alert('Full reset failed', error instanceof Error ? error.message : 'Unknown error');
                        });
                    },
                },
            ]
        );
    };

    return (
        <ScrollView contentContainerStyle={{ padding: spacing.page, gap: spacing.gap, backgroundColor: colors.background }}>
            <Card accentColor={emergencyStatus.color}>
                <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                    <View
                        style={{
                            width: 52,
                            height: 52,
                            borderRadius: 14,
                            backgroundColor: `${emergencyStatus.color}22`,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <MaterialCommunityIcons name={emergencyStatus.icon} size={30} color={emergencyStatus.color} />
                    </View>
                    <View style={{ flex: 1, gap: 6 }}>
                        <StatusBadge label={emergencyStatus.label.toUpperCase()} color={emergencyStatus.color} />
                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>
                            {emergencyStatus.message}
                        </Text>
                    </View>
                </View>
            </Card>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <IconMetric
                    icon={modeIcon(systemState.mode)}
                    label="Mode"
                    value={systemState.mode.toUpperCase()}
                    color={colors.primary}
                />
                <IconMetric
                    icon={connected ? 'cloud-check-outline' : 'cloud-alert-outline'}
                    label="Backend"
                    value={connected ? 'ONLINE' : checkingHealth ? 'CHECKING' : 'OFFLINE'}
                    color={connected ? colors.success : colors.danger}
                />
                <IconMetric
                    icon={systemState.actuators.doorLocked ? 'lock-outline' : 'lock-open-outline'}
                    label="Door"
                    value={systemState.actuators.doorLocked ? 'LOCKED' : 'OPEN'}
                    color={systemState.actuators.doorLocked ? colors.success : colors.warning}
                />
                <IconMetric
                    icon={systemState.actuators.sprinklerOn ? 'sprinkler-fire' : 'sprinkler'}
                    label="Sprinkler"
                    value={systemState.actuators.sprinklerOn ? 'ACTIVE' : 'OFF'}
                    color={systemState.actuators.sprinklerOn ? colors.critical : colors.muted}
                />
            </View>

            <Card>
                <SectionHeader icon="shield-home-outline" title="Arm System" subtitle="Choose the security mode for the prototype." />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <CommandButton
                        label="Disarm"
                        icon="shield-off-outline"
                        disabled={settingMode}
                        tone={systemState.mode === 'disarmed' ? 'primary' : 'default'}
                        onPress={() => changeMode('disarmed')}
                    />
                    <CommandButton
                        label="Home"
                        icon="home-lock"
                        disabled={settingMode}
                        tone={systemState.mode === 'home' ? 'primary' : 'default'}
                        onPress={() => changeMode('home')}
                    />
                    <CommandButton
                        label="Away"
                        icon="shield-lock-outline"
                        disabled={settingMode}
                        tone={systemState.mode === 'away' ? 'primary' : 'default'}
                        onPress={() => changeMode('away')}
                    />
                </View>
            </Card>

            <Card>
                <SectionHeader icon="restart" title="System Actions" subtitle="Reset outputs after a test or clear demo history." />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <CommandButton
                        label="Reset"
                        icon="restore"
                        disabled={resetting}
                        onPress={() => {
                            resetSystem().catch((error) => {
                                Alert.alert('Reset failed', error instanceof Error ? error.message : 'Unknown error');
                            });
                        }}
                    />
                    <CommandButton
                        label="Clear History"
                        icon="delete-outline"
                        tone="danger"
                        disabled={resetting}
                        onPress={confirmFullReset}
                    />
                </View>
            </Card>

            <Card>
                <SectionHeader icon="timeline-clock-outline" title="Recent Events" subtitle="Latest alerts received from simulation or ESP32." />
                {recentEvents.length === 0 ? (
                    <Text style={{ color: colors.muted }}>No events recorded yet.</Text>
                ) : (
                    recentEvents.map((event) => (
                        <View key={event.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                            <MaterialCommunityIcons
                                name={event.severity === 'critical' ? 'alert-octagon-outline' : 'alert-circle-outline'}
                                size={22}
                                color={event.severity === 'critical' ? colors.critical : colors.warning}
                            />
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.text, fontWeight: '800' }}>{event.title}</Text>
                                <Text style={{ color: colors.muted, marginTop: 2 }}>{event.message}</Text>
                            </View>
                        </View>
                    ))
                )}
            </Card>
        </ScrollView>
    );
}

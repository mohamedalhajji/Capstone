import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { useSystemState } from '../hooks/useSystemState';
import { useEvents } from '../hooks/useEvents';
import { useSensors } from '../hooks/useSensors';
import { useHouseMap } from '../hooks/useHouseMap';
import { useSensorAliases } from '../hooks/useSensorAliases';
import { useAuth } from '../auth/AuthContext';
import { SystemMode } from '../types/system';
import { EventItem } from '../types/event';
import { ScreenState } from '../ui/components';
import { FadeInView } from '../ui/FadeInView';
import { colors, spacing } from '../ui/theme';
import { HouseMapEditor, HouseMapPreview } from '../components/HouseMap';
import { MainTabParamList } from '../navigation/MainTabs';

const WIFI_PROMPT_KEY = 'system-wifi-prompt-seen-v1';

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

    const highEvent = events.find((event) => event.severity === 'high');

    if (highEvent) {
        return {
            label: 'Security Alert',
            icon: 'shield-alert-outline' as const,
            color: colors.critical,
            message: highEvent.message,
        };
    }

    const warningEvent = events.find((event) => event.severity === 'warning');

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
    const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Dashboard'>>();
    const [mapEditorOpen, setMapEditorOpen] = React.useState(false);
    const [wifiPromptOpen, setWifiPromptOpen] = React.useState(false);
    const { user } = useAuth();
    const {
        data: systemState,
        isLoading,
        isError,
        setMode,
        settingMode,
        fullReset,
        fullResetting,
        requestEspWifiReset,
    } = useSystemState();
    const { data: events } = useEvents();
    const { data: sensors } = useSensors();
    const { layout: houseMap, setLayout: setHouseMap } = useHouseMap(user?.id);
    const { aliases } = useSensorAliases(user?.id);
    const espLastSeenMs = systemState?.espLastSeen ? new Date(systemState.espLastSeen).getTime() : 0;
    const systemOnline = espLastSeenMs > 0 && Date.now() - espLastSeenMs < 15000;
    const roomBySensorId = React.useMemo(() => {
        const lookup = new Map<string, string>();
        houseMap.rooms.forEach((room) => {
            room.deviceIds.forEach((deviceId) => lookup.set(deviceId, room.label));
        });
        return lookup;
    }, [houseMap.rooms]);

    React.useEffect(() => {
        let active = true;

        AsyncStorage.getItem(WIFI_PROMPT_KEY)
            .then((seen) => {
                if (active && systemState && !seen) {
                    setWifiPromptOpen(true);
                    AsyncStorage.setItem(WIFI_PROMPT_KEY, 'true').catch(() => undefined);
                }
            })
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, [systemOnline, systemState]);

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

    const emergencyStatus = getEmergencyStatus(events?.slice(0, 10) ?? []);
    const isNormal = emergencyStatus.label === 'Normal';
    const sensorsWithAliases = (sensors ?? []).map((sensor) => ({
        ...sensor,
        label: aliases[sensor.id] || sensor.label,
        location: roomBySensorId.get(sensor.id) ?? '',
    }));
    const activeSensors = sensorsWithAliases.filter((sensor) => sensor.status !== 'idle' && sensor.status !== 'safe');
    const dismissWifiPrompt = () => {
        setWifiPromptOpen(false);
        AsyncStorage.setItem(WIFI_PROMPT_KEY, 'true').catch(() => undefined);
    };
    const openRequiredWifiSetup = () => {
        requestEspWifiReset()
            .catch(() => undefined)
            .finally(() => {
                setWifiPromptOpen(false);
                navigation.navigate('Settings', { openWifiSetup: true, requireWifiSetup: true });
            });
    };
    const changeMode = (mode: SystemMode) => {
        if (!systemOnline) {
            Alert.alert('System offline', 'The security system is not connected to the internet right now. Reconnect it before changing arm/disarm state.');
            return;
        }

        setMode(mode).catch((error) => {
            Alert.alert('Mode change failed', error instanceof Error ? error.message : 'Unknown error');
        });
    };

    const toggleLock = () => {
        if (systemState.mode === 'away') {
            Alert.alert('Unlock system?', 'This will disarm the system.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Disarm', style: 'destructive', onPress: () => changeMode('disarmed') },
            ]);
            return;
        }

        changeMode('away');
    };

    const confirmClearData = () => {
        Alert.alert(
            'Clear data and reset?',
            'This clears history and stops active buzzer, sprinkler, and sensor alerts.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () => {
                        fullReset().catch((error) => {
                            Alert.alert('Clear failed', error instanceof Error ? error.message : 'Unknown error');
                        });
                    },
                },
            ]
        );
    };

    return (
        <FadeInView>
        <ScrollView contentContainerStyle={{ padding: spacing.page, paddingTop: 64, gap: 14, backgroundColor: colors.background }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View>
                    <Text style={{ color: colors.text, fontSize: 34, fontWeight: '900' }}>Home</Text>
                    <Text style={{ color: colors.muted, fontSize: 17, marginTop: 2 }}>
                        {isNormal ? 'Your home is secure.' : 'Your home needs attention.'}
                    </Text>
                </View>
                <Pressable
                    onPress={toggleLock}
                    disabled={settingMode}
                    style={{
                        width: 52,
                        height: 52,
                        borderRadius: 26,
                        borderWidth: 1,
                        borderColor: systemState.mode === 'away' ? colors.success : colors.border,
                        backgroundColor: systemState.mode === 'away' ? `${colors.success}18` : '#071B34',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: !systemOnline || settingMode ? 0.45 : 1,
                    }}
                >
                    <MaterialCommunityIcons name={systemState.mode === 'away' ? 'lock' : 'lock-open-outline'} size={25} color={systemState.mode === 'away' ? colors.success : colors.text} />
                </Pressable>
            </View>

            <View
                style={{
                    minHeight: 98,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: '#071B34',
                    padding: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                }}
            >
                <View
                    style={{
                        width: 68,
                        height: 68,
                        borderRadius: 34,
                        borderWidth: 4,
                        borderColor: emergencyStatus.color,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: `${emergencyStatus.color}18`,
                    }}
                >
                    <MaterialCommunityIcons name={emergencyStatus.icon} size={34} color={emergencyStatus.color} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                    <View
                        style={{
                            alignSelf: 'flex-start',
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: emergencyStatus.color,
                            backgroundColor: `${emergencyStatus.color}1F`,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                        }}
                    >
                        <Text style={{ color: emergencyStatus.color, fontWeight: '900', fontSize: 12 }}>{emergencyStatus.label.toUpperCase()}</Text>
                    </View>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>
                        {isNormal ? 'No recent alerts' : emergencyStatus.label}
                    </Text>
                    <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 14 }}>
                        {isNormal ? 'The system is monitoring normally.' : emergencyStatus.message}
                    </Text>
                </View>
            </View>

            <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.text, fontSize: 21, fontWeight: '900' }}>House Overview</Text>
                </View>

                {houseMap.rooms.length > 0 ? (
                    <HouseMapPreview
                        layout={houseMap}
                        sensors={sensorsWithAliases}
                    />
                ) : sensorsWithAliases.length > 0 ? (
                    <View style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#071B34', padding: 12, gap: 8 }}>
                        {(activeSensors.length > 0 ? activeSensors : sensorsWithAliases.slice(0, 4)).map((sensor) => (
                            <View key={sensor.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }}>
                                <MaterialCommunityIcons name="radar" size={20} color={sensor.status === 'critical' || sensor.status === 'triggered' ? colors.critical : colors.primary} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.text, fontWeight: '900' }}>{sensor.label}</Text>
                                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                                        {sensor.location ? `${sensor.location} - ${sensor.status}` : sensor.status}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </View>
                ) : houseMap.promptState === 'unseen' ? (
                    <View
                        style={{
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: '#071B34',
                            padding: 16,
                            gap: 12,
                        }}
                    >
                        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>Create a home map?</Text>
                        <Text style={{ color: colors.muted, lineHeight: 20 }}>Build a simple room grid so alerts point to the right place.</Text>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <ModeButton
                                label="Set Up"
                                icon="plus-box-outline"
                                active
                                onPress={() => {
                                    setHouseMap({ ...houseMap, promptState: 'accepted' }).then(() => setMapEditorOpen(true));
                                }}
                            />
                            <ModeButton
                                label="Later"
                                icon="clock-outline"
                                active={false}
                                onPress={() => {
                                    setHouseMap({ ...houseMap, promptState: 'declined' }).catch((error) => {
                                        Alert.alert('Could not save choice', error instanceof Error ? error.message : 'Unknown error');
                                    });
                                }}
                            />
                        </View>
                    </View>
                ) : (
                    <View style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#071B34', padding: 16 }}>
                        <Text style={{ color: colors.muted, textAlign: 'center', fontWeight: '800' }}>Please add sensors.</Text>
                    </View>
                )}
            </View>

            <HouseMapEditor
                visible={mapEditorOpen}
                layout={houseMap}
                sensors={sensors}
                onChange={(nextLayout) => {
                    setHouseMap(nextLayout).catch((error) => {
                        Alert.alert('Could not save map', error instanceof Error ? error.message : 'Unknown error');
                    });
                }}
                onClose={() => setMapEditorOpen(false)}
            />
            <Modal visible={wifiPromptOpen} animationType="fade">
                <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: spacing.page }}>
                    <Pressable
                        onPress={dismissWifiPrompt}
                        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 36 }}
                    />
                    <View
                        style={{
                            backgroundColor: '#071B34',
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: colors.border,
                            padding: 18,
                            gap: 12,
                        }}
                    >
                        <Text style={{ color: colors.text, fontSize: 26, fontWeight: '900' }}>System Wi-Fi setup</Text>
                        <Text style={{ color: colors.muted, lineHeight: 20 }}>
                            Connect the system to Wi-Fi before using the app. This appears on first launch or when the system is offline.
                        </Text>
                        <Pressable
                            onPress={openRequiredWifiSetup}
                            style={{
                                minHeight: 48,
                                borderRadius: 8,
                                backgroundColor: colors.primary,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Text style={{ color: colors.background, fontWeight: '900' }}>Set Up System Wi-Fi</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
        </ScrollView>
        </FadeInView>
    );
}

function ModeButton({
    label,
    icon,
    active,
    disabled,
    onPress,
}: {
    label: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    active: boolean;
    disabled?: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            disabled={disabled}
            onPress={onPress}
            style={{
                flex: 1,
                minHeight: 58,
                borderRadius: 8,
                borderWidth: active ? 2 : 1,
                borderColor: active ? colors.success : colors.border,
                backgroundColor: active ? `${colors.success}18` : '#071B34',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
                opacity: disabled ? 0.55 : 1,
            }}
        >
            <MaterialCommunityIcons name={icon} size={22} color={active ? colors.text : colors.text} />
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '900' }}>{label}</Text>
        </Pressable>
    );
}

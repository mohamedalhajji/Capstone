import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { authService } from '../services/authService';
import { HouseMapEditor } from '../components/HouseMap';
import { PinSetupScreen } from './AppLockScreen';
import { useHouseMap } from '../hooks/useHouseMap';
import { useSensors } from '../hooks/useSensors';
import { useSystemState } from '../hooks/useSystemState';
import { useAppLock } from '../hooks/useAppLock';
import { useSensorAliases } from '../hooks/useSensorAliases';
import { Card, CommandButton, SectionHeader, SegmentedControl, StatusBadge } from '../ui/components';
import { FadeInView } from '../ui/FadeInView';
import { colors, spacing } from '../ui/theme';
import { MainTabParamList } from '../navigation/MainTabs';

type WifiNetwork = {
    ssid: string;
    rssi: number;
    security: 'open' | 'secured' | string;
};

type SettingsTab = 'profile' | 'application' | 'map';

const ESP_SETUP_BASE_URL = 'http://192.168.4.1';

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([
            fetch(url, { ...options, signal: controller.signal }),
            new Promise<Response>((_, reject) => {
                timeout = setTimeout(() => {
                    controller.abort();
                    const error = new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
                    error.name = 'AbortError';
                    reject(error);
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

function parseWifiNetworkText(text: string): WifiNetwork[] {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('ERROR|'))
        .map((line) => {
            const [rawSsid, rawRssi, rawSecurity] = line.split('|');
            return {
                ssid: rawSsid?.trim() || '',
                rssi: Number.parseInt(rawRssi || '-100', 10),
                security: rawSecurity?.trim() || 'secured',
            };
        })
        .filter((network) => network.ssid.length > 0);
}

export default function SettingsScreen() {
    const route = useRoute<RouteProp<MainTabParamList, 'Settings'>>();
    const openedWifiParamRef = React.useRef(false);
    const insets = useSafeAreaInsets();
    const [activeTab, setActiveTab] = React.useState<SettingsTab>('profile');
    const [setupOpen, setSetupOpen] = React.useState(false);
    const [mapEditorOpen, setMapEditorOpen] = React.useState(false);
    const [pinSetupOpen, setPinSetupOpen] = React.useState(false);
    const [pinVerifyOpen, setPinVerifyOpen] = React.useState(false);
    const [renamingSensorId, setRenamingSensorId] = React.useState<string | null>(null);
    const [sensorName, setSensorName] = React.useState('');
    const [setupStarted, setSetupStarted] = React.useState(false);
    const [ssid, setSsid] = React.useState('');
    const [wifiPassword, setWifiPassword] = React.useState('');
    const [networks, setNetworks] = React.useState<WifiNetwork[]>([]);
    const [loadingNetworks, setLoadingNetworks] = React.useState(false);
    const [scanError, setScanError] = React.useState<string | null>(null);
    const [scanStatus, setScanStatus] = React.useState<string | null>(null);
    const [manualEntry, setManualEntry] = React.useState(false);
    const [savingWifi, setSavingWifi] = React.useState(false);
    const [passwordFlowOpen, setPasswordFlowOpen] = React.useState(false);
    const { user, logout } = useAuth();
    const { data: systemState, requestEspWifiReset, requestingEspWifiReset, fullReset, fullResetting } = useSystemState();
    const { data: sensors } = useSensors();
    const { layout: houseMap, setLayout: setHouseMap } = useHouseMap(user?.id);
    const { settings: lockSettings, biometricSupported, saveSettings, authenticateBiometric } = useAppLock(user?.id);
    const { aliases, setAlias } = useSensorAliases(user?.id);
    const systemLastSeenMs = systemState?.espLastSeen ? new Date(systemState.espLastSeen).getTime() : 0;
    const systemWifiConnected = systemLastSeenMs > 0 && Date.now() - systemLastSeenMs < 15000;
    const requireWifiSetup = !!route.params?.requireWifiSetup;

    const fetchNetworks = React.useCallback(async () => {
        setLoadingNetworks(true);
        setScanError(null);
        setScanStatus(null);

        try {
            let validNetworks: WifiNetwork[] = [];
            let usedFallback = true;
            let jsonError: Error | null = null;

            try {
                const textResponse = await fetchWithTimeout(`${ESP_SETUP_BASE_URL}/api/wifi/networks.txt`, {}, 20000);
                const textBody = await textResponse.text();

                if (!textResponse.ok || textBody.startsWith('ERROR|')) {
                    throw new Error(textBody.replace('ERROR|', '').trim() || 'Could not scan networks');
                }

                validNetworks = parseWifiNetworkText(textBody);
            } catch (error) {
                jsonError = error instanceof Error ? error : new Error('Could not scan networks');
            }

            if (validNetworks.length === 0) {
                usedFallback = false;
                const response = await fetchWithTimeout(`${ESP_SETUP_BASE_URL}/api/wifi/networks`, {}, 20000);
                const responseText = await response.text();
                let payload: { success?: boolean; error?: string; networks?: WifiNetwork[] };

                try {
                    payload = JSON.parse(responseText);
                } catch {
                    throw new Error(jsonError?.message || `System returned unreadable Wi-Fi JSON: ${responseText.slice(0, 120) || 'empty response'}`);
                }

                if (!response.ok || payload.success === false || !Array.isArray(payload.networks)) {
                    throw new Error(payload.error || jsonError?.message || 'Could not scan networks');
                }

                validNetworks = payload.networks.filter((network) => typeof network.ssid === 'string' && network.ssid.trim().length > 0);
            }

            setNetworks(validNetworks);
            setScanStatus(
                validNetworks.length > 0
                    ? `Found ${validNetworks.length} networks${usedFallback ? ' using fallback scan' : ''}.`
                    : 'Scan finished, but no visible 2.4 GHz networks were returned.'
            );
            if (!ssid && validNetworks[0]?.ssid) setSsid(validNetworks[0].ssid);
            setManualEntry(false);
        } catch (error) {
            setNetworks([]);
            setManualEntry(false);
            const message =
                error instanceof Error && error.name === 'AbortError'
                    ? 'Scan timed out. Connect this phone to Home Security System, then tap Refresh.'
                    : error instanceof Error
                      ? `${error.message}. Connect this phone to Home Security System, then tap Refresh.`
                      : 'Connect this phone to Home Security System, then tap Refresh.';
            setScanError(message);
            setScanStatus(null);
        } finally {
            setLoadingNetworks(false);
        }
    }, [ssid]);

    React.useEffect(() => {
        if (route.params?.openWifiSetup && !openedWifiParamRef.current) {
            openedWifiParamRef.current = true;
            setActiveTab('application');
            setSetupStarted(true);
            setSetupOpen(true);
            setManualEntry(false);
            setScanError(null);
            setScanStatus(null);
            setNetworks([]);
            fetchNetworks().catch(() => undefined);
        }
    }, [fetchNetworks, route.params?.openWifiSetup]);

    const saveWifiCredentials = async () => {
        const cleanSsid = ssid.trim();

        if (!cleanSsid) {
            Alert.alert('Wi-Fi required', 'Choose the Wi-Fi network for the system.');
            return;
        }

        setSavingWifi(true);
        try {
            const body = new URLSearchParams({
                ssid: cleanSsid,
                pass: wifiPassword,
                setup_code: '12345678',
            }).toString();

            const response = await fetchWithTimeout(
                `${ESP_SETUP_BASE_URL}/api/wifi/save`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body,
                },
                60000
            );

            let payload: { success?: boolean; error?: string; message?: string } = {};
            try {
                payload = await response.json();
            } catch {
                payload = {};
            }

            if (!response.ok || payload.success === false) {
                throw new Error(payload.error || 'Could not save Wi-Fi settings');
            }

            setSetupOpen(false);
            setSetupStarted(false);
            setNetworks([]);
            setScanError(null);
            setScanStatus(null);
            setManualEntry(false);
            setWifiPassword('');
            Alert.alert('Wi-Fi connected', payload.message || 'The system is restarting and will connect to the new network.');
        } catch (error) {
            const message =
                error instanceof Error && error.name === 'AbortError'
                    ? 'Save timed out. Stay connected to Home Security System and try again.'
                    : error instanceof Error
                      ? error.message
                      : 'Make sure this phone is connected to Home Security System.';

            Alert.alert(
                'Could not reach system',
                `${message}\n\nIf your phone says the system Wi-Fi has no internet, choose Stay Connected.`
            );
        } finally {
            setSavingWifi(false);
        }
    };

    const confirmEspWifiReset = () => {
        Alert.alert(
            'Change system Wi-Fi?',
            'This works only while the system is online. It will start Home Security System setup for new Wi-Fi credentials.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Change Wi-Fi',
                    style: 'destructive',
                    onPress: () => {
                        requestEspWifiReset()
                            .then(() => {
                                setSetupStarted(true);
                                Alert.alert('Setup mode started', 'Connect your phone to Home Security System, then return here and tap Change Wi-Fi.');
                            })
                            .catch((error) => {
                                Alert.alert('System Wi-Fi reset failed', error instanceof Error ? error.message : 'Unknown error');
                            });
                    },
                },
            ]
        );
    };

    const openPinChange = () => {
        if (lockSettings.pin) {
            setPinVerifyOpen(true);
            return;
        }
        setPinSetupOpen(true);
    };

    return (
        <FadeInView>
            <ScrollView contentContainerStyle={{ padding: spacing.page, gap: spacing.gap, backgroundColor: colors.background }}>
                <SegmentedControl
                    value={activeTab}
                    onChange={setActiveTab}
                    options={[
                        { value: 'profile', label: 'Profile', icon: 'account-circle-outline' },
                        { value: 'application', label: 'Application', icon: 'cellphone-cog' },
                        { value: 'map', label: 'Home Map', icon: 'floor-plan' },
                    ]}
                />

                {activeTab === 'profile' && (
                    <ProfileTab userName={user?.name} email={user?.email} onChangePassword={() => setPasswordFlowOpen(true)} logout={logout} />
                )}

                {activeTab === 'application' && (
                    <>
                        <Card>
                            <SectionHeader icon="lock-outline" title="App Lock" subtitle="Require biometrics or a 6 digit PIN when opening the app." />
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                                <CommandButton
                                    label={lockSettings.pin ? 'Change PIN' : 'Use PIN'}
                                    icon="numeric"
                                    tone={lockSettings.method === 'pin' ? 'primary' : 'default'}
                                    onPress={openPinChange}
                                />
                                <CommandButton
                                    label="Biometrics"
                                    icon="fingerprint"
                                    tone={lockSettings.method === 'biometric' ? 'primary' : 'default'}
                                    onPress={() => {
                                        if (!biometricSupported) {
                                            Alert.alert('Biometrics unavailable', 'Face ID or Touch ID is not available or not enrolled on this device.');
                                            return;
                                        }
                                        authenticateBiometric()
                                            .then((result) => {
                                                if (!result.success) {
                                                    Alert.alert(
                                                        'Face ID did not start',
                                                        result.warning || result.error || 'The biometric prompt was canceled or unavailable.'
                                                    );
                                                    return;
                                                }
                                                return saveSettings({ ...lockSettings, enabled: true, method: 'biometric' });
                                            })
                                            .catch((error) => {
                                                Alert.alert('Could not enable biometrics', error instanceof Error ? error.message : 'Unknown error');
                                            });
                                    }}
                                />
                            </View>
                            {!biometricSupported && (
                                <Text style={{ color: colors.muted, lineHeight: 19 }}>
                                    Biometrics are unavailable on this device, so PIN lock is required.
                                </Text>
                            )}
                        </Card>

                        <Card>
                            <SectionHeader icon="wifi-cog" title="System Wi-Fi" />
                            <StatusBadge label={systemWifiConnected ? 'CONNECTED' : 'SETUP'} color={systemWifiConnected ? colors.success : colors.warning} />
                            <Text style={{ color: colors.muted, lineHeight: 19 }}>
                                Use this when moving the system to a new router or Wi-Fi network.
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                                <CommandButton
                                    label={systemWifiConnected || setupStarted ? 'Change Wi-Fi' : 'Start Setup'}
                                    icon="wifi-cog"
                                    tone="danger"
                                    disabled={requestingEspWifiReset}
                                    onPress={confirmEspWifiReset}
                                />
                                {setupStarted && (
                                    <CommandButton
                                        label="Change Wi-Fi"
                                        icon="wifi-settings"
                                        tone="primary"
                                        onPress={() => {
                                            setSetupOpen(true);
                                            setManualEntry(false);
                                            setScanError(null);
                                            setScanStatus(null);
                                            setNetworks([]);
                                        }}
                                    />
                                )}
                            </View>
                            {setupStarted && (
                                <Text style={{ color: colors.muted, lineHeight: 19 }}>
                                    Setup is active. Connect this phone to Home Security System before opening Change Wi-Fi.
                                </Text>
                            )}
                        </Card>

                        <Card>
                            <SectionHeader icon="delete-sweep-outline" title="Clear History" subtitle="Clear history and reset the system state." />
                            <CommandButton
                                label="Clear and Reset"
                                icon="delete-outline"
                                tone="danger"
                                disabled={fullResetting}
                                onPress={() =>
                                    Alert.alert('Clear data and reset?', 'This clears history and stops active alerts.', [
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
                                    ])
                                }
                            />
                        </Card>
                    </>
                )}

                {activeTab === 'map' && (
                    <HomeMapTab
                        sensors={sensors}
                        aliases={aliases}
                        houseMap={houseMap}
                        setHouseMap={setHouseMap}
                        onOpenEditor={() => setMapEditorOpen(true)}
                        onRename={(sensorId, name) => {
                            setRenamingSensorId(sensorId);
                            setSensorName(name);
                        }}
                    />
                )}
            </ScrollView>

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

            <PasswordFlowModal visible={passwordFlowOpen} email={user?.email} onClose={() => setPasswordFlowOpen(false)} />

            <PinVerifyModal
                visible={pinVerifyOpen}
                expectedPin={lockSettings.pin}
                onClose={() => setPinVerifyOpen(false)}
                onVerified={() => {
                    setPinVerifyOpen(false);
                    setPinSetupOpen(true);
                }}
            />

            <Modal visible={pinSetupOpen} animationType="slide" onRequestClose={() => setPinSetupOpen(false)}>
                <PinSetupScreen
                    title={lockSettings.pin ? 'New PIN' : 'Create PIN'}
                    onCancel={() => setPinSetupOpen(false)}
                    onComplete={(nextPin) =>
                        saveSettings({ enabled: true, method: 'pin', pin: nextPin }).then(() => {
                            setPinSetupOpen(false);
                        })
                    }
                />
            </Modal>

            <Modal visible={!!renamingSensorId} transparent animationType="fade" onRequestClose={() => setRenamingSensorId(null)}>
                <View style={{ flex: 1, backgroundColor: '#00000099', justifyContent: 'center', padding: spacing.page }}>
                    <View style={{ backgroundColor: colors.surface, borderRadius: 8, padding: spacing.card, gap: 12 }}>
                        <SectionHeader icon="pencil" title="Rename Sensor" />
                        <TextInput
                            value={sensorName}
                            onChangeText={setSensorName}
                            placeholder="Sensor name"
                            placeholderTextColor={colors.muted}
                            style={inputStyle()}
                        />
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <CommandButton label="Cancel" icon="close" onPress={() => setRenamingSensorId(null)} />
                            <CommandButton
                                label="Save"
                                icon="content-save"
                                tone="primary"
                                onPress={() => {
                                    if (!renamingSensorId || !sensorName.trim()) return;
                                    setAlias(renamingSensorId, sensorName)
                                        .then(() => setRenamingSensorId(null))
                                        .catch((error) => Alert.alert('Could not rename sensor', error instanceof Error ? error.message : 'Unknown error'));
                                }}
                            />
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={setupOpen} animationType="slide" onRequestClose={() => !requireWifiSetup && setSetupOpen(false)}>
                <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: Math.max(insets.top + spacing.page, 78) }}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.page, paddingBottom: spacing.page, gap: spacing.gap }}>
                            <View style={{ gap: 12 }}>
                                {!requireWifiSetup && (
                                    <Pressable
                                        onPress={() => setSetupOpen(false)}
                                        style={{
                                            alignSelf: 'flex-start',
                                            minWidth: 118,
                                            height: 42,
                                            borderRadius: 8,
                                            backgroundColor: colors.surfaceAlt,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderWidth: 1,
                                            borderColor: colors.border,
                                            flexDirection: 'row',
                                            gap: 6,
                                            paddingHorizontal: 12,
                                        }}
                                    >
                                        <MaterialCommunityIcons name="arrow-left" size={19} color={colors.text} />
                                        <Text style={{ color: colors.text, fontWeight: '900' }}>Back</Text>
                                    </Pressable>
                                )}
                                <SectionHeader icon="wifi-cog" title="System Wi-Fi" />
                            </View>

                            <Card>
                                <StatusBadge label="CONNECT TO HOME SECURITY SYSTEM FIRST" color={colors.warning} />
                                <Text style={{ color: colors.muted, lineHeight: 19 }}>
                                    Connect your phone to Home Security System first, then choose the router Wi-Fi details.
                                </Text>
                                <Text style={{ color: colors.warning, fontWeight: '800', lineHeight: 19 }}>
                                    The system supports 2.4 GHz Wi-Fi only. 5 GHz-only routers and phone hotspots will not appear or connect.
                                </Text>
                                {!!scanError && (
                                    <View
                                        style={{
                                            borderWidth: 1,
                                            borderColor: colors.warning,
                                            backgroundColor: `${colors.warning}18`,
                                            borderRadius: 8,
                                            padding: 12,
                                            gap: 6,
                                        }}
                                    >
                                        <Text style={{ color: colors.warning, fontWeight: '900' }}>System setup Wi-Fi not connected</Text>
                                        <Text style={{ color: colors.text, lineHeight: 19 }}>{scanError}</Text>
                                    </View>
                                )}
                                {!!scanStatus && (
                                    <View
                                        style={{
                                            borderWidth: 1,
                                            borderColor: colors.primary,
                                            backgroundColor: `${colors.primary}18`,
                                            borderRadius: 8,
                                            padding: 12,
                                        }}
                                    >
                                        <Text style={{ color: colors.text, fontWeight: '900' }}>{scanStatus}</Text>
                                    </View>
                                )}

                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                                    <CommandButton
                                        label={loadingNetworks ? 'Scanning...' : 'Scan'}
                                        icon="wifi-refresh"
                                        disabled={loadingNetworks}
                                        onPress={fetchNetworks}
                                    />
                                </View>

                                {!manualEntry && (
                                    <View style={{ gap: 8 }}>
                                        <Text style={{ color: colors.text, fontWeight: '800' }}>Available networks</Text>
                                        {loadingNetworks ? (
                                            <View style={{ paddingVertical: 18, alignItems: 'center', gap: 8 }}>
                                                <ActivityIndicator color={colors.primary} />
                                                <Text style={{ color: colors.muted }}>Scanning nearby Wi-Fi networks...</Text>
                                            </View>
                                        ) : networks.length === 0 ? (
                                            <Text style={{ color: colors.muted }}>No networks found. Tap Scan to refresh the list.</Text>
                                        ) : (
                                            networks.map((network) => {
                                                const selected = network.ssid === ssid;
                                                return (
                                                    <Pressable
                                                        key={`${network.ssid}-${network.rssi}`}
                                                        onPress={() => setSsid(network.ssid)}
                                                        style={{
                                                            minHeight: 54,
                                                            borderRadius: 8,
                                                            borderWidth: selected ? 2 : 1,
                                                            borderColor: selected ? colors.primary : colors.border,
                                                            backgroundColor: selected ? `${colors.primary}22` : colors.surfaceAlt,
                                                            paddingHorizontal: 12,
                                                            paddingVertical: 10,
                                                            flexDirection: 'row',
                                                            alignItems: 'center',
                                                            gap: 10,
                                                        }}
                                                    >
                                                        <MaterialCommunityIcons
                                                            name={network.security === 'open' ? 'wifi' : 'wifi-lock'}
                                                            size={22}
                                                            color={selected ? colors.primary : colors.text}
                                                        />
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={{ color: colors.text, fontWeight: '900' }}>{network.ssid}</Text>
                                                            <Text style={{ color: colors.muted, marginTop: 2 }}>
                                                                {network.security === 'open' ? 'Open' : 'Secured'} - {network.rssi} dBm
                                                            </Text>
                                                        </View>
                                                        {selected && <MaterialCommunityIcons name="check-circle" size={22} color={colors.primary} />}
                                                    </Pressable>
                                                );
                                            })
                                        )}
                                    </View>
                                )}

                                {manualEntry && (
                                    <View style={{ gap: 8 }}>
                                        <Text style={{ color: colors.text, fontWeight: '800' }}>Wi-Fi name</Text>
                                        <TextInput
                                            value={ssid}
                                            onChangeText={setSsid}
                                            placeholder="Hidden or unlisted network"
                                            placeholderTextColor={colors.muted}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            style={inputStyle()}
                                        />
                                    </View>
                                )}

                                <View style={{ gap: 8 }}>
                                    <Text style={{ color: colors.text, fontWeight: '800' }}>Wi-Fi password</Text>
                                    <TextInput
                                        value={wifiPassword}
                                        onChangeText={setWifiPassword}
                                        placeholder="Leave blank only for open Wi-Fi"
                                        placeholderTextColor={colors.muted}
                                        secureTextEntry
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        style={{
                                            ...inputStyle(),
                                            backgroundColor: '#062A4F',
                                            borderWidth: 2,
                                            borderColor: colors.primary,
                                            paddingVertical: 15,
                                            fontWeight: '800',
                                        }}
                                    />
                                </View>

                                <CommandButton
                                    label={savingWifi ? 'Connecting...' : 'Connect to Wi-Fi'}
                                    icon="content-save"
                                    tone="primary"
                                    disabled={savingWifi || loadingNetworks}
                                    onPress={saveWifiCredentials}
                                />
                            </Card>
                        </ScrollView>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </FadeInView>
    );
}

function ProfileTab({
    userName,
    email,
    onChangePassword,
    logout,
}: {
    userName?: string;
    email?: string;
    onChangePassword: () => void;
    logout: () => Promise<void>;
}) {
    return (
        <>
            <Card>
                <SectionHeader icon="account-circle-outline" title="Profile" />
                <View style={{ gap: 4 }}>
                    <Text style={{ color: colors.text, fontSize: 20, fontWeight: '900' }}>{userName}</Text>
                    <Text style={{ color: colors.muted, fontSize: 15 }}>{email}</Text>
                </View>
                <CommandButton label="Change Password" icon="lock-reset" tone="primary" onPress={onChangePassword} />
            </Card>

            <Card>
                <SectionHeader icon="logout" title="Session" />
                <CommandButton
                    label="Logout"
                    icon="logout"
                    tone="danger"
                    onPress={() => {
                        Alert.alert('Are you sure you want to logout?', 'You will need to sign in again to access this account.', [
                            { text: 'Cancel', style: 'cancel' },
                            {
                                text: 'Logout',
                                style: 'destructive',
                                onPress: () => {
                                    logout().catch((error) => {
                                        Alert.alert('Logout failed', error instanceof Error ? error.message : 'Unknown error');
                                    });
                                },
                            },
                        ]);
                    }}
                />
            </Card>
        </>
    );
}

function HomeMapTab({
    sensors,
    aliases,
    houseMap,
    setHouseMap,
    onOpenEditor,
    onRename,
}: {
    sensors: ReturnType<typeof useSensors>['data'];
    aliases: Record<string, string>;
    houseMap: ReturnType<typeof useHouseMap>['layout'];
    setHouseMap: ReturnType<typeof useHouseMap>['setLayout'];
    onOpenEditor: () => void;
    onRename: (sensorId: string, name: string) => void;
}) {
    return (
        <Card>
            <SectionHeader
                icon="floor-plan"
                title="Home Map"
                subtitle={houseMap.rooms.length > 0 ? 'Edit rooms and linked sensors.' : 'Create the optional blueprint whenever you want.'}
            />
            <CommandButton
                label={houseMap.rooms.length > 0 ? 'Edit Map' : 'Create Map'}
                icon="map-marker-path"
                tone="primary"
                onPress={() => {
                    setHouseMap({ ...houseMap, promptState: 'accepted' })
                        .then(onOpenEditor)
                        .catch((error) => {
                            Alert.alert('Could not open map', error instanceof Error ? error.message : 'Unknown error');
                        });
                }}
            />
            <Text style={{ color: colors.text, fontWeight: '900', marginTop: 4 }}>Sensors</Text>
            {sensors && sensors.length > 0 ? (
                sensors.map((sensor) => (
                    <Pressable
                        key={sensor.id}
                        onPress={() => onRename(sensor.id, aliases[sensor.id] || sensor.label)}
                        style={{ minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    >
                        <MaterialCommunityIcons name="radar" size={20} color={colors.primary} />
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.text, fontWeight: '900' }}>{aliases[sensor.id] || sensor.label}</Text>
                            <Text style={{ color: colors.muted, fontSize: 12 }}>{sensor.location}</Text>
                        </View>
                        <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.muted} />
                    </Pressable>
                ))
            ) : (
                <Text style={{ color: colors.muted }}>No sensors detected yet.</Text>
            )}
        </Card>
    );
}

function PasswordFlowModal({ visible, email, onClose }: { visible: boolean; email?: string; onClose: () => void }) {
    const [step, setStep] = React.useState<'verify' | 'new'>('verify');
    const [currentPassword, setCurrentPassword] = React.useState('');
    const [newPassword, setNewPassword] = React.useState('');
    const [confirmPassword, setConfirmPassword] = React.useState('');
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        if (!visible) {
            setStep('verify');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setSaving(false);
        }
    }, [visible]);

    const verify = async () => {
        if (!currentPassword) {
            Alert.alert('Password required', 'Enter your current password.');
            return;
        }
        setSaving(true);
        try {
            if (!email) throw new Error('No account email found.');
            await authService.verifyPassword(email, currentPassword);
            setStep('new');
        } catch (error) {
            Alert.alert('Could not verify password', error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setSaving(false);
        }
    };

    const save = async () => {
        if (newPassword.length < 6) {
            Alert.alert('Password too short', 'Password must be at least 6 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            Alert.alert('Passwords do not match', 'Enter the same new password twice.');
            return;
        }
        setSaving(true);
        try {
            await authService.changePassword(currentPassword, newPassword);
            Alert.alert('Password changed', 'Your account password has been updated.');
            onClose();
        } catch (error) {
            Alert.alert('Could not change password', error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
                <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.page, gap: spacing.gap }}>
                    <Pressable onPress={onClose} style={{ position: 'absolute', left: spacing.page, top: 60, padding: 10 }}>
                        <MaterialCommunityIcons name="close" size={26} color={colors.text} />
                    </Pressable>
                    <Card>
                        <SectionHeader icon="lock-reset" title={step === 'verify' ? 'Current Password' : 'New Password'} />
                        {step === 'verify' ? (
                            <>
                                <Text style={{ color: colors.muted, lineHeight: 19 }}>Enter your current password to continue.</Text>
                                <TextInput
                                    value={currentPassword}
                                    onChangeText={setCurrentPassword}
                                    placeholder="Current password"
                                    placeholderTextColor={colors.muted}
                                    secureTextEntry
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    style={inputStyle()}
                                />
                                <CommandButton label={saving ? 'Checking...' : 'Continue'} icon="arrow-right" tone="primary" disabled={saving} onPress={verify} />
                            </>
                        ) : (
                            <>
                                <TextInput
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                    placeholder="New password"
                                    placeholderTextColor={colors.muted}
                                    secureTextEntry
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    style={inputStyle()}
                                />
                                <TextInput
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    placeholder="Confirm new password"
                                    placeholderTextColor={colors.muted}
                                    secureTextEntry
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    style={inputStyle()}
                                />
                                <CommandButton label={saving ? 'Saving...' : 'Save Password'} icon="content-save" tone="primary" disabled={saving} onPress={save} />
                            </>
                        )}
                    </Card>
                </ScrollView>
            </KeyboardAvoidingView>
        </Modal>
    );
}

function PinVerifyModal({
    visible,
    expectedPin,
    onClose,
    onVerified,
}: {
    visible: boolean;
    expectedPin?: string;
    onClose: () => void;
    onVerified: () => void;
}) {
    const [pin, setPin] = React.useState('');

    React.useEffect(() => {
        if (!visible) setPin('');
    }, [visible]);

    const verify = () => {
        if (pin !== expectedPin) {
            Alert.alert('Incorrect PIN', 'Enter your current PIN first.');
            setPin('');
            return;
        }
        onVerified();
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
                <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.page, gap: spacing.gap }}>
                    <Pressable onPress={onClose} style={{ position: 'absolute', left: spacing.page, top: 60, padding: 10 }}>
                        <MaterialCommunityIcons name="close" size={26} color={colors.text} />
                    </Pressable>
                    <Card>
                        <SectionHeader icon="numeric" title="Current PIN" subtitle="Enter your current PIN before choosing a new one." />
                        <TextInput
                            value={pin}
                            onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="Current PIN"
                            placeholderTextColor={colors.muted}
                            keyboardType="number-pad"
                            secureTextEntry
                            maxLength={6}
                            style={inputStyle()}
                        />
                        <CommandButton label="Continue" icon="arrow-right" tone="primary" onPress={verify} />
                    </Card>
                </ScrollView>
            </KeyboardAvoidingView>
        </Modal>
    );
}

function inputStyle() {
    return {
        backgroundColor: colors.surfaceAlt,
        color: colors.text,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 13,
        fontWeight: '700' as const,
    };
}

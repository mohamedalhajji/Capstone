import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useSystemState } from '../hooks/useSystemState';
import { Card, CommandButton, SectionHeader, StatusBadge } from '../ui/components';
import { FadeInView } from '../ui/FadeInView';
import { colors, spacing } from '../ui/theme';

type WifiNetwork = {
    ssid: string;
    rssi: number;
    security: 'open' | 'secured' | string;
};

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
        if (timeout) {
            clearTimeout(timeout);
        }
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
    const [setupOpen, setSetupOpen] = React.useState(false);
    const [setupStarted, setSetupStarted] = React.useState(false);
    const [ssid, setSsid] = React.useState('');
    const [wifiPassword, setWifiPassword] = React.useState('');
    const [networks, setNetworks] = React.useState<WifiNetwork[]>([]);
    const [loadingNetworks, setLoadingNetworks] = React.useState(false);
    const [scanError, setScanError] = React.useState<string | null>(null);
    const [scanStatus, setScanStatus] = React.useState<string | null>(null);
    const [manualEntry, setManualEntry] = React.useState(false);
    const [savingWifi, setSavingWifi] = React.useState(false);
    const { user, logout } = useAuth();
    const { requestEspWifiReset, requestingEspWifiReset } = useSystemState();

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
                    throw new Error(jsonError?.message || `ESP32 returned unreadable Wi-Fi JSON: ${responseText.slice(0, 120) || 'empty response'}`);
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
            if (!ssid && validNetworks[0]?.ssid) {
                setSsid(validNetworks[0].ssid);
            }
            setManualEntry(validNetworks.length === 0);
        } catch (error) {
            setNetworks([]);
            setManualEntry(true);
            const message =
                error instanceof Error && error.name === 'AbortError'
                    ? 'Scan timed out. Connect this phone to ESP32_Config_Safe, then tap Refresh.'
                    : error instanceof Error
                      ? `${error.message}. Connect this phone to ESP32_Config_Safe, then tap Refresh.`
                      : 'Connect this phone to ESP32_Config_Safe, then tap Refresh.';
            setScanError(message);
            setScanStatus(null);
        } finally {
            setLoadingNetworks(false);
        }
    }, [ssid]);

    const saveWifiCredentials = async () => {
        const cleanSsid = ssid.trim();

        if (!cleanSsid) {
            Alert.alert('Wi-Fi name required', 'Enter the network name for the router you want the ESP32 to use.');
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
            setWifiPassword('');
            Alert.alert('Wi-Fi saved', payload.message || 'The ESP32 is restarting and will connect to the new network.');
        } catch (error) {
            const message =
                error instanceof Error && error.name === 'AbortError'
                    ? 'Save timed out. Stay connected to ESP32_Config_Safe and try again.'
                    : error instanceof Error
                      ? error.message
                      : 'Make sure this phone is connected to ESP32_Config_Safe.';

            Alert.alert(
                'Could not reach ESP32',
                `${message}\n\nIf your phone says the ESP32 Wi-Fi has no internet, choose Stay Connected.`
            );
        } finally {
            setSavingWifi(false);
        }
    };

    const confirmEspWifiReset = () => {
        Alert.alert(
            'Reconfigure ESP32 Wi-Fi?',
            'This works only while the ESP32 is online. It will start ESP32_Config_Safe for new Wi-Fi credentials.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reconfigure',
                    style: 'destructive',
                    onPress: () => {
                        requestEspWifiReset()
                            .then(() => {
                                setSetupStarted(true);
                                Alert.alert('Setup mode started', 'Connect your phone to ESP32_Config_Safe, then return here and tap New Wi-Fi.');
                            })
                            .catch((error) => {
                                Alert.alert('ESP Wi-Fi reset failed', error instanceof Error ? error.message : 'Unknown error');
                            });
                    },
                },
            ]
        );
    };

    return (
        <FadeInView>
            <ScrollView contentContainerStyle={{ padding: spacing.page, gap: spacing.gap, backgroundColor: colors.background }}>
                <Card>
                    <SectionHeader icon="account-circle-outline" title="Account" />
                    <Text style={{ color: colors.text, fontWeight: '900', fontSize: 16 }}>{user?.name}</Text>
                    <Text style={{ color: colors.muted }}>{user?.email}</Text>
                    <CommandButton
                        label="Logout"
                        icon="logout"
                        tone="danger"
                        onPress={() => {
                            logout().catch((error) => {
                                Alert.alert('Logout failed', error instanceof Error ? error.message : 'Unknown error');
                            });
                        }}
                    />
                </Card>

                <Card>
                    <SectionHeader icon="wifi-cog" title="ESP32 Wi-Fi" />
                    <StatusBadge label="SETUP ONLY" color={colors.warning} />
                    <Text style={{ color: colors.muted, lineHeight: 19 }}>
                        Use this when moving the prototype to a new router or Wi-Fi network.
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        <CommandButton
                            label="Start Setup"
                            icon="wifi-cog"
                            tone="danger"
                            disabled={requestingEspWifiReset}
                            onPress={confirmEspWifiReset}
                        />
                        {setupStarted && (
                            <CommandButton
                                label="New Wi-Fi"
                                icon="wifi-settings"
                                tone="primary"
                                onPress={() => {
                                    setSetupOpen(true);
                                    setManualEntry(true);
                                    setScanError(null);
                                    setScanStatus(null);
                                    setNetworks([]);
                                }}
                            />
                        )}
                    </View>
                    {setupStarted && (
                        <Text style={{ color: colors.muted, lineHeight: 19 }}>
                            Setup is active. Connect this phone to ESP32_Config_Safe before opening New Wi-Fi.
                        </Text>
                    )}
                </Card>
            </ScrollView>
            <Modal visible={setupOpen} animationType="slide" onRequestClose={() => setSetupOpen(false)}>
                <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                        <ScrollView contentContainerStyle={{ padding: spacing.page, gap: spacing.gap }}>
                            <View style={{ gap: 12 }}>
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
                                <SectionHeader icon="wifi-cog" title="New Wi-Fi" />
                            </View>

                            <Card>
                                <StatusBadge label="CONNECT TO ESP32_CONFIG_SAFE FIRST" color={colors.warning} />
                                <Text style={{ color: colors.muted, lineHeight: 19 }}>
                                    Connect your phone to ESP32_Config_Safe first, then enter the router Wi-Fi details. Use Scan only if you want the ESP32 to search nearby networks.
                                </Text>
                                <Text style={{ color: colors.warning, fontWeight: '800', lineHeight: 19 }}>
                                    ESP32 supports 2.4 GHz Wi-Fi only. 5 GHz-only routers and phone hotspots will not appear or connect.
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
                                        <Text style={{ color: colors.warning, fontWeight: '900' }}>ESP32 setup Wi-Fi not connected</Text>
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
                                    <CommandButton
                                        label={manualEntry ? 'Use List' : 'Manual'}
                                        icon={manualEntry ? 'format-list-bulleted' : 'pencil'}
                                        onPress={() => setManualEntry((value) => !value)}
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
                                            <Text style={{ color: colors.muted }}>No networks found. Use manual entry for hidden Wi-Fi.</Text>
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
                                                                {network.security === 'open' ? 'Open' : 'Secured'} · {network.rssi} dBm
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
                                            style={{
                                                backgroundColor: colors.surfaceAlt,
                                                color: colors.text,
                                                borderWidth: 1,
                                                borderColor: colors.border,
                                                borderRadius: 8,
                                                paddingHorizontal: 14,
                                                paddingVertical: 13,
                                                fontWeight: '700',
                                            }}
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
                                            backgroundColor: colors.surfaceAlt,
                                            color: colors.text,
                                            borderWidth: 1,
                                            borderColor: colors.border,
                                            borderRadius: 8,
                                            paddingHorizontal: 14,
                                            paddingVertical: 13,
                                            fontWeight: '700',
                                        }}
                                    />
                                </View>

                                <CommandButton
                                    label={savingWifi ? 'Saving...' : 'Save Wi-Fi'}
                                    icon="content-save"
                                    tone="primary"
                                    disabled={savingWifi || loadingNetworks}
                                    onPress={saveWifiCredentials}
                                />
                            </Card>
                        </ScrollView>
                    </KeyboardAvoidingView>
                </SafeAreaView>
            </Modal>
        </FadeInView>
    );
}

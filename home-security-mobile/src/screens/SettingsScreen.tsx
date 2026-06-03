import React, { useState } from 'react';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import { getApiBaseUrl } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useSystemState } from '../hooks/useSystemState';
import { healthService } from '../services/healthService';
import { Card, CommandButton, SectionHeader, StatusBadge } from '../ui/components';
import { FadeInView } from '../ui/FadeInView';
import { colors, spacing } from '../ui/theme';

export default function SettingsScreen() {
    const [apiUrl, setApiUrl] = useState(getApiBaseUrl());
    const [checking, setChecking] = useState(false);
    const { user, logout } = useAuth();
    const { requestEspWifiReset, requestingEspWifiReset } = useSystemState();

    const testConnection = async () => {
        setChecking(true);
        try {
            const health = await healthService.getHealth();
            Alert.alert('Backend reachable', `Connected to:\n${getApiBaseUrl()}\n\nBackend: ${health.ok ? 'online' : 'unknown'}`);
        } catch (error) {
            Alert.alert('Connection failed', error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setChecking(false);
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
                                Alert.alert('Command sent', 'Connect to ESP32_Config_Safe, then open the portal.');
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
                    <SectionHeader icon="cloud-cog-outline" title="Backend" />
                    <StatusBadge label="CLOUD" color={colors.primary} />
                    <Text style={{ color: colors.muted, lineHeight: 19 }}>
                        The app talks to the production backend. The phone and house do not need to be on the same network.
                    </Text>
                    <Text style={{ color: colors.text, fontWeight: '800' }}>{apiUrl}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        <CommandButton label="Test" icon="cloud-check-outline" disabled={checking} onPress={testConnection} />
                    </View>
                </Card>

                <Card>
                    <SectionHeader icon="wifi-cog" title="ESP32 Wi-Fi" />
                    <Text style={{ color: colors.muted, lineHeight: 19 }}>
                        Reconfigure Wi-Fi only when moving the prototype to another network.
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        <CommandButton
                            label="Wi-Fi Setup"
                            icon="wifi-cog"
                            tone="danger"
                            disabled={requestingEspWifiReset}
                            onPress={confirmEspWifiReset}
                        />
                        <CommandButton
                            label="Portal"
                            icon="web"
                            onPress={() => Linking.openURL('http://192.168.4.1')}
                        />
                    </View>
                </Card>
            </ScrollView>
        </FadeInView>
    );
}

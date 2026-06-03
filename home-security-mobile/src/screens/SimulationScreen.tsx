import React from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSimulationActions } from '../hooks/useSimulationActions';
import { Card, CommandButton, SectionHeader } from '../ui/components';
import { FadeInView } from '../ui/FadeInView';
import { colors, spacing } from '../ui/theme';

const simulatedSensors: Array<{
    label: string;
    sensorName: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    tone?: 'default' | 'primary' | 'danger';
}> = [
    { label: 'Motion', sensorName: 'motion_living_room', icon: 'motion-sensor' },
    { label: 'Gas', sensorName: 'gas_kitchen', icon: 'smoke-detector-alert-outline', tone: 'danger' },
    { label: 'Flame', sensorName: 'flame_kitchen', icon: 'fire-alert', tone: 'danger' },
    { label: 'Door', sensorName: 'door_main', icon: 'door-open' },
    { label: 'Vibration', sensorName: 'vibration_window', icon: 'vibrate' },
];

export default function SimulationScreen() {
    const { triggerSensor, simulateNfc, isLoading } = useSimulationActions();

    const runAction = async (action: () => Promise<unknown>) => {
        try {
            await action();
        } catch (error) {
            Alert.alert('Simulation failed', error instanceof Error ? error.message : 'Unknown error');
        }
    };

    return (
        <FadeInView>
        <ScrollView contentContainerStyle={{ padding: spacing.page, gap: spacing.gap, backgroundColor: colors.background }}>
            <Card>
                <SectionHeader
                    icon="test-tube"
                    title="Prototype Test Panel"
                    subtitle="Use these controls when the physical ESP32 sensors are not connected."
                />
            </Card>

            <Card>
                <SectionHeader
                    icon="radar"
                    title="Sensor Events"
                    subtitle="Each button writes through the same backend logic used by the ESP32."
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {simulatedSensors.map((item) => (
                        <CommandButton
                            key={item.sensorName}
                            label={item.label}
                            icon={item.icon}
                            tone={item.tone}
                            disabled={isLoading}
                            onPress={() => runAction(() => triggerSensor(item.sensorName))}
                        />
                    ))}
                </View>
            </Card>

            <Card>
                <SectionHeader
                    icon="nfc"
                    title="NFC Access"
                    subtitle="Generate granted or denied access attempts for the Access tab."
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <CommandButton
                        label="Authorized"
                        icon="account-check-outline"
                        tone="primary"
                        disabled={isLoading}
                        onPress={() => runAction(() => simulateNfc('authorized'))}
                    />
                    <CommandButton
                        label="Denied"
                        icon="account-cancel-outline"
                        tone="danger"
                        disabled={isLoading}
                        onPress={() => runAction(() => simulateNfc('unauthorized'))}
                    />
                </View>
            </Card>
        </ScrollView>
        </FadeInView>
    );
}

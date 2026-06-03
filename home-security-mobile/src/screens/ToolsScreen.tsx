import React, { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useSimulationActions } from '../hooks/useSimulationActions';
import { Card, CommandButton, SectionHeader } from '../ui/components';
import { FadeInView } from '../ui/FadeInView';
import { colors, spacing } from '../ui/theme';

const simulatedSensors = [
    { label: 'Motion', sensorName: 'motion_living_room', icon: 'motion-sensor' as const },
    { label: 'Gas', sensorName: 'gas_kitchen', icon: 'smoke-detector-alert-outline' as const, tone: 'danger' as const },
    { label: 'Flame', sensorName: 'flame_kitchen', icon: 'fire-alert' as const, tone: 'danger' as const },
    { label: 'Door', sensorName: 'door_main', icon: 'door-open' as const },
    { label: 'Vibration', sensorName: 'vibration_window', icon: 'vibrate' as const },
];

export default function ToolsScreen() {
    const { triggerSensor, simulateNfc, isLoading } = useSimulationActions();

    const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
        try {
            await action();
            Alert.alert('Done', successMessage);
        } catch (error) {
            Alert.alert('Action failed', error instanceof Error ? error.message : 'Unknown error');
        }
    };

    return (
        <FadeInView>
            <ScrollView contentContainerStyle={{ padding: spacing.page, gap: spacing.gap, backgroundColor: colors.background }}>
                <Card>
                    <SectionHeader icon="radar" title="Sensor Tests" />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        {simulatedSensors.map((item) => (
                            <CommandButton
                                key={item.sensorName}
                                label={item.label}
                                icon={item.icon}
                                tone={item.tone}
                                disabled={isLoading}
                                onPress={() =>
                                    runAction(
                                        () => triggerSensor(item.sensorName),
                                        `${item.label} event sent.`
                                    )
                                }
                            />
                        ))}
                    </View>
                </Card>

                <Card>
                    <SectionHeader icon="nfc" title="NFC Tests" />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        <CommandButton
                            label="Granted"
                            icon="account-check-outline"
                            tone="primary"
                            disabled={isLoading}
                            onPress={() => runAction(() => simulateNfc('authorized'), 'Authorized NFC event sent.')}
                        />
                        <CommandButton
                            label="Denied"
                            icon="account-cancel-outline"
                            tone="danger"
                            disabled={isLoading}
                            onPress={() => runAction(() => simulateNfc('unauthorized'), 'Denied NFC event sent.')}
                        />
                    </View>
                </Card>

            </ScrollView>
        </FadeInView>
    );
}

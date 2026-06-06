import React from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppLockSettings, BiometricAuthResult } from '../hooks/useAppLock';
import { colors, spacing } from '../ui/theme';

function PinDots({ value }: { value: string }) {
    return (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12 }}>
            {Array.from({ length: 6 }).map((_, index) => (
                <View
                    key={index}
                    style={{
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        borderWidth: 2,
                        borderColor: index < value.length ? colors.primary : colors.border,
                        backgroundColor: index < value.length ? colors.primary : 'transparent',
                    }}
                />
            ))}
        </View>
    );
}

export function PinSetupScreen({
    title = 'Create PIN',
    onComplete,
    onCancel,
}: {
    title?: string;
    onComplete: (pin: string) => Promise<void> | void;
    onCancel?: () => void;
}) {
    const [pin, setPin] = React.useState('');
    const [firstPin, setFirstPin] = React.useState('');
    const [step, setStep] = React.useState<'create' | 'confirm'>('create');
    const inputRef = React.useRef<TextInput>(null);
    const submittedRef = React.useRef(false);

    React.useEffect(() => {
        const value = pin.replace(/\D/g, '').slice(0, 6);
        if (value !== pin) {
            setPin(value);
            return;
        }

        if (pin.length !== 6) return;

        if (step === 'create') {
            setFirstPin(pin);
            setPin('');
            setStep('confirm');
            return;
        }

        if (pin !== firstPin) {
            Alert.alert('PIN mismatch', 'Start again and enter the same PIN twice.');
            setFirstPin('');
            setPin('');
            setStep('create');
            return;
        }

        if (submittedRef.current) return;
        submittedRef.current = true;
        Promise.resolve(onComplete(pin)).catch((error) => {
            submittedRef.current = false;
            Alert.alert('Could not save PIN', error instanceof Error ? error.message : 'Unknown error');
        });
    }, [firstPin, onComplete, pin, step]);

    return (
        <Pressable
            onPress={() => inputRef.current?.focus()}
            style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: spacing.page, paddingBottom: 120, gap: 24 }}
        >
            <TextInput
                ref={inputRef}
                value={pin}
                onChangeText={setPin}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                autoFocus
                caretHidden
                style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
            />
            {onCancel && (
                <Pressable onPress={onCancel} style={{ position: 'absolute', left: spacing.page, top: 72, padding: 10 }}>
                    <MaterialCommunityIcons name="close" size={26} color={colors.text} />
                </Pressable>
            )}
            <View style={{ alignItems: 'center', gap: 12 }}>
                <View
                    style={{
                        width: 72,
                        height: 72,
                        borderRadius: 36,
                        backgroundColor: `${colors.primary}22`,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <MaterialCommunityIcons name="numeric" size={38} color={colors.primary} />
                </View>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: '900' }}>
                    {step === 'confirm' ? 'Confirm PIN' : title}
                </Text>
                <Text style={{ color: colors.muted, textAlign: 'center', lineHeight: 20 }}>
                    {step === 'confirm' ? 'Enter it one more time.' : 'Choose a 6 digit PIN.'}
                </Text>
            </View>
            <PinDots value={pin} />
        </Pressable>
    );
}

export function AppLockScreen({
    settings,
    biometricSupported,
    onUnlock,
    onUseBiometric,
    onSetPin,
}: {
    settings: AppLockSettings;
    biometricSupported: boolean;
    onUnlock: () => void;
    onUseBiometric: () => Promise<BiometricAuthResult>;
    onSetPin: (pin: string) => Promise<void>;
}) {
    const [pin, setPin] = React.useState('');
    const inputRef = React.useRef<TextInput>(null);
    const needsPinSetup = settings.method === 'pin' && !settings.pin;

    React.useEffect(() => {
        if (settings.enabled && settings.method === 'biometric' && biometricSupported) {
            onUseBiometric().then((success) => {
                if (success.success) onUnlock();
            });
        }
    }, [biometricSupported, onUnlock, onUseBiometric, settings.enabled, settings.method]);

    React.useEffect(() => {
        const value = pin.replace(/\D/g, '').slice(0, 6);
        if (value !== pin) {
            setPin(value);
            return;
        }

        if (pin.length !== 6) return;

        if (pin === settings.pin) {
            onUnlock();
        } else {
            Alert.alert('Incorrect PIN', 'Try again.');
            setPin('');
        }
    }, [onUnlock, pin, settings.pin]);

    if (needsPinSetup) {
        return <PinSetupScreen onComplete={(nextPin) => onSetPin(nextPin).then(onUnlock)} />;
    }

    return (
        <Pressable
            onPress={() => inputRef.current?.focus()}
            style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: spacing.page, paddingBottom: 120, gap: 24 }}
        >
            <TextInput
                ref={inputRef}
                value={pin}
                onChangeText={setPin}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                autoFocus
                caretHidden
                style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
            />
            <View style={{ alignItems: 'center', gap: 12 }}>
                <View
                    style={{
                        width: 72,
                        height: 72,
                        borderRadius: 36,
                        backgroundColor: `${colors.primary}22`,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <MaterialCommunityIcons name="lock-outline" size={38} color={colors.primary} />
                </View>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: '900' }}>Unlock App</Text>
                <Text style={{ color: colors.muted, textAlign: 'center', lineHeight: 20 }}>Enter your 6 digit PIN.</Text>
            </View>

            <PinDots value={pin} />

            {settings.method === 'biometric' && biometricSupported && (
                <Pressable onPress={() => onUseBiometric().then((success) => success.success && onUnlock())} style={{ alignSelf: 'center', padding: 10 }}>
                    <Text style={{ color: colors.primary, fontWeight: '900' }}>Use biometrics</Text>
                </Pressable>
            )}
        </Pressable>
    );
}

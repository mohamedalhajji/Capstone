import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import * as LocalAuthentication from 'expo-local-authentication';

type LockMethod = 'pin' | 'biometric';

export type AppLockSettings = {
    enabled: boolean;
    method: LockMethod;
    pin?: string;
};

export type BiometricAuthResult = {
    success: boolean;
    error?: string;
    warning?: string;
};

const LOCK_KEY_PREFIX = 'app-lock-v1';

const defaultSettings: AppLockSettings = {
    enabled: true,
    method: 'pin',
    pin: undefined,
};

function keyFor(accountId?: string | number | null) {
    return `${LOCK_KEY_PREFIX}:${accountId ?? 'anonymous'}`;
}

function normalize(value: unknown): AppLockSettings {
    if (!value || typeof value !== 'object') return defaultSettings;
    const candidate = value as Partial<AppLockSettings>;
    return {
        enabled: candidate.enabled ?? true,
        method: candidate.method === 'biometric' ? 'biometric' : 'pin',
        pin: candidate.pin,
    };
}

export function useAppLock(accountId?: string | number | null) {
    const [settings, setSettingsState] = React.useState<AppLockSettings>(defaultSettings);
    const [loading, setLoading] = React.useState(true);
    const [biometricSupported, setBiometricSupported] = React.useState(false);
    const storageKey = keyFor(accountId);

    React.useEffect(() => {
        let active = true;

        Promise.all([
            AsyncStorage.getItem(storageKey),
            LocalAuthentication.hasHardwareAsync(),
            LocalAuthentication.isEnrolledAsync(),
        ])
            .then(([stored, hasHardware, enrolled]) => {
                if (!active) return;
                setSettingsState(stored ? normalize(JSON.parse(stored)) : defaultSettings);
                setBiometricSupported(hasHardware && enrolled);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [storageKey]);

    const saveSettings = React.useCallback(
        async (nextSettings: AppLockSettings) => {
            setSettingsState(nextSettings);
            await AsyncStorage.setItem(storageKey, JSON.stringify(nextSettings));
        },
        [storageKey]
    );

    const authenticateBiometric = React.useCallback(async (): Promise<BiometricAuthResult> => {
        if (!biometricSupported) {
            return {
                success: false,
                error: 'not_available',
                warning: 'Face ID or Touch ID is not available or not enrolled on this device.',
            };
        }
        const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Unlock Home Security',
            fallbackLabel: '',
            disableDeviceFallback: true,
            biometricsSecurityLevel: 'weak',
        });
        return result;
    }, [biometricSupported]);

    return {
        settings,
        loading,
        biometricSupported,
        saveSettings,
        authenticateBiometric,
    };
}

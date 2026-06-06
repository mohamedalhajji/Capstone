import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import MainTabs from './src/navigation/MainTabs';
import AuthScreen from './src/screens/AuthScreen';
import { AppLockScreen } from './src/screens/AppLockScreen';
import { useAppLock } from './src/hooks/useAppLock';
import { colors } from './src/ui/theme';

const queryClient = new QueryClient();

const DarkAppTheme = {
    ...DefaultTheme,
    colors: {
        ...DefaultTheme.colors,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        primary: colors.primary,
        notification: colors.critical,
    },
};

function AppContent() {
    const { user, initializing } = useAuth();
    const [unlocked, setUnlocked] = React.useState(false);
    const { settings, loading: lockLoading, biometricSupported, saveSettings, authenticateBiometric } = useAppLock(user?.id);

    React.useEffect(() => {
        setUnlocked(false);
    }, [user?.id]);

    if (initializing) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={colors.primary} />
            </View>
        );
    }

    if (!user) return <AuthScreen />;

    if (lockLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={colors.primary} />
            </View>
        );
    }

    if (settings.enabled && !unlocked) {
        return (
            <AppLockScreen
                settings={settings}
                biometricSupported={biometricSupported}
                onUnlock={() => setUnlocked(true)}
                onUseBiometric={authenticateBiometric}
                onSetPin={(pin) => saveSettings({ ...settings, method: 'pin', pin })}
            />
        );
    }

    return <MainTabs />;
}

export default function App() {
    return (
        <SafeAreaProvider>
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <NavigationContainer theme={DarkAppTheme}>
                        <StatusBar style="light" />
                        <AppContent />
                    </NavigationContainer>
                </AuthProvider>
            </QueryClientProvider>
        </SafeAreaProvider>
    );
}

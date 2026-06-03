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

    if (initializing) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={colors.primary} />
            </View>
        );
    }

    return user ? <MainTabs /> : <AuthScreen />;
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

import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MainTabs from './src/navigation/MainTabs';

const queryClient = new QueryClient();

const DarkAppTheme = {
    ...DefaultTheme,
    colors: {
        ...DefaultTheme.colors,
        background: '#0b0f14',
        card: '#121821',
        text: '#f3f4f6',
        border: '#232c39',
        primary: '#4f8cff',
        notification: '#ff4d4f',
    },
};

export default function App() {
    return (
        <SafeAreaProvider>
            <QueryClientProvider client={queryClient}>
                <NavigationContainer theme={DarkAppTheme}>
                    <StatusBar style="light" />
                    <MainTabs />
                </NavigationContainer>
            </QueryClientProvider>
        </SafeAreaProvider>
    );
}
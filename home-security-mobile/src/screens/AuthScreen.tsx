import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getApiErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { colors, radii, spacing } from '../ui/theme';

type AuthMode = 'login' | 'signup';

function AuthInput({
    icon,
    placeholder,
    value,
    onChangeText,
    secureTextEntry,
    keyboardType,
}: {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    placeholder: string;
    value: string;
    onChangeText: (value: string) => void;
    secureTextEntry?: boolean;
    keyboardType?: 'default' | 'email-address';
}) {
    return (
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radii.md,
                paddingHorizontal: 12,
                minHeight: 52,
            }}
        >
            <MaterialCommunityIcons name={icon} size={20} color={colors.muted} />
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={colors.subtle}
                secureTextEntry={secureTextEntry}
                keyboardType={keyboardType}
                autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
                autoCorrect={false}
                style={{ color: colors.text, flex: 1, fontSize: 15 }}
            />
        </View>
    );
}

export default function AuthScreen() {
    const { login, signup, authenticating } = useAuth();
    const [mode, setMode] = useState<AuthMode>('login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const submit = async () => {
        try {
            if (mode === 'signup') {
                await signup(name, email, password);
            } else {
                await login(email, password);
            }
        } catch (error) {
            Alert.alert(mode === 'signup' ? 'Sign up failed' : 'Login failed', getApiErrorMessage(error));
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: spacing.page }}
        >
            <View style={{ gap: 18 }}>
                <View style={{ gap: 8 }}>
                    <View
                        style={{
                            width: 54,
                            height: 54,
                            borderRadius: radii.lg,
                            backgroundColor: colors.primary,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <MaterialCommunityIcons name="shield-lock-outline" size={30} color={colors.background} />
                    </View>
                    <Text style={{ color: colors.text, fontSize: 30, fontWeight: '900' }}>Home Security</Text>
                    <Text style={{ color: colors.muted, lineHeight: 20 }}>
                        {mode === 'signup' ? 'Create an account for this prototype.' : 'Sign in to control the prototype.'}
                    </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                    {(['login', 'signup'] as AuthMode[]).map((item) => {
                        const active = item === mode;
                        return (
                            <Pressable
                                key={item}
                                onPress={() => setMode(item)}
                                style={{
                                    flex: 1,
                                    minHeight: 44,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: radii.md,
                                    backgroundColor: active ? colors.primary : colors.surface,
                                    borderWidth: 1,
                                    borderColor: active ? colors.primary : colors.border,
                                }}
                            >
                                <Text style={{ color: active ? colors.background : colors.text, fontWeight: '900' }}>
                                    {item === 'login' ? 'Login' : 'Sign Up'}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                <View style={{ gap: 12 }}>
                    {mode === 'signup' && (
                        <AuthInput icon="account-outline" placeholder="Name" value={name} onChangeText={setName} />
                    )}
                    <AuthInput
                        icon="email-outline"
                        placeholder="Email"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                    />
                    <AuthInput
                        icon="lock-outline"
                        placeholder="Password"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />
                </View>

                <Pressable
                    disabled={authenticating}
                    onPress={submit}
                    style={{
                        minHeight: 52,
                        borderRadius: radii.md,
                        backgroundColor: colors.primary,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: authenticating ? 0.6 : 1,
                    }}
                >
                    <Text style={{ color: colors.background, fontSize: 16, fontWeight: '900' }}>
                        {authenticating ? 'Please wait...' : mode === 'signup' ? 'Create Account' : 'Login'}
                    </Text>
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
}

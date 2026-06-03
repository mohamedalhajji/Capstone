import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radii, spacing } from './theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export function ScreenState({
    title,
    message,
    loading,
}: {
    title: string;
    message?: string;
    loading?: boolean;
}) {
    return (
        <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            {loading && <ActivityIndicator color={colors.primary} style={{ marginBottom: 14 }} />}
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' }}>
                {title}
            </Text>
            {!!message && (
                <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
                    {message}
                </Text>
            )}
        </View>
    );
}

export function Card({
    children,
    accentColor,
}: {
    children: React.ReactNode;
    accentColor?: string;
}) {
    return (
        <View
            style={{
                backgroundColor: colors.surface,
                borderRadius: radii.md,
                padding: spacing.card,
                borderWidth: 1,
                borderColor: accentColor ?? colors.border,
                gap: spacing.gap,
            }}
        >
            {children}
        </View>
    );
}

export function SectionHeader({
    title,
    subtitle,
    icon,
}: {
    title: string;
    subtitle?: string;
    icon: IconName;
}) {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
                style={{
                    width: 34,
                    height: 34,
                    borderRadius: radii.md,
                    backgroundColor: `${colors.primary}22`,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <MaterialCommunityIcons name={icon} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{title}</Text>
                {!!subtitle && <Text style={{ color: colors.muted, marginTop: 2, lineHeight: 19 }}>{subtitle}</Text>}
            </View>
        </View>
    );
}

export function StatusBadge({
    label,
    color,
}: {
    label: string;
    color: string;
}) {
    return (
        <View
            style={{
                alignSelf: 'flex-start',
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
                backgroundColor: `${color}22`,
                borderWidth: 1,
                borderColor: color,
            }}
        >
            <Text style={{ color, fontWeight: '800', fontSize: 12 }}>{label}</Text>
        </View>
    );
}

export function IconMetric({
    icon,
    label,
    value,
    color,
}: {
    icon: IconName;
    label: string;
    value: string;
    color: string;
}) {
    return (
        <View
            style={{
                flex: 1,
                minWidth: 145,
                backgroundColor: colors.surface,
                borderRadius: radii.md,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 14,
                gap: 10,
            }}
        >
            <MaterialCommunityIcons name={icon} size={24} color={color} />
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700' }}>{label}</Text>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>{value}</Text>
        </View>
    );
}

export function CommandButton({
    label,
    icon,
    onPress,
    disabled,
    tone = 'default',
}: {
    label: string;
    icon: IconName;
    onPress: () => void;
    disabled?: boolean;
    tone?: 'default' | 'primary' | 'danger';
}) {
    const toneColor = tone === 'danger' ? colors.critical : tone === 'primary' ? colors.primary : colors.border;
    const isPrimary = tone === 'primary';
    const isDanger = tone === 'danger';
    const backgroundColor = isPrimary ? colors.primary : isDanger ? '#3f121b' : colors.surfaceAlt;
    const foregroundColor = isPrimary ? colors.background : colors.text;

    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            style={{
                flex: 1,
                minWidth: 118,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingVertical: 14,
                paddingHorizontal: 10,
                borderRadius: radii.md,
                backgroundColor,
                borderWidth: isPrimary ? 2 : 1,
                borderColor: isPrimary ? colors.text : toneColor,
                opacity: disabled ? 0.55 : 1,
            }}
        >
            <MaterialCommunityIcons name={icon} size={18} color={isPrimary ? colors.background : tone === 'default' ? colors.text : toneColor} />
            <Text style={{ color: foregroundColor, fontWeight: '900', flexShrink: 1, textAlign: 'center' }}>{label}</Text>
        </Pressable>
    );
}

export function SegmentedControl<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: Array<{ value: T; label: string; icon: IconName }>;
    onChange: (value: T) => void;
}) {
    return (
        <View
            style={{
                flexDirection: 'row',
                backgroundColor: colors.surfaceAlt,
                borderRadius: radii.md,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 4,
                gap: 4,
            }}
        >
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <Pressable
                        key={option.value}
                        onPress={() => onChange(option.value)}
                        style={{
                            flex: 1,
                            minHeight: 42,
                            borderRadius: radii.sm,
                            backgroundColor: active ? colors.primary : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'row',
                            gap: 6,
                            paddingHorizontal: 8,
                        }}
                    >
                        <MaterialCommunityIcons
                            name={option.icon}
                            size={17}
                            color={active ? colors.background : colors.muted}
                        />
                        <Text
                            style={{
                                color: active ? colors.background : colors.text,
                                fontWeight: '900',
                                fontSize: 13,
                            }}
                        >
                            {option.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

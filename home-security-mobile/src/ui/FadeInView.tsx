import React, { useCallback, useRef } from 'react';
import { Animated, ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from './theme';

export function FadeInView({
    children,
    style,
}: {
    children: React.ReactNode;
    style?: ViewStyle;
}) {
    const opacity = useRef(new Animated.Value(1)).current;
    const translateY = useRef(new Animated.Value(0)).current;

    useFocusEffect(
        useCallback(() => {
            opacity.setValue(0.35);
            translateY.setValue(8);

            Animated.parallel([
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: 240,
                    useNativeDriver: true,
                }),
                Animated.timing(translateY, {
                    toValue: 0,
                    duration: 240,
                    useNativeDriver: true,
                }),
            ]).start();
        }, [opacity, translateY])
    );

    return (
        <Animated.View
            style={[
                {
                    flex: 1,
                    backgroundColor: colors.background,
                    opacity,
                    transform: [{ translateY }],
                },
                style,
            ]}
        >
            {children}
        </Animated.View>
    );
}

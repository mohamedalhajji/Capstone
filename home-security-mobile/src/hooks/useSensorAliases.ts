import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';

const SENSOR_ALIAS_PREFIX = 'sensor-aliases-v1';

function keyFor(accountId?: string | number | null) {
    return `${SENSOR_ALIAS_PREFIX}:${accountId ?? 'anonymous'}`;
}

export function useSensorAliases(accountId?: string | number | null) {
    const [aliases, setAliasesState] = React.useState<Record<string, string>>({});
    const storageKey = keyFor(accountId);

    React.useEffect(() => {
        let active = true;
        AsyncStorage.getItem(storageKey)
            .then((stored) => {
                if (active) setAliasesState(stored ? JSON.parse(stored) : {});
            })
            .catch(() => {
                if (active) setAliasesState({});
            });
        return () => {
            active = false;
        };
    }, [storageKey]);

    const setAlias = React.useCallback(
        async (sensorId: string, label: string) => {
            const nextAliases = { ...aliases, [sensorId]: label.trim() };
            setAliasesState(nextAliases);
            await AsyncStorage.setItem(storageKey, JSON.stringify(nextAliases));
        },
        [aliases, storageKey]
    );

    return { aliases, setAlias };
}

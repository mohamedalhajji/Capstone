import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { HouseMapLayout } from '../types/houseMap';

const STORAGE_KEY_PREFIX = 'house-map-layout-v1';
const listeners = new Set<(layout: HouseMapLayout) => void>();

const emptyLayout: HouseMapLayout = {
    rooms: [],
    promptState: 'unseen',
};

function normalizeLayout(value: unknown): HouseMapLayout {
    if (!value || typeof value !== 'object') {
        return emptyLayout;
    }

    const candidate = value as Partial<HouseMapLayout>;
    return {
        rooms: Array.isArray(candidate.rooms) ? candidate.rooms : [],
        promptState: candidate.promptState ?? 'unseen',
    };
}

function storageKey(accountKey?: string | number | null) {
    return `${STORAGE_KEY_PREFIX}:${accountKey ?? 'anonymous'}`;
}

export function useHouseMap(accountKey?: string | number | null) {
    const [layout, setLayoutState] = React.useState<HouseMapLayout>(emptyLayout);
    const [loading, setLoading] = React.useState(true);
    const key = storageKey(accountKey);

    React.useEffect(() => {
        let active = true;

        setLoading(true);
        AsyncStorage.getItem(key)
            .then((stored) => {
                if (!active) return;
                setLayoutState(stored ? normalizeLayout(JSON.parse(stored)) : emptyLayout);
            })
            .catch(() => {
                if (active) setLayoutState(emptyLayout);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [key]);

    React.useEffect(() => {
        const listener = (nextLayout: HouseMapLayout) => setLayoutState(nextLayout);
        listeners.add(listener);

        return () => {
            listeners.delete(listener);
        };
    }, []);

    const setLayout = React.useCallback(async (nextLayout: HouseMapLayout) => {
        setLayoutState(nextLayout);
        listeners.forEach((listener) => listener(nextLayout));
        await AsyncStorage.setItem(key, JSON.stringify(nextLayout));
    }, [key]);

    const updateLayout = React.useCallback(
        async (updater: (current: HouseMapLayout) => HouseMapLayout) => {
            const nextLayout = updater(layout);
            await setLayout(nextLayout);
        },
        [layout, setLayout]
    );

    return {
        layout,
        loading,
        setLayout,
        updateLayout,
    };
}

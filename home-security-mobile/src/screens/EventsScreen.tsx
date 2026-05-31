import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEvents } from '../hooks/useEvents';
import { EventItem } from '../types/event';
import { Card, ScreenState, StatusBadge } from '../ui/components';
import { colors, spacing } from '../ui/theme';

const severityColors: Record<EventItem['severity'], string> = {
    info: colors.primary,
    low: colors.primary,
    warning: colors.warning,
    high: colors.warning,
    critical: colors.critical,
};

function eventIcon(event: EventItem): keyof typeof MaterialCommunityIcons.glyphMap {
    if (event.type.includes('flame')) return 'fire-alert';
    if (event.type.includes('gas')) return 'smoke-detector-alert-outline';
    if (event.type.includes('access')) return 'badge-account-horizontal-outline';
    if (event.type.includes('motion')) return 'motion-sensor';
    if (event.type.includes('door')) return 'door-open';
    if (event.type.includes('vibration')) return 'vibrate';
    return 'alert-circle-outline';
}

function EventRow({ event }: { event: EventItem }) {
    const color = severityColors[event.severity] ?? colors.muted;

    return (
        <Card accentColor={event.severity === 'critical' ? colors.critical : undefined}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <View
                    style={{
                        width: 42,
                        height: 42,
                        borderRadius: 12,
                        backgroundColor: `${color}22`,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <MaterialCommunityIcons name={eventIcon(event)} size={23} color={color} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900', flexShrink: 1 }}>
                            {event.title}
                        </Text>
                        <StatusBadge label={event.severity.toUpperCase()} color={color} />
                    </View>
                    <Text style={{ color: colors.muted, lineHeight: 20 }}>{event.message}</Text>
                    {!!event.actionTaken && (
                        <Text style={{ color: colors.text }}>Action: {event.actionTaken}</Text>
                    )}
                    {!!event.location && (
                        <Text style={{ color: colors.subtle }}>Location: {event.location}</Text>
                    )}
                    <Text style={{ color: colors.subtle, fontSize: 12 }}>{event.createdAt}</Text>
                </View>
            </View>
        </Card>
    );
}

export default function EventsScreen() {
    const { data: events, isLoading, isError } = useEvents();

    if (isLoading) {
        return <ScreenState title="Loading event history" loading />;
    }

    if (isError) {
        return <ScreenState title="Events unavailable" message="The app could not read event history from the backend." />;
    }

    return (
        <ScrollView contentContainerStyle={{ padding: spacing.page, gap: spacing.gap, backgroundColor: colors.background }}>
            {events?.length ? (
                events.map((event) => <EventRow key={event.id} event={event} />)
            ) : (
                <ScreenState title="No events yet" message="Trigger a simulation or ESP32 sensor event to populate this list." />
            )}
        </ScrollView>
    );
}

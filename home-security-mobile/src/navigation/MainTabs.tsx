import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import DashboardScreen from '../screens/DashboardScreen';
import SensorsScreen from '../screens/SensorsScreen';
import EventsScreen from '../screens/EventsScreen';
import SimulationScreen from '../screens/SimulationScreen';
import AccessScreen from '../screens/AccessScreen';
import { colors } from '../ui/theme';

export type MainTabParamList = {
    Dashboard: undefined;
    Sensors: undefined;
    Events: undefined;
    Access: undefined;
    Simulation: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const tabIcons: Record<keyof MainTabParamList, keyof typeof MaterialCommunityIcons.glyphMap> = {
    Dashboard: 'view-dashboard-outline',
    Sensors: 'radar',
    Events: 'timeline-alert-outline',
    Access: 'badge-account-horizontal-outline',
    Simulation: 'test-tube',
};

export default function MainTabs() {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerTitleAlign: 'left',
                headerStyle: {
                    backgroundColor: colors.background,
                    shadowColor: 'transparent',
                },
                headerTitleStyle: {
                    color: colors.text,
                    fontWeight: '900',
                },
                headerTintColor: colors.text,
                tabBarShowLabel: false,
                tabBarStyle: {
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                    height: 86,
                    paddingTop: 8,
                    paddingBottom: 22,
                },
                tabBarItemStyle: {
                    height: 56,
                    marginBottom: 8,
                    justifyContent: 'center',
                },
                tabBarIconStyle: {
                    marginTop: 0,
                },
                tabBarIcon: ({ color, size }) => (
                    <MaterialCommunityIcons
                        name={tabIcons[route.name as keyof MainTabParamList]}
                        size={size + 3}
                        color={color}
                    />
                ),
                tabBarActiveTintColor: colors.primary,
                tabBarInactiveTintColor: colors.subtle,
                animation: 'fade',
                transitionSpec: {
                    animation: 'timing',
                    config: {
                        duration: 180,
                    },
                },
                sceneStyle: {
                    backgroundColor: colors.background,
                },
            })}
        >
            <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Home Security' }} />
            <Tab.Screen name="Sensors" component={SensorsScreen} options={{ title: 'Sensors' }} />
            <Tab.Screen name="Events" component={EventsScreen} options={{ title: 'Event History' }} />
            <Tab.Screen name="Access" component={AccessScreen} options={{ title: 'Access Logs' }} />
            <Tab.Screen name="Simulation" component={SimulationScreen} options={{ title: 'Test Panel' }} />
        </Tab.Navigator>
    );
}

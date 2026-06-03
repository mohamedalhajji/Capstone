import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import DashboardScreen from '../screens/DashboardScreen';
import ActivityScreen from '../screens/ActivityScreen';
import ToolsScreen from '../screens/ToolsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { colors } from '../ui/theme';

export type MainTabParamList = {
    Dashboard: undefined;
    Activity: undefined;
    Tools: undefined;
    Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const tabIcons: Record<keyof MainTabParamList, keyof typeof MaterialCommunityIcons.glyphMap> = {
    Dashboard: 'shield-home-outline',
    Activity: 'timeline-clock-outline',
    Tools: 'tools',
    Settings: 'cog-outline',
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
                tabBarShowLabel: true,
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: '800',
                    marginTop: 2,
                },
                tabBarStyle: {
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                    height: 82,
                    paddingTop: 6,
                    paddingBottom: 14,
                },
                tabBarItemStyle: {
                    height: 58,
                    justifyContent: 'center',
                },
                tabBarLabelPosition: 'below-icon',
                tabBarIconStyle: {
                    marginTop: 4,
                },
                tabBarBadgeStyle: {
                    backgroundColor: colors.critical,
                },
                tabBarButtonTestID: route.name,
                headerTitleContainerStyle: {
                    paddingLeft: 4,
                    justifyContent: 'center',
                },
                tabBarIcon: ({ color, size }) => (
                    <MaterialCommunityIcons
                        name={tabIcons[route.name as keyof MainTabParamList]}
                        size={size + 1}
                        color={color}
                    />
                ),
                tabBarActiveTintColor: colors.primary,
                tabBarInactiveTintColor: colors.subtle,
                animation: 'none',
                lazy: false,
                freezeOnBlur: false,
                sceneStyle: {
                    backgroundColor: colors.background,
                },
            })}
        >
            <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Home' }} />
            <Tab.Screen name="Activity" component={ActivityScreen} options={{ title: 'Activity' }} />
            <Tab.Screen name="Tools" component={ToolsScreen} options={{ title: 'Tools' }} />
            <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
        </Tab.Navigator>
    );
}
